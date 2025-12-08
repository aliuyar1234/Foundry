/**
 * Google Workspace Event Normalizer
 * Task: T034
 *
 * Normalizes events from Google Workspace APIs into a consistent format.
 * Handles Gmail, Calendar, Drive, and Admin SDK events.
 */

import { ExtractedEvent } from '../base/connector';

export interface NormalizedEvent {
  id: string;
  type: string;
  subtype?: string;
  timestamp: Date;
  source: 'google_workspace';
  service: 'gmail' | 'calendar' | 'drive' | 'admin';
  actor: {
    id?: string;
    email?: string;
    name?: string;
    type: 'user' | 'service_account' | 'system';
  };
  target?: {
    id: string;
    type: string;
    name?: string;
  };
  context: {
    organizationId: string;
    instanceId: string;
    batchId?: string;
  };
  data: Record<string, unknown>;
  relationships?: Array<{
    type: string;
    targetId: string;
    targetType: string;
  }>;
}

export interface NormalizationOptions {
  organizationId: string;
  instanceId: string;
  batchId?: string;
  includeRawData?: boolean;
}

export class GoogleEventNormalizer {
  /**
   * Normalize Gmail event
   */
  normalizeGmailEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedEvent {
    const metadata = event.metadata as Record<string, unknown>;

    const normalized: NormalizedEvent = {
      id: `gmail:${metadata.messageId}`,
      type: 'communication',
      subtype: this.getEmailSubtype(event.type),
      timestamp: event.timestamp,
      source: 'google_workspace',
      service: 'gmail',
      actor: {
        email: metadata.from as string,
        name: metadata.fromName as string | undefined,
        type: 'user',
      },
      target: metadata.messageId
        ? {
            id: metadata.messageId as string,
            type: 'email',
            name: metadata.subject as string | undefined,
          }
        : undefined,
      context: {
        organizationId: options.organizationId,
        instanceId: options.instanceId,
        batchId: options.batchId,
      },
      data: {
        messageId: metadata.messageId,
        threadId: metadata.threadId,
        subject: metadata.subject,
        recipients: metadata.to,
        ccRecipients: metadata.cc,
        hasAttachments: metadata.hasAttachments,
        labelIds: metadata.labelIds,
        snippet: metadata.snippet,
        recipientCount: metadata.recipientCount,
        isReply: metadata.isReply,
        isForward: metadata.isForward,
      },
      relationships: this.buildEmailRelationships(metadata),
    };

    return normalized;
  }

  /**
   * Normalize Calendar event
   */
  normalizeCalendarEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedEvent {
    const metadata = event.metadata as Record<string, unknown>;

    const normalized: NormalizedEvent = {
      id: `calendar:${metadata.eventId}`,
      type: 'meeting',
      subtype: this.getCalendarSubtype(event.type, metadata),
      timestamp: event.timestamp,
      source: 'google_workspace',
      service: 'calendar',
      actor: {
        email: metadata.organizer as string,
        name: metadata.organizerName as string | undefined,
        type: 'user',
      },
      target: metadata.eventId
        ? {
            id: metadata.eventId as string,
            type: 'calendar_event',
            name: metadata.summary as string | undefined,
          }
        : undefined,
      context: {
        organizationId: options.organizationId,
        instanceId: options.instanceId,
        batchId: options.batchId,
      },
      data: {
        eventId: metadata.eventId,
        calendarId: metadata.calendarId,
        summary: metadata.summary,
        description: metadata.description,
        location: metadata.location,
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        isAllDay: metadata.isAllDay,
        status: metadata.status,
        visibility: metadata.visibility,
        attendees: metadata.attendees,
        attendeeCount: metadata.attendeeCount,
        hasConference: !!metadata.conferenceData,
        conferenceType: (metadata.conferenceData as any)?.type,
        isRecurring: !!metadata.recurrence || !!metadata.recurringEventId,
      },
      relationships: this.buildCalendarRelationships(metadata),
    };

    return normalized;
  }

  /**
   * Normalize Drive event
   */
  normalizeDriveEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedEvent {
    const metadata = event.metadata as Record<string, unknown>;

    const normalized: NormalizedEvent = {
      id: `drive:${metadata.fileId}`,
      type: 'document',
      subtype: this.getDriveSubtype(event.type, metadata),
      timestamp: event.timestamp,
      source: 'google_workspace',
      service: 'drive',
      actor: {
        email: metadata.lastModifiedBy as string,
        type: 'user',
      },
      target: metadata.fileId
        ? {
            id: metadata.fileId as string,
            type: this.getDriveTargetType(metadata.mimeType as string),
            name: metadata.fileName as string | undefined,
          }
        : undefined,
      context: {
        organizationId: options.organizationId,
        instanceId: options.instanceId,
        batchId: options.batchId,
      },
      data: {
        fileId: metadata.fileId,
        fileName: metadata.fileName,
        mimeType: metadata.mimeType,
        driveId: metadata.driveId,
        parentId: metadata.parentId,
        size: metadata.size,
        webViewLink: metadata.webViewLink,
        isFolder: metadata.isFolder,
        shared: metadata.shared,
        createdTime: metadata.createdTime,
        modifiedTime: metadata.modifiedTime,
      },
      relationships: this.buildDriveRelationships(metadata),
    };

    return normalized;
  }

  /**
   * Normalize any Google event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const source = metadata.source as string;

    if (source !== 'google') {
      throw new Error(`Cannot normalize non-Google event: ${source}`);
    }

    // Determine service from event type
    if (event.type.startsWith('email.')) {
      return this.normalizeGmailEvent(event, options);
    }

    if (event.type.startsWith('calendar.')) {
      return this.normalizeCalendarEvent(event, options);
    }

    if (event.type.startsWith('drive.')) {
      return this.normalizeDriveEvent(event, options);
    }

    // Generic normalization for unknown types
    return this.normalizeGenericEvent(event, options);
  }

  /**
   * Normalize batch of events
   */
  normalizeEvents(
    events: ExtractedEvent[],
    options: NormalizationOptions
  ): NormalizedEvent[] {
    return events
      .map((event) => {
        try {
          return this.normalizeEvent(event, options);
        } catch (error) {
          console.warn(`Failed to normalize event: ${error}`);
          return null;
        }
      })
      .filter((event): event is NormalizedEvent => event !== null);
  }

  /**
   * Get email subtype from event type
   */
  private getEmailSubtype(eventType: string): string {
    switch (eventType) {
      case 'email.sent':
        return 'sent';
      case 'email.received':
        return 'received';
      case 'email.drafted':
        return 'drafted';
      case 'email.deleted':
        return 'deleted';
      default:
        return 'unknown';
    }
  }

  /**
   * Get calendar event subtype
   */
  private getCalendarSubtype(
    eventType: string,
    metadata: Record<string, unknown>
  ): string {
    if (eventType === 'calendar.event.cancelled') {
      return 'cancelled';
    }

    const hasConference = !!metadata.conferenceData;
    const attendeeCount = (metadata.attendeeCount as number) || 0;

    if (hasConference) {
      return 'video_meeting';
    }

    if (attendeeCount > 2) {
      return 'group_meeting';
    }

    if (attendeeCount === 2) {
      return 'one_on_one';
    }

    return 'appointment';
  }

  /**
   * Get drive event subtype
   */
  private getDriveSubtype(
    eventType: string,
    metadata: Record<string, unknown>
  ): string {
    if (eventType.includes('permission')) {
      return 'permission_change';
    }

    if (eventType.includes('sharing')) {
      return 'sharing_update';
    }

    if (metadata.isFolder) {
      return 'folder';
    }

    const mimeType = metadata.mimeType as string;
    if (mimeType?.includes('document')) return 'document';
    if (mimeType?.includes('spreadsheet')) return 'spreadsheet';
    if (mimeType?.includes('presentation')) return 'presentation';
    if (mimeType?.includes('form')) return 'form';
    if (mimeType?.includes('image')) return 'image';
    if (mimeType?.includes('video')) return 'video';
    if (mimeType?.includes('pdf')) return 'pdf';

    return 'file';
  }

  /**
   * Get drive target type from mime type
   */
  private getDriveTargetType(mimeType: string): string {
    if (mimeType === 'application/vnd.google-apps.folder') {
      return 'folder';
    }
    if (mimeType?.includes('google-apps.document')) {
      return 'google_doc';
    }
    if (mimeType?.includes('google-apps.spreadsheet')) {
      return 'google_sheet';
    }
    if (mimeType?.includes('google-apps.presentation')) {
      return 'google_slides';
    }
    return 'file';
  }

  /**
   * Build email relationships
   */
  private buildEmailRelationships(
    metadata: Record<string, unknown>
  ): NormalizedEvent['relationships'] {
    const relationships: NormalizedEvent['relationships'] = [];

    // Thread relationship
    if (metadata.threadId) {
      relationships.push({
        type: 'belongs_to_thread',
        targetId: `thread:${metadata.threadId}`,
        targetType: 'email_thread',
      });
    }

    // Recipient relationships
    const recipients = (metadata.to as string[]) || [];
    for (const recipient of recipients) {
      relationships.push({
        type: 'sent_to',
        targetId: recipient,
        targetType: 'user',
      });
    }

    // CC relationships
    const ccRecipients = (metadata.cc as string[]) || [];
    for (const cc of ccRecipients) {
      relationships.push({
        type: 'cc_to',
        targetId: cc,
        targetType: 'user',
      });
    }

    return relationships;
  }

  /**
   * Build calendar relationships
   */
  private buildCalendarRelationships(
    metadata: Record<string, unknown>
  ): NormalizedEvent['relationships'] {
    const relationships: NormalizedEvent['relationships'] = [];

    // Calendar relationship
    if (metadata.calendarId) {
      relationships.push({
        type: 'belongs_to_calendar',
        targetId: metadata.calendarId as string,
        targetType: 'calendar',
      });
    }

    // Attendee relationships
    const attendees = (metadata.attendees as Array<{ email: string }>) || [];
    for (const attendee of attendees) {
      relationships.push({
        type: 'attendee',
        targetId: attendee.email,
        targetType: 'user',
      });
    }

    // Recurring event relationship
    if (metadata.recurringEventId) {
      relationships.push({
        type: 'instance_of',
        targetId: `calendar:${metadata.recurringEventId}`,
        targetType: 'recurring_event',
      });
    }

    return relationships;
  }

  /**
   * Build drive relationships
   */
  private buildDriveRelationships(
    metadata: Record<string, unknown>
  ): NormalizedEvent['relationships'] {
    const relationships: NormalizedEvent['relationships'] = [];

    // Parent folder relationship
    if (metadata.parentId) {
      relationships.push({
        type: 'in_folder',
        targetId: `drive:${metadata.parentId}`,
        targetType: 'folder',
      });
    }

    // Shared drive relationship
    if (metadata.driveId) {
      relationships.push({
        type: 'in_drive',
        targetId: metadata.driveId as string,
        targetType: 'shared_drive',
      });
    }

    return relationships;
  }

  /**
   * Generic event normalization
   */
  private normalizeGenericEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedEvent {
    const metadata = event.metadata as Record<string, unknown>;

    return {
      id: `google:${event.targetId || Date.now()}`,
      type: event.type,
      timestamp: event.timestamp,
      source: 'google_workspace',
      service: 'gmail', // Default
      actor: {
        email: event.actorId,
        type: 'user',
      },
      target: event.targetId
        ? {
            id: event.targetId,
            type: 'unknown',
          }
        : undefined,
      context: {
        organizationId: options.organizationId,
        instanceId: options.instanceId,
        batchId: options.batchId,
      },
      data: metadata,
    };
  }
}

/**
 * Create event normalizer
 */
export function createGoogleEventNormalizer(): GoogleEventNormalizer {
  return new GoogleEventNormalizer();
}
