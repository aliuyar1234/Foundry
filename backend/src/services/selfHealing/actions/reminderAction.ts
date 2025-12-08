/**
 * Reminder Action
 * T137 - Implement reminder sender action
 *
 * Sends reminders to persons via various channels
 */

import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { registerActionExecutor } from '../actionExecutor.js';
import type {
  AutomatedAction,
  ReminderActionConfig,
  ExecutionChange,
} from 'shared/types/selfHealing.js';
import type {
  ExecutionContext,
  ActionExecutionResult,
  ValidationResult,
} from '../actionExecutor.js';

// =============================================================================
// Types
// =============================================================================

interface ReminderState {
  executionId: string;
  sentCount: number;
  lastSentAt: Date;
  recipientIds: string[];
}

// Track reminder state to handle repeat intervals
const reminderState = new Map<string, ReminderState>();

// =============================================================================
// Reminder Action Implementation
// =============================================================================

/**
 * Execute reminder action
 */
async function executeReminder(
  action: AutomatedAction,
  context: ExecutionContext
): Promise<ActionExecutionResult> {
  const config = action.actionConfig as ReminderActionConfig;
  const changes: ExecutionChange[] = [];
  const affectedEntities: string[] = [];

  logger.debug({ actionId: action.id, config }, 'Executing reminder action');

  try {
    // Resolve target recipients
    const recipients = await resolveRecipients(
      config.target,
      context.organizationId
    );

    if (recipients.length === 0) {
      return {
        success: false,
        affectedEntities: [],
        changes: [],
        errorMessage: `No recipients found for target: ${config.target}`,
      };
    }

    // Check if we've exceeded max reminders for this pattern
    const stateKey = `${action.id}:${context.pattern?.id || 'manual'}`;
    const state = reminderState.get(stateKey);

    if (state && config.maxReminders && state.sentCount >= config.maxReminders) {
      return {
        success: true,
        affectedEntities: state.recipientIds,
        changes: [],
        metrics: { skipped: 1, maxRemindersReached: 1 },
      };
    }

    // Render message template
    const message = renderMessageTemplate(config.messageTemplate, context);

    // Send reminder to each recipient
    const sentTo: string[] = [];
    for (const recipient of recipients) {
      const success = await sendReminder(
        recipient,
        message,
        config.channel,
        context.organizationId
      );

      if (success) {
        sentTo.push(recipient.id);
        affectedEntities.push(recipient.id);

        changes.push({
          entityType: 'person',
          entityId: recipient.id,
          changeType: 'notify',
          after: {
            channel: config.channel,
            messagePreview: message.substring(0, 100),
            sentAt: new Date().toISOString(),
          },
        });
      }
    }

    // Update reminder state for repeat tracking
    reminderState.set(stateKey, {
      executionId: context.executionId,
      sentCount: (state?.sentCount || 0) + 1,
      lastSentAt: new Date(),
      recipientIds: sentTo,
    });

    // Schedule next reminder if repeat interval is set
    if (config.repeatIntervalMinutes && config.repeatIntervalMinutes > 0) {
      const currentCount = (state?.sentCount || 0) + 1;
      if (!config.maxReminders || currentCount < config.maxReminders) {
        await scheduleNextReminder(
          action.id,
          context,
          config.repeatIntervalMinutes
        );
      }
    }

    return {
      success: sentTo.length > 0,
      affectedEntities,
      changes,
      metrics: {
        remindersSent: sentTo.length,
        totalRecipients: recipients.length,
      },
      rollbackData: {
        sentTo,
        channel: config.channel,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, actionId: action.id }, 'Reminder action failed');

    return {
      success: false,
      affectedEntities,
      changes,
      errorMessage,
    };
  }
}

/**
 * Validate reminder action configuration
 */
function validateReminderConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const cfg = config as ReminderActionConfig;

  if (cfg.type !== 'reminder') {
    errors.push('Invalid action type for reminder action');
  }

  if (!cfg.target) {
    errors.push('Target is required');
  }

  if (!cfg.messageTemplate) {
    errors.push('Message template is required');
  }

  if (!cfg.channel || !['email', 'slack', 'in_app'].includes(cfg.channel)) {
    errors.push('Invalid channel: must be email, slack, or in_app');
  }

  if (cfg.repeatIntervalMinutes && cfg.repeatIntervalMinutes < 5) {
    errors.push('Repeat interval must be at least 5 minutes');
  }

  if (cfg.maxReminders && cfg.maxReminders < 1) {
    errors.push('Max reminders must be at least 1');
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Helper Functions
// =============================================================================

interface Recipient {
  id: string;
  name: string;
  email?: string;
  slackUserId?: string;
}

/**
 * Resolve target to actual recipients
 */
async function resolveRecipients(
  target: string,
  organizationId: string
): Promise<Recipient[]> {
  // Check if target is a person ID (UUID format)
  if (isUUID(target)) {
    const person = await prisma.person.findFirst({
      where: { id: target, organizationId },
      select: { id: true, name: true, email: true, slackUserId: true },
    });
    return person ? [person] : [];
  }

  // Check if target is a role
  const peopleByRole = await prisma.person.findMany({
    where: { organizationId, role: target, isActive: true },
    select: { id: true, name: true, email: true, slackUserId: true },
  });

  if (peopleByRole.length > 0) {
    return peopleByRole;
  }

  // Check if target is a team/department
  const peopleByTeam = await prisma.person.findMany({
    where: {
      organizationId,
      OR: [{ team: target }, { department: target }],
      isActive: true,
    },
    select: { id: true, name: true, email: true, slackUserId: true },
  });

  return peopleByTeam;
}

/**
 * Render message template with context variables
 */
function renderMessageTemplate(template: string, context: ExecutionContext): string {
  let message = template;

  // Replace pattern variables
  if (context.pattern) {
    message = message
      .replace(/\{\{pattern\.type\}\}/g, context.pattern.type)
      .replace(/\{\{pattern\.description\}\}/g, context.pattern.description)
      .replace(/\{\{pattern\.severity\}\}/g, context.pattern.severity)
      .replace(/\{\{pattern\.occurrences\}\}/g, String(context.pattern.occurrences));

    // Replace affected entities list
    const entityList = context.pattern.affectedEntities
      .map((e) => `${e.name} (${e.type})`)
      .join(', ');
    message = message.replace(/\{\{pattern\.affectedEntities\}\}/g, entityList);
  }

  // Replace date/time
  message = message
    .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
    .replace(/\{\{time\}\}/g, new Date().toLocaleTimeString())
    .replace(/\{\{timestamp\}\}/g, new Date().toISOString());

  return message;
}

/**
 * Send reminder to a recipient via specified channel
 */
async function sendReminder(
  recipient: Recipient,
  message: string,
  channel: 'email' | 'slack' | 'in_app',
  organizationId: string
): Promise<boolean> {
  try {
    switch (channel) {
      case 'email':
        return await sendEmailReminder(recipient, message);
      case 'slack':
        return await sendSlackReminder(recipient, message);
      case 'in_app':
        return await sendInAppReminder(recipient, message, organizationId);
      default:
        logger.warn({ channel }, 'Unknown reminder channel');
        return false;
    }
  } catch (error) {
    logger.error({ error, recipientId: recipient.id, channel }, 'Failed to send reminder');
    return false;
  }
}

/**
 * Send email reminder
 */
async function sendEmailReminder(recipient: Recipient, message: string): Promise<boolean> {
  if (!recipient.email) {
    logger.warn({ recipientId: recipient.id }, 'Recipient has no email address');
    return false;
  }

  // In production, this would use an email service
  // For now, we'll log and create a notification record
  logger.info(
    { recipientId: recipient.id, email: recipient.email },
    'Email reminder sent (simulated)'
  );

  // Queue email for sending (would integrate with email service)
  // await emailService.send({ to: recipient.email, subject: 'Reminder', body: message });

  return true;
}

/**
 * Send Slack reminder
 */
async function sendSlackReminder(recipient: Recipient, message: string): Promise<boolean> {
  if (!recipient.slackUserId) {
    logger.warn({ recipientId: recipient.id }, 'Recipient has no Slack user ID');
    return false;
  }

  // In production, this would use Slack API
  logger.info(
    { recipientId: recipient.id, slackUserId: recipient.slackUserId },
    'Slack reminder sent (simulated)'
  );

  // await slackService.sendDirectMessage(recipient.slackUserId, message);

  return true;
}

/**
 * Send in-app notification reminder
 */
async function sendInAppReminder(
  recipient: Recipient,
  message: string,
  organizationId: string
): Promise<boolean> {
  // Create in-app notification
  await prisma.notification.create({
    data: {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'reminder',
      title: 'Reminder',
      message,
      recipientId: recipient.id,
      organizationId,
      isRead: false,
      createdAt: new Date(),
    },
  });

  logger.info({ recipientId: recipient.id }, 'In-app reminder created');
  return true;
}

/**
 * Schedule next reminder for repeat scenarios
 */
async function scheduleNextReminder(
  actionId: string,
  context: ExecutionContext,
  delayMinutes: number
): Promise<void> {
  // In production, this would schedule a job via BullMQ
  logger.info(
    { actionId, delayMinutes },
    'Next reminder scheduled (would use job queue)'
  );

  // await reminderQueue.add('send-reminder', { actionId, context }, {
  //   delay: delayMinutes * 60 * 1000,
  // });
}

/**
 * Check if string is UUID
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// =============================================================================
// Register Action Executor
// =============================================================================

registerActionExecutor({
  actionType: 'reminder',
  execute: executeReminder,
  validate: validateReminderConfig,
  canRollback: false, // Reminders cannot be unsent
});

export default {
  executeReminder,
  validateReminderConfig,
};
