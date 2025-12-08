/**
 * HubSpot Event Normalizer
 * Task: T105
 *
 * Normalizes events from HubSpot into a consistent format.
 * Handles all HubSpot objects and CRM-specific event types.
 */

import { ExtractedEvent } from '../base/connector';

export interface NormalizedHubSpotEvent {
  id: string;
  type: string;
  subtype?: string;
  timestamp: Date;
  source: 'hubspot';
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
    portalId?: string;
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
  portalId?: string;
  includeRawData?: boolean;
}

// Object to event type mappings
const ENTITY_EVENT_TYPES: Record<string, { type: string; category: string }> = {
  contacts: { type: 'entity', category: 'customer' },
  companies: { type: 'entity', category: 'customer' },
  deals: { type: 'deal', category: 'sales' },
  tickets: { type: 'ticket', category: 'support' },
  calls: { type: 'activity', category: 'engagement' },
  emails: { type: 'activity', category: 'engagement' },
  meetings: { type: 'activity', category: 'engagement' },
  notes: { type: 'activity', category: 'engagement' },
  tasks: { type: 'activity', category: 'engagement' },
  products: { type: 'entity', category: 'catalog' },
  line_items: { type: 'transaction', category: 'sales' },
  quotes: { type: 'document', category: 'sales' },
};

export class HubSpotEventNormalizer {
  /**
   * Normalize a single event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedHubSpotEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const entity = this.detectEntity(event.type, metadata);
    const entityInfo = ENTITY_EVENT_TYPES[entity] || { type: 'unknown', category: 'unknown' };

    const normalized: NormalizedHubSpotEvent = {
      id: this.generateEventId(event, metadata),
      type: entityInfo.type,
      subtype: this.extractSubtype(event.type),
      timestamp: event.timestamp,
      source: 'hubspot',
      entity,
      actor: this.normalizeActor(metadata),
      target: this.normalizeTarget(event, metadata, entity),
      context: {
        organizationId: options.organizationId,
        portalId: options.portalId,
      },
      data: this.normalizeData(event, metadata, entity, options.includeRawData),
      relationships: this.buildRelationships(metadata),
    };

    return normalized;
  }

  /**
   * Normalize batch of events
   */
  normalizeEvents(
    events: ExtractedEvent[],
    options: NormalizationOptions
  ): NormalizedHubSpotEvent[] {
    return events
      .map((event) => {
        try {
          return this.normalizeEvent(event, options);
        } catch (error) {
          console.warn(`Failed to normalize HubSpot event: ${error}`);
          return null;
        }
      })
      .filter((event): event is NormalizedHubSpotEvent => event !== null);
  }

  /**
   * Detect entity from event type
   */
  private detectEntity(eventType: string, metadata: Record<string, unknown>): string {
    // Check metadata first
    if (metadata.objectType) {
      return metadata.objectType as string;
    }

    // Parse from event type (e.g., "crm.contact.created" -> "contacts")
    const parts = eventType.split('.');
    if (parts.length >= 2) {
      const entityPart = parts[1];
      // Pluralize for HubSpot object types
      if (!entityPart.endsWith('s')) {
        return entityPart + 's';
      }
      return entityPart;
    }

    return 'unknown';
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(event: ExtractedEvent, metadata: Record<string, unknown>): string {
    const recordId = metadata.recordId || metadata.id || event.targetId;
    return `hs:${recordId}:${event.timestamp.getTime()}`;
  }

  /**
   * Extract subtype from event type
   */
  private extractSubtype(eventType: string): string | undefined {
    const parts = eventType.split('.');
    return parts.length > 2 ? parts.slice(2).join('.') : parts[parts.length - 1];
  }

  /**
   * Normalize actor
   */
  private normalizeActor(metadata: Record<string, unknown>): NormalizedHubSpotEvent['actor'] {
    const ownerId = (metadata.hubspot_owner_id || metadata.ownerId) as string;

    if (ownerId) {
      return {
        id: ownerId,
        type: 'user',
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
  ): NormalizedHubSpotEvent['target'] | undefined {
    if (!event.targetId && !metadata.recordId) return undefined;

    const targetId = (metadata.recordId || event.targetId) as string;

    let targetType: string;
    let targetName: string | undefined;

    switch (entity) {
      case 'contacts':
        targetType = 'person';
        targetName = [metadata.firstname, metadata.lastname].filter(Boolean).join(' ') || undefined;
        break;
      case 'companies':
        targetType = 'company';
        targetName = metadata.name as string;
        break;
      case 'deals':
        targetType = 'deal';
        targetName = metadata.dealname as string;
        break;
      case 'tickets':
        targetType = 'ticket';
        targetName = metadata.subject as string;
        break;
      case 'calls':
      case 'emails':
      case 'meetings':
      case 'notes':
      case 'tasks':
        targetType = 'activity';
        targetName = (metadata.subject || metadata.title || metadata.hs_call_title || metadata.hs_meeting_title) as string;
        break;
      default:
        targetType = entity.slice(0, -1); // Remove trailing 's'
        targetName = metadata.name as string;
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
    entity: string,
    includeRawData?: boolean
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // Copy key fields based on entity type
    const keyFieldsByEntity: Record<string, string[]> = {
      contacts: ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'lifecyclestage'],
      companies: ['name', 'domain', 'industry', 'phone', 'website', 'annualrevenue', 'numberofemployees', 'lifecyclestage'],
      deals: ['dealname', 'amount', 'closedate', 'dealstage', 'pipeline', 'dealtype'],
      tickets: ['subject', 'content', 'hs_pipeline', 'hs_pipeline_stage', 'hs_ticket_priority'],
      calls: ['hs_call_title', 'hs_call_status', 'hs_call_direction', 'hs_call_duration'],
      emails: ['hs_email_subject', 'hs_email_from_email', 'hs_email_to_email', 'hs_email_direction'],
      meetings: ['hs_meeting_title', 'hs_meeting_start_time', 'hs_meeting_end_time', 'hs_meeting_location'],
      notes: ['hs_note_body'],
      tasks: ['hs_task_subject', 'hs_task_status', 'hs_task_priority'],
    };

    const keyFields = keyFieldsByEntity[entity] || [];

    for (const field of keyFields) {
      if (field in metadata && metadata[field] !== null) {
        data[field] = metadata[field];
      }
    }

    // Add common fields
    if (metadata.createdAt) {
      data.createdAt = metadata.createdAt;
    }
    if (metadata.updatedAt) {
      data.updatedAt = metadata.updatedAt;
    }
    if (metadata.isArchived !== undefined) {
      data.isArchived = metadata.isArchived;
    }

    // Add amounts for deals
    if (entity === 'deals' && metadata.amount) {
      data.amount = {
        value: parseFloat(metadata.amount as string) || 0,
        probability: parseFloat(metadata.hs_deal_stage_probability as string) || 0,
        forecastAmount: parseFloat(metadata.hs_forecast_amount as string) || 0,
      };
    }

    // Add addresses for contacts/companies
    if (entity === 'contacts' || entity === 'companies') {
      const address: Record<string, unknown> = {};
      if (metadata.address) address.street = metadata.address;
      if (metadata.city) address.city = metadata.city;
      if (metadata.state) address.state = metadata.state;
      if (metadata.zip) address.postalCode = metadata.zip;
      if (metadata.country) address.country = metadata.country;

      if (Object.keys(address).length > 0) {
        data.address = address;
      }
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
    metadata: Record<string, unknown>
  ): NormalizedHubSpotEvent['relationships'] {
    const relationships: NormalizedHubSpotEvent['relationships'] = [];

    // Owner relationship
    const ownerId = (metadata.hubspot_owner_id || metadata.ownerId) as string;
    if (ownerId) {
      relationships.push({
        type: 'owner',
        targetId: ownerId,
        targetType: 'User',
      });
    }

    // Company association (from contact properties)
    if (metadata.associatedcompanyid) {
      relationships.push({
        type: 'company',
        targetId: metadata.associatedcompanyid as string,
        targetType: 'Company',
      });
    }

    // Contact associations (from engagement properties)
    if (metadata.hs_object_id && metadata.associations) {
      const associations = metadata.associations as Record<string, unknown>;
      if (associations.contacts) {
        const contactIds = (associations.contacts as any).results?.map((c: any) => c.id) || [];
        for (const contactId of contactIds) {
          relationships.push({
            type: 'contact',
            targetId: contactId,
            targetType: 'Contact',
          });
        }
      }
      if (associations.companies) {
        const companyIds = (associations.companies as any).results?.map((c: any) => c.id) || [];
        for (const companyId of companyIds) {
          relationships.push({
            type: 'company',
            targetId: companyId,
            targetType: 'Company',
          });
        }
      }
      if (associations.deals) {
        const dealIds = (associations.deals as any).results?.map((d: any) => d.id) || [];
        for (const dealId of dealIds) {
          relationships.push({
            type: 'deal',
            targetId: dealId,
            targetType: 'Deal',
          });
        }
      }
    }

    return relationships.length > 0 ? relationships : undefined;
  }
}

/**
 * Create event normalizer
 */
export function createHubSpotEventNormalizer(): HubSpotEventNormalizer {
  return new HubSpotEventNormalizer();
}
