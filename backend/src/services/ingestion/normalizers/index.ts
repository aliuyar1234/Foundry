/**
 * Event Type Normalizers
 * Standardizes event types from different connectors into unified format
 */

export interface NormalizedEvent {
  type: NormalizedEventType;
  subtype?: string;
  timestamp: Date;
  actorId: string;
  actorEmail?: string;
  targetIds: string[];
  targetEmails: string[];
  metadata: Record<string, unknown>;
  rawType: string;
  source: string;
}

export enum NormalizedEventType {
  // Communication events
  EMAIL_SENT = 'communication.email.sent',
  EMAIL_RECEIVED = 'communication.email.received',
  MESSAGE_SENT = 'communication.message.sent',
  MESSAGE_RECEIVED = 'communication.message.received',
  CALL_STARTED = 'communication.call.started',
  CALL_ENDED = 'communication.call.ended',

  // Meeting events
  MEETING_CREATED = 'meeting.created',
  MEETING_UPDATED = 'meeting.updated',
  MEETING_CANCELLED = 'meeting.cancelled',
  MEETING_ATTENDED = 'meeting.attended',

  // Document events
  DOCUMENT_CREATED = 'document.created',
  DOCUMENT_UPDATED = 'document.updated',
  DOCUMENT_SHARED = 'document.shared',
  DOCUMENT_VIEWED = 'document.viewed',

  // Task events
  TASK_CREATED = 'task.created',
  TASK_ASSIGNED = 'task.assigned',
  TASK_COMPLETED = 'task.completed',
  TASK_UPDATED = 'task.updated',

  // Approval events
  APPROVAL_REQUESTED = 'approval.requested',
  APPROVAL_GRANTED = 'approval.granted',
  APPROVAL_DENIED = 'approval.denied',

  // Generic
  UNKNOWN = 'unknown',
}

export interface EventNormalizer {
  source: string;
  normalize(rawEvent: Record<string, unknown>): NormalizedEvent;
  canNormalize(rawEvent: Record<string, unknown>): boolean;
}

/**
 * M365 Email Event Normalizer
 */
export class M365EmailNormalizer implements EventNormalizer {
  source = 'M365';

  canNormalize(rawEvent: Record<string, unknown>): boolean {
    const type = rawEvent.type as string;
    return type?.startsWith('email.');
  }

  normalize(rawEvent: Record<string, unknown>): NormalizedEvent {
    const type = rawEvent.type as string;
    const metadata = rawEvent.metadata as Record<string, unknown> || {};

    const normalizedType = type === 'email.sent'
      ? NormalizedEventType.EMAIL_SENT
      : NormalizedEventType.EMAIL_RECEIVED;

    const recipients = (metadata.recipients as string[]) || [];
    const recipientEmails = recipients.map(r => this.extractEmail(r)).filter(Boolean) as string[];

    return {
      type: normalizedType,
      subtype: metadata.hasAttachments ? 'with_attachment' : undefined,
      timestamp: new Date(rawEvent.timestamp as string),
      actorId: rawEvent.actorId as string,
      actorEmail: this.extractEmail(rawEvent.actorId as string),
      targetIds: recipients,
      targetEmails: recipientEmails,
      metadata: {
        subject: metadata.subject,
        hasAttachments: metadata.hasAttachments,
        importance: metadata.importance,
        conversationId: metadata.conversationId,
        threadSize: metadata.threadSize,
      },
      rawType: type,
      source: this.source,
    };
  }

  private extractEmail(identifier: string): string | undefined {
    if (!identifier) return undefined;
    // If it's already an email, return it
    if (identifier.includes('@')) return identifier;
    return undefined;
  }
}

/**
 * M365 Calendar Event Normalizer
 */
export class M365CalendarNormalizer implements EventNormalizer {
  source = 'M365';

  canNormalize(rawEvent: Record<string, unknown>): boolean {
    const type = rawEvent.type as string;
    return type?.startsWith('calendar.') || type?.startsWith('meeting.');
  }

  normalize(rawEvent: Record<string, unknown>): NormalizedEvent {
    const type = rawEvent.type as string;
    const metadata = rawEvent.metadata as Record<string, unknown> || {};

    let normalizedType: NormalizedEventType;
    switch (type) {
      case 'calendar.event.created':
      case 'meeting.created':
        normalizedType = NormalizedEventType.MEETING_CREATED;
        break;
      case 'calendar.event.updated':
      case 'meeting.updated':
        normalizedType = NormalizedEventType.MEETING_UPDATED;
        break;
      case 'calendar.event.cancelled':
      case 'meeting.cancelled':
        normalizedType = NormalizedEventType.MEETING_CANCELLED;
        break;
      case 'meeting.attended':
        normalizedType = NormalizedEventType.MEETING_ATTENDED;
        break;
      default:
        normalizedType = NormalizedEventType.MEETING_CREATED;
    }

    const attendees = (metadata.attendees as Array<{ email?: string; id?: string }>) || [];
    const attendeeEmails = attendees.map(a => a.email).filter(Boolean) as string[];
    const attendeeIds = attendees.map(a => a.id || a.email).filter(Boolean) as string[];

    return {
      type: normalizedType,
      subtype: metadata.isOnlineMeeting ? 'online' : 'in_person',
      timestamp: new Date(rawEvent.timestamp as string),
      actorId: rawEvent.actorId as string,
      actorEmail: this.extractEmail(rawEvent.actorId as string),
      targetIds: attendeeIds,
      targetEmails: attendeeEmails,
      metadata: {
        subject: metadata.subject,
        duration: metadata.duration,
        isOnlineMeeting: metadata.isOnlineMeeting,
        isRecurring: metadata.isRecurring,
        location: metadata.location,
        responseStatus: metadata.responseStatus,
      },
      rawType: type,
      source: this.source,
    };
  }

  private extractEmail(identifier: string): string | undefined {
    if (!identifier) return undefined;
    if (identifier.includes('@')) return identifier;
    return undefined;
  }
}

/**
 * Event Normalizer Registry
 */
export class EventNormalizerRegistry {
  private normalizers: EventNormalizer[] = [];

  register(normalizer: EventNormalizer): void {
    this.normalizers.push(normalizer);
  }

  normalize(rawEvent: Record<string, unknown>, source: string): NormalizedEvent {
    // Find matching normalizer
    const normalizer = this.normalizers.find(
      n => n.source === source && n.canNormalize(rawEvent)
    );

    if (normalizer) {
      return normalizer.normalize(rawEvent);
    }

    // Fallback to generic normalization
    return this.genericNormalize(rawEvent, source);
  }

  private genericNormalize(
    rawEvent: Record<string, unknown>,
    source: string
  ): NormalizedEvent {
    return {
      type: NormalizedEventType.UNKNOWN,
      timestamp: new Date(rawEvent.timestamp as string || Date.now()),
      actorId: rawEvent.actorId as string || 'unknown',
      targetIds: [],
      targetEmails: [],
      metadata: rawEvent.metadata as Record<string, unknown> || {},
      rawType: rawEvent.type as string || 'unknown',
      source,
    };
  }
}

/**
 * Create pre-configured normalizer registry
 */
export function createNormalizerRegistry(): EventNormalizerRegistry {
  const registry = new EventNormalizerRegistry();
  registry.register(new M365EmailNormalizer());
  registry.register(new M365CalendarNormalizer());
  return registry;
}
