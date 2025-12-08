/**
 * HubSpot Engagement Tracker
 * Task: T098
 *
 * Extracts engagements including calls, emails, meetings, and notes.
 * Tracks activity timeline and interaction history.
 */

import { ExtractedEvent } from '../../base/connector';
import { HubSpotClient, HubSpotEngagement } from '../hubspotClient';

export interface EngagementExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  limit?: number;
  types?: ('calls' | 'emails' | 'meetings' | 'notes' | 'tasks')[];
  contactIds?: string[];
  companyIds?: string[];
  dealIds?: string[];
}

export interface CallEngagement {
  id: string;
  title?: string;
  body?: string;
  status?: string;
  disposition?: string;
  direction?: 'INBOUND' | 'OUTBOUND';
  durationMilliseconds?: number;
  fromNumber?: string;
  toNumber?: string;
  recordingUrl?: string;
  timestamp: string;
  ownerId?: string;
  associations?: EngagementAssociations;
}

export interface EmailEngagement {
  id: string;
  subject?: string;
  text?: string;
  html?: string;
  from?: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
  to?: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
  }>;
  cc?: Array<{ email: string }>;
  bcc?: Array<{ email: string }>;
  timestamp: string;
  ownerId?: string;
  associations?: EngagementAssociations;
}

export interface MeetingEngagement {
  id: string;
  title?: string;
  body?: string;
  startTime: string;
  endTime: string;
  internalMeetingNotes?: string;
  location?: string;
  meetingOutcome?: string;
  attendeeOwnerIds?: string[];
  timestamp: string;
  ownerId?: string;
  associations?: EngagementAssociations;
}

export interface NoteEngagement {
  id: string;
  body?: string;
  timestamp: string;
  ownerId?: string;
  associations?: EngagementAssociations;
}

export interface TaskEngagement {
  id: string;
  subject?: string;
  body?: string;
  status?: string;
  priority?: string;
  taskType?: string;
  dueDate?: string;
  completionDate?: string;
  timestamp: string;
  ownerId?: string;
  associations?: EngagementAssociations;
}

export interface EngagementAssociations {
  contactIds?: string[];
  companyIds?: string[];
  dealIds?: string[];
  ticketIds?: string[];
}

export interface EngagementSummary {
  totalEngagements: number;
  byType: Record<string, number>;
  byOwner: Record<string, number>;
  avgEngagementsPerDay: number;
}

export class HubSpotEngagementsExtractor {
  private client: HubSpotClient;

  constructor(client: HubSpotClient) {
    this.client = client;
  }

  /**
   * Extract all engagement types
   */
  async extractEngagements(
    options: EngagementExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    summary: EngagementSummary;
  }> {
    const events: ExtractedEvent[] = [];
    const types = options.types || ['calls', 'emails', 'meetings', 'notes', 'tasks'];

    // Extract each type
    if (types.includes('calls')) {
      const callEvents = await this.extractCalls(options);
      events.push(...callEvents);
    }

    if (types.includes('emails')) {
      const emailEvents = await this.extractEmails(options);
      events.push(...emailEvents);
    }

    if (types.includes('meetings')) {
      const meetingEvents = await this.extractMeetings(options);
      events.push(...meetingEvents);
    }

    if (types.includes('notes')) {
      const noteEvents = await this.extractNotes(options);
      events.push(...noteEvents);
    }

    if (types.includes('tasks')) {
      const taskEvents = await this.extractTasks(options);
      events.push(...taskEvents);
    }

    // Calculate summary
    const summary = this.calculateSummary(events);

    return { events, summary };
  }

  /**
   * Extract calls
   */
  async extractCalls(
    options: EngagementExtractionOptions
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      const properties = [
        'hs_call_title', 'hs_call_body', 'hs_call_status', 'hs_call_disposition',
        'hs_call_direction', 'hs_call_duration', 'hs_call_from_number', 'hs_call_to_number',
        'hs_call_recording_url', 'hs_timestamp', 'hubspot_owner_id',
      ];

      let after: string | undefined;
      let processedCount = 0;
      const maxRecords = options.limit || 1000;

      do {
        const result = await (this.client as any).request<any>(
          `/crm/v3/objects/calls?limit=100${after ? `&after=${after}` : ''}&properties=${properties.join(',')}`
        );

        for (const call of result.results) {
          if (options.modifiedAfter && new Date(call.updatedAt) < options.modifiedAfter) {
            continue;
          }

          events.push({
            type: 'crm.call',
            timestamp: new Date(call.properties.hs_timestamp || call.createdAt),
            actorId: call.properties.hubspot_owner_id,
            targetId: call.id,
            metadata: {
              source: 'hubspot',
              organizationId: options.organizationId,
              callId: call.id,
              title: call.properties.hs_call_title,
              body: call.properties.hs_call_body,
              status: call.properties.hs_call_status,
              disposition: call.properties.hs_call_disposition,
              direction: call.properties.hs_call_direction,
              durationMs: parseInt(call.properties.hs_call_duration || '0', 10),
              fromNumber: call.properties.hs_call_from_number,
              toNumber: call.properties.hs_call_to_number,
              recordingUrl: call.properties.hs_call_recording_url,
              ownerId: call.properties.hubspot_owner_id,
              createdAt: call.createdAt,
              updatedAt: call.updatedAt,
            },
          });

          processedCount++;
          if (processedCount >= maxRecords) break;
        }

        after = result.paging?.next?.after;
      } while (after && processedCount < maxRecords);
    } catch (error) {
      console.warn('Failed to extract calls:', error);
    }

    return events;
  }

  /**
   * Extract emails
   */
  async extractEmails(
    options: EngagementExtractionOptions
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      const properties = [
        'hs_email_subject', 'hs_email_text', 'hs_email_html',
        'hs_email_from_email', 'hs_email_from_firstname', 'hs_email_from_lastname',
        'hs_email_to_email', 'hs_email_to_firstname', 'hs_email_to_lastname',
        'hs_email_direction', 'hs_timestamp', 'hubspot_owner_id',
      ];

      let after: string | undefined;
      let processedCount = 0;
      const maxRecords = options.limit || 1000;

      do {
        const result = await (this.client as any).request<any>(
          `/crm/v3/objects/emails?limit=100${after ? `&after=${after}` : ''}&properties=${properties.join(',')}`
        );

        for (const email of result.results) {
          if (options.modifiedAfter && new Date(email.updatedAt) < options.modifiedAfter) {
            continue;
          }

          events.push({
            type: 'crm.email',
            timestamp: new Date(email.properties.hs_timestamp || email.createdAt),
            actorId: email.properties.hubspot_owner_id,
            targetId: email.id,
            metadata: {
              source: 'hubspot',
              organizationId: options.organizationId,
              emailId: email.id,
              subject: email.properties.hs_email_subject,
              fromEmail: email.properties.hs_email_from_email,
              fromName: [
                email.properties.hs_email_from_firstname,
                email.properties.hs_email_from_lastname,
              ].filter(Boolean).join(' '),
              toEmail: email.properties.hs_email_to_email,
              direction: email.properties.hs_email_direction,
              ownerId: email.properties.hubspot_owner_id,
              createdAt: email.createdAt,
              updatedAt: email.updatedAt,
            },
          });

          processedCount++;
          if (processedCount >= maxRecords) break;
        }

        after = result.paging?.next?.after;
      } while (after && processedCount < maxRecords);
    } catch (error) {
      console.warn('Failed to extract emails:', error);
    }

    return events;
  }

  /**
   * Extract meetings
   */
  async extractMeetings(
    options: EngagementExtractionOptions
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      const properties = [
        'hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time', 'hs_meeting_end_time',
        'hs_meeting_location', 'hs_meeting_outcome', 'hs_internal_meeting_notes',
        'hs_timestamp', 'hubspot_owner_id',
      ];

      let after: string | undefined;
      let processedCount = 0;
      const maxRecords = options.limit || 1000;

      do {
        const result = await (this.client as any).request<any>(
          `/crm/v3/objects/meetings?limit=100${after ? `&after=${after}` : ''}&properties=${properties.join(',')}`
        );

        for (const meeting of result.results) {
          if (options.modifiedAfter && new Date(meeting.updatedAt) < options.modifiedAfter) {
            continue;
          }

          events.push({
            type: 'crm.meeting',
            timestamp: new Date(meeting.properties.hs_timestamp || meeting.createdAt),
            actorId: meeting.properties.hubspot_owner_id,
            targetId: meeting.id,
            metadata: {
              source: 'hubspot',
              organizationId: options.organizationId,
              meetingId: meeting.id,
              title: meeting.properties.hs_meeting_title,
              body: meeting.properties.hs_meeting_body,
              startTime: meeting.properties.hs_meeting_start_time,
              endTime: meeting.properties.hs_meeting_end_time,
              location: meeting.properties.hs_meeting_location,
              outcome: meeting.properties.hs_meeting_outcome,
              internalNotes: meeting.properties.hs_internal_meeting_notes,
              ownerId: meeting.properties.hubspot_owner_id,
              createdAt: meeting.createdAt,
              updatedAt: meeting.updatedAt,
            },
          });

          processedCount++;
          if (processedCount >= maxRecords) break;
        }

        after = result.paging?.next?.after;
      } while (after && processedCount < maxRecords);
    } catch (error) {
      console.warn('Failed to extract meetings:', error);
    }

    return events;
  }

  /**
   * Extract notes
   */
  async extractNotes(
    options: EngagementExtractionOptions
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      const properties = ['hs_note_body', 'hs_timestamp', 'hubspot_owner_id'];

      let after: string | undefined;
      let processedCount = 0;
      const maxRecords = options.limit || 1000;

      do {
        const result = await (this.client as any).request<any>(
          `/crm/v3/objects/notes?limit=100${after ? `&after=${after}` : ''}&properties=${properties.join(',')}`
        );

        for (const note of result.results) {
          if (options.modifiedAfter && new Date(note.updatedAt) < options.modifiedAfter) {
            continue;
          }

          events.push({
            type: 'crm.note',
            timestamp: new Date(note.properties.hs_timestamp || note.createdAt),
            actorId: note.properties.hubspot_owner_id,
            targetId: note.id,
            metadata: {
              source: 'hubspot',
              organizationId: options.organizationId,
              noteId: note.id,
              body: note.properties.hs_note_body,
              ownerId: note.properties.hubspot_owner_id,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
            },
          });

          processedCount++;
          if (processedCount >= maxRecords) break;
        }

        after = result.paging?.next?.after;
      } while (after && processedCount < maxRecords);
    } catch (error) {
      console.warn('Failed to extract notes:', error);
    }

    return events;
  }

  /**
   * Extract tasks
   */
  async extractTasks(
    options: EngagementExtractionOptions
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      const properties = [
        'hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_task_priority',
        'hs_task_type', 'hs_timestamp', 'hubspot_owner_id',
      ];

      let after: string | undefined;
      let processedCount = 0;
      const maxRecords = options.limit || 1000;

      do {
        const result = await (this.client as any).request<any>(
          `/crm/v3/objects/tasks?limit=100${after ? `&after=${after}` : ''}&properties=${properties.join(',')}`
        );

        for (const task of result.results) {
          if (options.modifiedAfter && new Date(task.updatedAt) < options.modifiedAfter) {
            continue;
          }

          const isCompleted = task.properties.hs_task_status === 'COMPLETED';

          events.push({
            type: isCompleted ? 'crm.task.completed' : 'crm.task',
            timestamp: new Date(task.properties.hs_timestamp || task.createdAt),
            actorId: task.properties.hubspot_owner_id,
            targetId: task.id,
            metadata: {
              source: 'hubspot',
              organizationId: options.organizationId,
              taskId: task.id,
              subject: task.properties.hs_task_subject,
              body: task.properties.hs_task_body,
              status: task.properties.hs_task_status,
              priority: task.properties.hs_task_priority,
              taskType: task.properties.hs_task_type,
              isCompleted,
              ownerId: task.properties.hubspot_owner_id,
              createdAt: task.createdAt,
              updatedAt: task.updatedAt,
            },
          });

          processedCount++;
          if (processedCount >= maxRecords) break;
        }

        after = result.paging?.next?.after;
      } while (after && processedCount < maxRecords);
    } catch (error) {
      console.warn('Failed to extract tasks:', error);
    }

    return events;
  }

  /**
   * Get engagement timeline for a contact
   */
  async getContactTimeline(
    contactId: string,
    options: { organizationId: string; limit?: number }
  ): Promise<ExtractedEvent[]> {
    // HubSpot v3 uses associations to link engagements
    // For now, we extract all and filter by association
    const result = await this.extractEngagements({
      organizationId: options.organizationId,
      contactIds: [contactId],
      limit: options.limit,
    });

    return result.events;
  }

  /**
   * Calculate engagement summary
   */
  private calculateSummary(events: ExtractedEvent[]): EngagementSummary {
    const byType: Record<string, number> = {};
    const byOwner: Record<string, number> = {};
    const dateSet = new Set<string>();

    for (const event of events) {
      // By type
      const type = event.type.split('.')[1] || 'other';
      byType[type] = (byType[type] || 0) + 1;

      // By owner
      if (event.actorId) {
        byOwner[event.actorId] = (byOwner[event.actorId] || 0) + 1;
      }

      // Track unique dates
      dateSet.add(event.timestamp.toISOString().split('T')[0]);
    }

    const uniqueDays = dateSet.size || 1;

    return {
      totalEngagements: events.length,
      byType,
      byOwner,
      avgEngagementsPerDay: events.length / uniqueDays,
    };
  }
}

/**
 * Create engagements extractor
 */
export function createEngagementsExtractor(client: HubSpotClient): HubSpotEngagementsExtractor {
  return new HubSpotEngagementsExtractor(client);
}
