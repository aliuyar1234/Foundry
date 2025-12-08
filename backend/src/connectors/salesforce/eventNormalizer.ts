/**
 * Salesforce Event Normalizer
 * Task: T087
 *
 * Normalizes events from Salesforce into a consistent format.
 * Handles all Salesforce objects and CRM-specific event types.
 */

import { ExtractedEvent } from '../base/connector';

export interface NormalizedSalesforceEvent {
  id: string;
  type: string;
  subtype?: string;
  timestamp: Date;
  source: 'salesforce';
  entity: string;
  actor: {
    id?: string;
    name?: string;
    type: 'user' | 'system' | 'automation';
  };
  target?: {
    id: string;
    type: string;
    name?: string;
    entity: string;
  };
  context: {
    organizationId: string;
    instanceUrl?: string;
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
  instanceUrl?: string;
  includeRawData?: boolean;
}

// Object to event type mappings
const ENTITY_EVENT_TYPES: Record<string, { type: string; category: string }> = {
  Account: { type: 'entity', category: 'customer' },
  Contact: { type: 'entity', category: 'customer' },
  Lead: { type: 'entity', category: 'prospect' },
  Opportunity: { type: 'deal', category: 'sales' },
  Case: { type: 'ticket', category: 'support' },
  Task: { type: 'activity', category: 'engagement' },
  Event: { type: 'activity', category: 'engagement' },
  Campaign: { type: 'entity', category: 'marketing' },
  Contract: { type: 'document', category: 'legal' },
  Order: { type: 'transaction', category: 'sales' },
  Product2: { type: 'entity', category: 'catalog' },
  Pricebook2: { type: 'entity', category: 'pricing' },
  Quote: { type: 'document', category: 'sales' },
};

// Activity types
const ACTIVITY_SUBTYPES: Record<string, string> = {
  Call: 'call',
  Email: 'email',
  Meeting: 'meeting',
  Task: 'task',
  Event: 'meeting',
  Demo: 'demo',
  Follow_Up: 'follow_up',
};

export class SalesforceEventNormalizer {
  /**
   * Normalize a single event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedSalesforceEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const entity = this.detectEntity(event.type, metadata);
    const entityInfo = ENTITY_EVENT_TYPES[entity] || { type: 'unknown', category: 'unknown' };

    const normalized: NormalizedSalesforceEvent = {
      id: this.generateEventId(event, metadata),
      type: entityInfo.type,
      subtype: this.extractSubtype(event.type, metadata),
      timestamp: event.timestamp,
      source: 'salesforce',
      entity,
      actor: this.normalizeActor(metadata),
      target: this.normalizeTarget(event, metadata, entity),
      context: {
        organizationId: options.organizationId,
        instanceUrl: options.instanceUrl,
      },
      data: this.normalizeData(event, metadata, options.includeRawData),
      relationships: this.buildRelationships(metadata, entity),
    };

    return normalized;
  }

  /**
   * Normalize batch of events
   */
  normalizeEvents(
    events: ExtractedEvent[],
    options: NormalizationOptions
  ): NormalizedSalesforceEvent[] {
    return events
      .map((event) => {
        try {
          return this.normalizeEvent(event, options);
        } catch (error) {
          console.warn(`Failed to normalize Salesforce event: ${error}`);
          return null;
        }
      })
      .filter((event): event is NormalizedSalesforceEvent => event !== null);
  }

  /**
   * Detect entity from event type
   */
  private detectEntity(eventType: string, metadata: Record<string, unknown>): string {
    // Check metadata first
    if (metadata.objectType) {
      return metadata.objectType as string;
    }

    // Parse from event type (e.g., "crm.account.created" -> "Account")
    const parts = eventType.split('.');
    if (parts.length >= 2) {
      const entityPart = parts[1];
      // Capitalize first letter
      return entityPart.charAt(0).toUpperCase() + entityPart.slice(1);
    }

    return 'Unknown';
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(event: ExtractedEvent, metadata: Record<string, unknown>): string {
    const recordId = metadata.recordId || metadata.Id || event.targetId;
    return `sf:${recordId}:${event.timestamp.getTime()}`;
  }

  /**
   * Extract subtype from event type and metadata
   */
  private extractSubtype(eventType: string, metadata: Record<string, unknown>): string | undefined {
    // Check for activity subtype
    if (metadata.TaskSubtype) {
      return ACTIVITY_SUBTYPES[metadata.TaskSubtype as string] || metadata.TaskSubtype as string;
    }

    // Check for call type
    if (metadata.CallType) {
      return 'call';
    }

    // Parse from event type
    const parts = eventType.split('.');
    if (parts.length > 2) {
      return parts.slice(2).join('.');
    }

    return parts[parts.length - 1];
  }

  /**
   * Normalize actor
   */
  private normalizeActor(metadata: Record<string, unknown>): NormalizedSalesforceEvent['actor'] {
    const ownerId = metadata.OwnerId as string;
    const createdById = metadata.CreatedById as string;

    const actorId = ownerId || createdById;

    if (actorId) {
      // Check if it's an automation user
      const isAutomation = actorId.startsWith('005') === false; // User IDs start with 005

      return {
        id: actorId,
        type: isAutomation ? 'automation' : 'user',
      };
    }

    return { type: 'system' };
  }

  /**
   * Normalize target
   */
  private normalizeTarget(
    event: ExtractedEvent,
    metadata: Record<string, unknown>,
    entity: string
  ): NormalizedSalesforceEvent['target'] | undefined {
    if (!event.targetId && !metadata.Id) return undefined;

    const targetId = (metadata.Id || event.targetId) as string;

    let targetType: string;
    let targetName: string | undefined;

    switch (entity) {
      case 'Account':
        targetType = 'company';
        targetName = metadata.Name as string;
        break;
      case 'Contact':
        targetType = 'person';
        targetName = metadata.Name as string;
        break;
      case 'Lead':
        targetType = 'prospect';
        targetName = metadata.Name as string;
        break;
      case 'Opportunity':
        targetType = 'deal';
        targetName = metadata.Name as string;
        break;
      case 'Case':
        targetType = 'ticket';
        targetName = metadata.Subject as string || metadata.CaseNumber as string;
        break;
      case 'Task':
      case 'Event':
        targetType = 'activity';
        targetName = metadata.Subject as string;
        break;
      default:
        targetType = entity.toLowerCase();
        targetName = metadata.Name as string;
    }

    return {
      id: targetId,
      type: targetType,
      name: targetName,
      entity,
    };
  }

  /**
   * Normalize data
   */
  private normalizeData(
    event: ExtractedEvent,
    metadata: Record<string, unknown>,
    includeRawData?: boolean
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // Copy key fields based on object type
    const keyFieldsByType: Record<string, string[]> = {
      Account: ['Name', 'Type', 'Industry', 'Phone', 'Website', 'AnnualRevenue', 'NumberOfEmployees'],
      Contact: ['FirstName', 'LastName', 'Email', 'Phone', 'Title', 'Department'],
      Lead: ['FirstName', 'LastName', 'Email', 'Company', 'Status', 'LeadSource', 'Rating'],
      Opportunity: ['Name', 'Amount', 'StageName', 'Probability', 'CloseDate', 'Type', 'LeadSource', 'IsClosed', 'IsWon'],
      Case: ['CaseNumber', 'Subject', 'Status', 'Priority', 'Origin', 'Type', 'IsClosed'],
      Task: ['Subject', 'Status', 'Priority', 'ActivityDate', 'IsClosed'],
      Event: ['Subject', 'StartDateTime', 'EndDateTime', 'Location', 'IsAllDayEvent'],
    };

    const objectType = metadata.objectType as string || this.detectEntity(event.type, metadata);
    const keyFields = keyFieldsByType[objectType] || [];

    for (const field of keyFields) {
      if (field in metadata) {
        data[field] = metadata[field];
      }
    }

    // Add common fields
    if (metadata.CreatedDate) {
      data.createdAt = metadata.CreatedDate;
    }
    if (metadata.LastModifiedDate) {
      data.updatedAt = metadata.LastModifiedDate;
    }
    if (metadata.IsDeleted !== undefined) {
      data.isDeleted = metadata.IsDeleted;
    }

    // Add amounts for opportunities
    if (metadata.Amount !== undefined) {
      data.amount = {
        value: metadata.Amount,
        expectedRevenue: metadata.ExpectedRevenue,
        probability: metadata.Probability,
      };
    }

    // Add addresses
    if (metadata.BillingStreet || metadata.MailingStreet || metadata.Street) {
      data.address = {
        street: metadata.BillingStreet || metadata.MailingStreet || metadata.Street,
        city: metadata.BillingCity || metadata.MailingCity || metadata.City,
        state: metadata.BillingState || metadata.MailingState || metadata.State,
        postalCode: metadata.BillingPostalCode || metadata.MailingPostalCode || metadata.PostalCode,
        country: metadata.BillingCountry || metadata.MailingCountry || metadata.Country,
      };
    }

    // Include raw data if requested
    if (includeRawData && event.rawData) {
      data._raw = event.rawData;
    }

    return data;
  }

  /**
   * Build relationships
   */
  private buildRelationships(
    metadata: Record<string, unknown>,
    entity: string
  ): NormalizedSalesforceEvent['relationships'] {
    const relationships: NormalizedSalesforceEvent['relationships'] = [];

    // Account relationship
    if (metadata.AccountId && entity !== 'Account') {
      relationships.push({
        type: 'account',
        targetId: metadata.AccountId as string,
        targetType: 'Account',
      });
    }

    // Contact relationship
    if (metadata.ContactId && entity !== 'Contact') {
      relationships.push({
        type: 'contact',
        targetId: metadata.ContactId as string,
        targetType: 'Contact',
      });
    }

    // Lead relationship
    if (metadata.LeadId && entity !== 'Lead') {
      relationships.push({
        type: 'lead',
        targetId: metadata.LeadId as string,
        targetType: 'Lead',
      });
    }

    // Opportunity relationship
    if (metadata.OpportunityId && entity !== 'Opportunity') {
      relationships.push({
        type: 'opportunity',
        targetId: metadata.OpportunityId as string,
        targetType: 'Opportunity',
      });
    }

    // WhoId (typically Contact or Lead)
    if (metadata.WhoId) {
      const whoId = metadata.WhoId as string;
      const whoType = whoId.startsWith('003') ? 'Contact' : 'Lead';
      relationships.push({
        type: 'who',
        targetId: whoId,
        targetType: whoType,
      });
    }

    // WhatId (typically Account, Opportunity, or custom object)
    if (metadata.WhatId) {
      const whatId = metadata.WhatId as string;
      let whatType = 'Record';
      if (whatId.startsWith('001')) whatType = 'Account';
      else if (whatId.startsWith('006')) whatType = 'Opportunity';
      else if (whatId.startsWith('500')) whatType = 'Case';

      relationships.push({
        type: 'what',
        targetId: whatId,
        targetType: whatType,
      });
    }

    // Owner relationship
    if (metadata.OwnerId) {
      relationships.push({
        type: 'owner',
        targetId: metadata.OwnerId as string,
        targetType: 'User',
      });
    }

    // Parent relationship for hierarchical objects
    if (metadata.ParentId) {
      relationships.push({
        type: 'parent',
        targetId: metadata.ParentId as string,
        targetType: entity,
      });
    }

    // Campaign relationship
    if (metadata.CampaignId) {
      relationships.push({
        type: 'campaign',
        targetId: metadata.CampaignId as string,
        targetType: 'Campaign',
      });
    }

    // Converted lead relationships
    if (metadata.ConvertedAccountId) {
      relationships.push({
        type: 'converted_account',
        targetId: metadata.ConvertedAccountId as string,
        targetType: 'Account',
      });
    }
    if (metadata.ConvertedContactId) {
      relationships.push({
        type: 'converted_contact',
        targetId: metadata.ConvertedContactId as string,
        targetType: 'Contact',
      });
    }
    if (metadata.ConvertedOpportunityId) {
      relationships.push({
        type: 'converted_opportunity',
        targetId: metadata.ConvertedOpportunityId as string,
        targetType: 'Opportunity',
      });
    }

    return relationships.length > 0 ? relationships : undefined;
  }
}

/**
 * Create event normalizer
 */
export function createSalesforceEventNormalizer(): SalesforceEventNormalizer {
  return new SalesforceEventNormalizer();
}
