/**
 * Notification Services Index
 * Exports all notification delivery services
 */

export {
  EmailNotifier,
  createEmailNotifier,
  resetEmailNotifier,
  type EmailConfig,
  type EmailTemplate,
} from './emailNotifier.js';

export {
  SlackNotifier,
  createSlackNotifier,
  resetSlackNotifier,
  type SlackConfig,
  type SlackMessage,
  type SlackBlock,
  type SlackAttachment,
} from './slackNotifier.js';

export {
  TeamsNotifier,
  createTeamsNotifier,
  resetTeamsNotifier,
  type TeamsConfig,
  type TeamsMessage,
  type TeamsAdaptiveCard,
} from './teamsNotifier.js';
