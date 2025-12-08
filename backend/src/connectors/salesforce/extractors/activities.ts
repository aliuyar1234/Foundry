/**
 * Salesforce Activity Extractor
 * Task: T080
 *
 * Extracts tasks, events, and activity history.
 * Tracks calls, emails, meetings, and other interactions.
 */

import { ExtractedEvent } from '../../base/connector';
import { SalesforceClient, SalesforceTask, SalesforceEvent as SalesforceCalendarEvent, SalesforceRecord } from '../salesforceClient';

export interface ActivityExtractionOptions {
  organizationId: string;
  modifiedSince?: Date;
  limit?: number;
  activityTypes?: ('Task' | 'Event' | 'EmailMessage' | 'Call')[];
  relatedToIds?: string[];
}

export interface EmailMessage extends SalesforceRecord {
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  FromAddress?: string;
  ToAddress?: string;
  CcAddress?: string;
  BccAddress?: string;
  Status: string;
  MessageDate: string;
  IsExternallyVisible: boolean;
  RelatedToId?: string;
  ParentId?: string;
  ThreadIdentifier?: string;
}

export interface CallLog extends SalesforceRecord {
  Subject?: string;
  Description?: string;
  CallType?: string;
  CallDurationInSeconds?: number;
  CallDisposition?: string;
  WhoId?: string;
  WhatId?: string;
  OwnerId?: string;
  Status: string;
  Priority: string;
  ActivityDate?: string;
}

export interface ActivitySummary {
  totalActivities: number;
  byType: Record<string, number>;
  byOwner: Record<string, number>;
  avgActivitiesPerDay: number;
  completionRate: number;
}

export class SalesforceActivitiesExtractor {
  private client: SalesforceClient;

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Extract all activity types
   */
  async extractActivities(
    options: ActivityExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    summary: ActivitySummary;
  }> {
    const events: ExtractedEvent[] = [];
    const activityTypes = options.activityTypes || ['Task', 'Event'];

    // Extract tasks
    if (activityTypes.includes('Task')) {
      const taskEvents = await this.extractTasks(options);
      events.push(...taskEvents);
    }

    // Extract calendar events
    if (activityTypes.includes('Event')) {
      const calendarEvents = await this.extractCalendarEvents(options);
      events.push(...calendarEvents);
    }

    // Extract emails
    if (activityTypes.includes('EmailMessage')) {
      const emailEvents = await this.extractEmails(options);
      events.push(...emailEvents);
    }

    // Calculate summary
    const summary = this.calculateSummary(events);

    return { events, summary };
  }

  /**
   * Extract tasks
   */
  async extractTasks(
    options: ActivityExtractionOptions
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    let soql = `SELECT Id, Subject, Description, Status, Priority, ActivityDate,
                WhoId, WhatId, OwnerId, IsClosed, IsHighPriority, TaskSubtype,
                Type, ReminderDateTime, IsReminderSet, RecurrenceType,
                CallType, CallDurationInSeconds, CallDisposition,
                CreatedDate, LastModifiedDate, SystemModstamp
                FROM Task`;

    const conditions: string[] = [];

    if (options.modifiedSince) {
      conditions.push(`LastModifiedDate >= ${options.modifiedSince.toISOString()}`);
    }

    if (options.relatedToIds?.length) {
      const idList = options.relatedToIds.map((id) => `'${id}'`).join(',');
      conditions.push(`(WhoId IN (${idList}) OR WhatId IN (${idList}))`);
    }

    if (conditions.length > 0) {
      soql += ` WHERE ${conditions.join(' AND ')}`;
    }

    soql += ` ORDER BY LastModifiedDate DESC`;

    if (options.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    const tasks = await this.client.queryAll<SalesforceTask>(soql);

    for (const task of tasks) {
      events.push(this.taskToEvent(task, options.organizationId));
    }

    return events;
  }

  /**
   * Extract calendar events
   */
  async extractCalendarEvents(
    options: ActivityExtractionOptions
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    let soql = `SELECT Id, Subject, Description, StartDateTime, EndDateTime,
                IsAllDayEvent, DurationInMinutes, Location,
                WhoId, WhatId, OwnerId, ShowAs, IsPrivate,
                Type, RecurrenceType, IsRecurrence,
                CreatedDate, LastModifiedDate, SystemModstamp
                FROM Event`;

    const conditions: string[] = [];

    if (options.modifiedSince) {
      conditions.push(`LastModifiedDate >= ${options.modifiedSince.toISOString()}`);
    }

    if (options.relatedToIds?.length) {
      const idList = options.relatedToIds.map((id) => `'${id}'`).join(',');
      conditions.push(`(WhoId IN (${idList}) OR WhatId IN (${idList}))`);
    }

    if (conditions.length > 0) {
      soql += ` WHERE ${conditions.join(' AND ')}`;
    }

    soql += ` ORDER BY LastModifiedDate DESC`;

    if (options.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    const calendarEvents = await this.client.queryAll<SalesforceCalendarEvent>(soql);

    for (const event of calendarEvents) {
      events.push(this.calendarEventToEvent(event, options.organizationId));
    }

    return events;
  }

  /**
   * Extract email messages
   */
  async extractEmails(
    options: ActivityExtractionOptions
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      let soql = `SELECT Id, Subject, TextBody, FromAddress, ToAddress,
                  CcAddress, BccAddress, Status, MessageDate,
                  IsExternallyVisible, RelatedToId, ParentId, ThreadIdentifier,
                  CreatedDate, LastModifiedDate, SystemModstamp
                  FROM EmailMessage`;

      const conditions: string[] = [];

      if (options.modifiedSince) {
        conditions.push(`LastModifiedDate >= ${options.modifiedSince.toISOString()}`);
      }

      if (options.relatedToIds?.length) {
        const idList = options.relatedToIds.map((id) => `'${id}'`).join(',');
        conditions.push(`RelatedToId IN (${idList})`);
      }

      if (conditions.length > 0) {
        soql += ` WHERE ${conditions.join(' AND ')}`;
      }

      soql += ` ORDER BY LastModifiedDate DESC`;

      if (options.limit) {
        soql += ` LIMIT ${options.limit}`;
      }

      const emails = await this.client.queryAll<EmailMessage>(soql);

      for (const email of emails) {
        events.push(this.emailToEvent(email, options.organizationId));
      }
    } catch (error) {
      // EmailMessage might not be enabled in all orgs
      console.warn('Failed to extract emails (EmailMessage object may not be enabled):', error);
    }

    return events;
  }

  /**
   * Get activities for a specific record
   */
  async getActivitiesForRecord(
    recordId: string,
    options: { organizationId: string; limit?: number }
  ): Promise<ExtractedEvent[]> {
    return this.extractActivities({
      organizationId: options.organizationId,
      relatedToIds: [recordId],
      limit: options.limit,
      activityTypes: ['Task', 'Event', 'EmailMessage'],
    }).then((result) => result.events);
  }

  /**
   * Get activity timeline for a contact or account
   */
  async getActivityTimeline(
    recordId: string,
    options: {
      organizationId: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<{
    events: ExtractedEvent[];
    timeline: Array<{
      date: string;
      activities: ExtractedEvent[];
    }>;
  }> {
    const activities = await this.getActivitiesForRecord(recordId, options);

    // Group by date
    const byDate = new Map<string, ExtractedEvent[]>();

    for (const activity of activities) {
      const dateKey = activity.timestamp.toISOString().split('T')[0];
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(activity);
    }

    // Convert to timeline array
    const timeline = Array.from(byDate.entries())
      .map(([date, acts]) => ({ date, activities: acts }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return { events: activities, timeline };
  }

  /**
   * Convert task to event
   */
  private taskToEvent(task: SalesforceTask, organizationId: string): ExtractedEvent {
    let eventType: string;

    if (task.IsClosed) {
      eventType = 'crm.task.completed';
    } else {
      const createdDate = new Date(task.CreatedDate);
      const modifiedDate = new Date(task.LastModifiedDate);
      const isNew = Math.abs(modifiedDate.getTime() - createdDate.getTime()) < 60000;
      eventType = isNew ? 'crm.task.created' : 'crm.task.updated';
    }

    // Check if this is a call
    if (task.TaskSubtype === 'Call' || task.CallType) {
      eventType = eventType.replace('task', 'call');
    }

    return {
      type: eventType,
      timestamp: new Date(task.LastModifiedDate),
      actorId: task.OwnerId,
      targetId: task.Id,
      metadata: {
        source: 'salesforce',
        organizationId,
        taskId: task.Id,
        subject: task.Subject,
        description: task.Description,
        status: task.Status,
        priority: task.Priority,
        activityDate: task.ActivityDate,
        whoId: task.WhoId,
        whatId: task.WhatId,
        ownerId: task.OwnerId,
        isClosed: task.IsClosed,
        isHighPriority: task.IsHighPriority,
        taskSubtype: task.TaskSubtype,
        callType: (task as any).CallType,
        callDuration: (task as any).CallDurationInSeconds,
        callDisposition: (task as any).CallDisposition,
        createdAt: task.CreatedDate,
        updatedAt: task.LastModifiedDate,
      },
    };
  }

  /**
   * Convert calendar event to event
   */
  private calendarEventToEvent(
    calendarEvent: SalesforceCalendarEvent,
    organizationId: string
  ): ExtractedEvent {
    const now = new Date();
    const startTime = new Date(calendarEvent.StartDateTime);
    const endTime = new Date(calendarEvent.EndDateTime);

    let eventType: string;
    if (endTime < now) {
      eventType = 'crm.meeting.completed';
    } else if (startTime <= now && endTime >= now) {
      eventType = 'crm.meeting.in_progress';
    } else {
      const createdDate = new Date(calendarEvent.CreatedDate);
      const modifiedDate = new Date(calendarEvent.LastModifiedDate);
      const isNew = Math.abs(modifiedDate.getTime() - createdDate.getTime()) < 60000;
      eventType = isNew ? 'crm.meeting.scheduled' : 'crm.meeting.updated';
    }

    return {
      type: eventType,
      timestamp: new Date(calendarEvent.LastModifiedDate),
      actorId: calendarEvent.OwnerId,
      targetId: calendarEvent.Id,
      metadata: {
        source: 'salesforce',
        organizationId,
        eventId: calendarEvent.Id,
        subject: calendarEvent.Subject,
        description: calendarEvent.Description,
        startDateTime: calendarEvent.StartDateTime,
        endDateTime: calendarEvent.EndDateTime,
        isAllDayEvent: calendarEvent.IsAllDayEvent,
        durationInMinutes: calendarEvent.DurationInMinutes,
        location: calendarEvent.Location,
        whoId: calendarEvent.WhoId,
        whatId: calendarEvent.WhatId,
        ownerId: calendarEvent.OwnerId,
        showAs: calendarEvent.ShowAs,
        isPrivate: calendarEvent.IsPrivate,
        createdAt: calendarEvent.CreatedDate,
        updatedAt: calendarEvent.LastModifiedDate,
      },
    };
  }

  /**
   * Convert email to event
   */
  private emailToEvent(email: EmailMessage, organizationId: string): ExtractedEvent {
    return {
      type: 'crm.email.sent',
      timestamp: new Date(email.MessageDate || email.CreatedDate),
      actorId: undefined,
      targetId: email.Id,
      metadata: {
        source: 'salesforce',
        organizationId,
        emailId: email.Id,
        subject: email.Subject,
        fromAddress: email.FromAddress,
        toAddress: email.ToAddress,
        ccAddress: email.CcAddress,
        status: email.Status,
        messageDate: email.MessageDate,
        relatedToId: email.RelatedToId,
        parentId: email.ParentId,
        threadIdentifier: email.ThreadIdentifier,
        isExternallyVisible: email.IsExternallyVisible,
        createdAt: email.CreatedDate,
        updatedAt: email.LastModifiedDate,
      },
    };
  }

  /**
   * Calculate activity summary
   */
  private calculateSummary(events: ExtractedEvent[]): ActivitySummary {
    const byType: Record<string, number> = {};
    const byOwner: Record<string, number> = {};
    let completedCount = 0;
    let closedCount = 0;

    const dateSet = new Set<string>();

    for (const event of events) {
      // By type
      const type = event.type.split('.')[1] || 'other';
      byType[type] = (byType[type] || 0) + 1;

      // By owner
      if (event.actorId) {
        byOwner[event.actorId] = (byOwner[event.actorId] || 0) + 1;
      }

      // Completion tracking
      if (event.type.includes('completed')) {
        completedCount++;
      }
      if (event.metadata.isClosed !== undefined) {
        closedCount++;
        if (event.metadata.isClosed) {
          completedCount++;
        }
      }

      // Track unique dates
      dateSet.add(event.timestamp.toISOString().split('T')[0]);
    }

    const uniqueDays = dateSet.size || 1;

    return {
      totalActivities: events.length,
      byType,
      byOwner,
      avgActivitiesPerDay: events.length / uniqueDays,
      completionRate: closedCount > 0 ? completedCount / closedCount : 0,
    };
  }
}

/**
 * Create activities extractor
 */
export function createActivitiesExtractor(client: SalesforceClient): SalesforceActivitiesExtractor {
  return new SalesforceActivitiesExtractor(client);
}
