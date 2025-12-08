/**
 * DATEV Event Normalizer
 * Task: T142
 *
 * Normalizes events from DATEV into a consistent format.
 * Handles all DATEV-specific event types and German accounting structures.
 */

import { ExtractedEvent } from '../base/connector';

export interface NormalizedDatevEvent {
  id: string;
  type: string;
  subtype?: string;
  timestamp: Date;
  source: 'datev';
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
    fiscalYear?: number;
    period?: string;
  };
  data: Record<string, unknown>;
  accounting?: {
    accountNumber?: string;
    contraAccountNumber?: string;
    amount?: number;
    currency?: string;
    taxCode?: string;
    costCenter?: string;
    costObject?: string;
  };
  relationships?: Array<{
    type: string;
    targetId: string;
    targetType: string;
  }>;
}

export interface NormalizationOptions {
  organizationId: string;
  fiscalYear?: number;
  includeRawData?: boolean;
}

// Event type mappings
const ENTITY_EVENT_TYPES: Record<string, { type: string; category: string }> = {
  document: { type: 'transaction', category: 'accounting' },
  invoice: { type: 'transaction', category: 'accounting' },
  credit_note: { type: 'transaction', category: 'accounting' },
  journal_entry: { type: 'entry', category: 'accounting' },
  account: { type: 'entity', category: 'chart_of_accounts' },
  customer: { type: 'entity', category: 'master_data' },
  vendor: { type: 'entity', category: 'master_data' },
  business_partner: { type: 'entity', category: 'master_data' },
  cost_center: { type: 'entity', category: 'cost_accounting' },
  cost_object: { type: 'entity', category: 'cost_accounting' },
  tax_code: { type: 'entity', category: 'tax' },
};

// German document type mappings
const GERMAN_DOC_TYPES: Record<string, { de: string; en: string }> = {
  invoice: { de: 'Rechnung', en: 'Invoice' },
  credit_note: { de: 'Gutschrift', en: 'Credit Note' },
  debit_note: { de: 'Lastschrift', en: 'Debit Note' },
  payment: { de: 'Zahlung', en: 'Payment' },
  receipt: { de: 'Beleg', en: 'Receipt' },
};

export class DatevEventNormalizer {
  /**
   * Normalize a single event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedDatevEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const entity = this.detectEntity(event.type);
    const entityInfo = ENTITY_EVENT_TYPES[entity] || { type: 'unknown', category: 'unknown' };

    const normalized: NormalizedDatevEvent = {
      id: this.generateEventId(event, metadata),
      type: entityInfo.type,
      subtype: this.extractSubtype(event.type),
      timestamp: event.timestamp,
      source: 'datev',
      entity,
      actor: this.normalizeActor(metadata),
      target: this.normalizeTarget(event, metadata, entity),
      context: {
        organizationId: options.organizationId,
        fiscalYear: options.fiscalYear || this.extractFiscalYear(event),
        period: this.extractPeriod(event),
      },
      data: this.normalizeData(event, metadata, entity, options.includeRawData),
      accounting: this.extractAccountingData(metadata),
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
  ): NormalizedDatevEvent[] {
    return events
      .map((event) => {
        try {
          return this.normalizeEvent(event, options);
        } catch (error) {
          console.warn(`Failed to normalize DATEV event: ${error}`);
          return null;
        }
      })
      .filter((event): event is NormalizedDatevEvent => event !== null);
  }

  /**
   * Detect entity from event type
   */
  private detectEntity(eventType: string): string {
    // Parse from event type (e.g., "accounting.document.invoice" -> "invoice")
    const parts = eventType.split('.');
    if (parts.length >= 3) {
      return parts[2];
    }
    if (parts.length >= 2) {
      return parts[1];
    }
    return 'unknown';
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(event: ExtractedEvent, metadata: Record<string, unknown>): string {
    const targetId = event.targetId || metadata.documentId || metadata.entryId || metadata.accountNumber;
    return `datev:${targetId}:${event.timestamp.getTime()}`;
  }

  /**
   * Extract subtype from event type
   */
  private extractSubtype(eventType: string): string | undefined {
    const parts = eventType.split('.');
    return parts.length > 2 ? parts.slice(2).join('.') : undefined;
  }

  /**
   * Extract fiscal year from event
   */
  private extractFiscalYear(event: ExtractedEvent): number {
    const metadata = event.metadata as Record<string, unknown>;
    const dateStr = (metadata.date || metadata.createdAt) as string;

    if (dateStr) {
      const date = new Date(dateStr);
      return date.getFullYear();
    }

    return event.timestamp.getFullYear();
  }

  /**
   * Extract period from event
   */
  private extractPeriod(event: ExtractedEvent): string {
    const metadata = event.metadata as Record<string, unknown>;
    const dateStr = (metadata.date || metadata.createdAt) as string;

    if (dateStr) {
      const date = new Date(dateStr);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    return `${event.timestamp.getFullYear()}-${String(event.timestamp.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Normalize actor
   */
  private normalizeActor(metadata: Record<string, unknown>): NormalizedDatevEvent['actor'] {
    // DATEV typically doesn't track individual users
    return { type: 'system' };
  }

  /**
   * Normalize target
   */
  private normalizeTarget(
    event: ExtractedEvent,
    metadata: Record<string, unknown>,
    entity: string
  ): NormalizedDatevEvent['target'] | undefined {
    if (!event.targetId) return undefined;

    let targetType: string;
    let targetName: string | undefined;
    let targetEntity: string;

    switch (entity) {
      case 'document':
      case 'invoice':
      case 'credit_note':
        targetType = 'document';
        targetEntity = 'document';
        targetName = metadata.documentNumber as string;
        break;
      case 'journal_entry':
        targetType = 'entry';
        targetEntity = 'journal';
        targetName = metadata.description as string;
        break;
      case 'account':
        targetType = 'account';
        targetEntity = 'chart_of_accounts';
        targetName = metadata.name as string;
        break;
      case 'customer':
      case 'vendor':
      case 'business_partner':
        targetType = entity;
        targetEntity = 'business_partner';
        targetName = metadata.name as string;
        break;
      case 'cost_center':
        targetType = 'cost_center';
        targetEntity = 'cost_accounting';
        targetName = (metadata.nameDe || metadata.name) as string;
        break;
      case 'cost_object':
        targetType = 'cost_object';
        targetEntity = 'cost_accounting';
        targetName = (metadata.nameDe || metadata.name) as string;
        break;
      default:
        targetType = entity;
        targetEntity = entity;
    }

    return {
      id: event.targetId,
      type: targetType,
      name: targetName,
      entity: targetEntity,
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
      document: [
        'documentNumber', 'date', 'dueDate', 'amount', 'currency',
        'taxAmount', 'description', 'status',
      ],
      invoice: [
        'documentNumber', 'date', 'dueDate', 'amount', 'currency',
        'taxAmount', 'description', 'status',
      ],
      journal_entry: [
        'date', 'amount', 'currency', 'description', 'documentNumber',
      ],
      account: [
        'accountNumber', 'name', 'accountType', 'balance', 'currency', 'isActive',
      ],
      customer: [
        'partnerNumber', 'name', 'email', 'phone', 'address', 'paymentTerms',
      ],
      vendor: [
        'partnerNumber', 'name', 'email', 'phone', 'address', 'paymentTerms',
      ],
      cost_center: [
        'number', 'name', 'nameDe', 'budgetAmount', 'currency',
      ],
      cost_object: [
        'number', 'name', 'nameDe', 'objectType', 'status', 'budgetAmount', 'actualAmount',
      ],
    };

    const keyFields = keyFieldsByEntity[entity] || [];

    for (const field of keyFields) {
      if (field in metadata && metadata[field] !== null && metadata[field] !== undefined) {
        data[field] = metadata[field];
      }
    }

    // Add German labels for document types
    if (entity in GERMAN_DOC_TYPES) {
      const labels = GERMAN_DOC_TYPES[entity];
      data.typeLabel = labels.en;
      data.typeLabelDe = labels.de;
    }

    // Add common fields
    if (metadata.createdAt) {
      data.createdAt = metadata.createdAt;
    }
    if (metadata.modifiedAt) {
      data.modifiedAt = metadata.modifiedAt;
    }

    // Include raw data if requested
    if (includeRawData && event.rawData) {
      data._raw = event.rawData;
    }

    return data;
  }

  /**
   * Extract accounting-specific data
   */
  private extractAccountingData(
    metadata: Record<string, unknown>
  ): NormalizedDatevEvent['accounting'] | undefined {
    const accounting: NormalizedDatevEvent['accounting'] = {};
    let hasData = false;

    if (metadata.accountNumber) {
      accounting.accountNumber = metadata.accountNumber as string;
      hasData = true;
    }
    if (metadata.contraAccountNumber) {
      accounting.contraAccountNumber = metadata.contraAccountNumber as string;
      hasData = true;
    }
    if (metadata.amount !== undefined) {
      accounting.amount = metadata.amount as number;
      hasData = true;
    }
    if (metadata.currency) {
      accounting.currency = metadata.currency as string;
      hasData = true;
    }
    if (metadata.taxCode) {
      accounting.taxCode = metadata.taxCode as string;
      hasData = true;
    }
    if (metadata.costCenter) {
      accounting.costCenter = metadata.costCenter as string;
      hasData = true;
    }
    if (metadata.costObject) {
      accounting.costObject = metadata.costObject as string;
      hasData = true;
    }

    return hasData ? accounting : undefined;
  }

  /**
   * Build relationships
   */
  private buildRelationships(
    metadata: Record<string, unknown>
  ): NormalizedDatevEvent['relationships'] {
    const relationships: NormalizedDatevEvent['relationships'] = [];

    // Account relationship
    if (metadata.accountNumber) {
      relationships.push({
        type: 'account',
        targetId: `datev:account:${metadata.accountNumber}`,
        targetType: 'Account',
      });
    }

    // Contra account relationship
    if (metadata.contraAccountNumber) {
      relationships.push({
        type: 'contra_account',
        targetId: `datev:account:${metadata.contraAccountNumber}`,
        targetType: 'Account',
      });
    }

    // Cost center relationship
    if (metadata.costCenter) {
      relationships.push({
        type: 'cost_center',
        targetId: `datev:kst:${metadata.costCenter}`,
        targetType: 'CostCenter',
      });
    }

    // Cost object relationship
    if (metadata.costObject) {
      relationships.push({
        type: 'cost_object',
        targetId: `datev:ktr:${metadata.costObject}`,
        targetType: 'CostObject',
      });
    }

    // Document relationship
    if (metadata.documentId) {
      relationships.push({
        type: 'document',
        targetId: `datev:doc:${metadata.documentId}`,
        targetType: 'Document',
      });
    }

    // Business partner relationship
    if (metadata.partnerId) {
      relationships.push({
        type: 'business_partner',
        targetId: `datev:partner:${metadata.partnerId}`,
        targetType: 'BusinessPartner',
      });
    }

    return relationships.length > 0 ? relationships : undefined;
  }

  /**
   * Group events by fiscal period
   */
  groupByPeriod(events: NormalizedDatevEvent[]): Map<string, NormalizedDatevEvent[]> {
    const groups = new Map<string, NormalizedDatevEvent[]>();

    for (const event of events) {
      const period = event.context.period || 'unknown';
      if (!groups.has(period)) {
        groups.set(period, []);
      }
      groups.get(period)!.push(event);
    }

    return groups;
  }

  /**
   * Group events by account
   */
  groupByAccount(events: NormalizedDatevEvent[]): Map<string, NormalizedDatevEvent[]> {
    const groups = new Map<string, NormalizedDatevEvent[]>();

    for (const event of events) {
      const accountNumber = event.accounting?.accountNumber || 'unknown';
      if (!groups.has(accountNumber)) {
        groups.set(accountNumber, []);
      }
      groups.get(accountNumber)!.push(event);
    }

    return groups;
  }

  /**
   * Calculate event statistics
   */
  calculateStatistics(events: NormalizedDatevEvent[]): {
    totalEvents: number;
    byType: Record<string, number>;
    byEntity: Record<string, number>;
    byPeriod: Record<string, number>;
    totalAmount: number;
    timeRange: { start: Date; end: Date } | null;
  } {
    const byType: Record<string, number> = {};
    const byEntity: Record<string, number> = {};
    const byPeriod: Record<string, number> = {};
    let totalAmount = 0;
    let minTime: Date | null = null;
    let maxTime: Date | null = null;

    for (const event of events) {
      // By type
      byType[event.type] = (byType[event.type] || 0) + 1;

      // By entity
      byEntity[event.entity] = (byEntity[event.entity] || 0) + 1;

      // By period
      const period = event.context.period || 'unknown';
      byPeriod[period] = (byPeriod[period] || 0) + 1;

      // Total amount
      if (event.accounting?.amount) {
        totalAmount += event.accounting.amount;
      }

      // Time range
      if (!minTime || event.timestamp < minTime) {
        minTime = event.timestamp;
      }
      if (!maxTime || event.timestamp > maxTime) {
        maxTime = event.timestamp;
      }
    }

    return {
      totalEvents: events.length,
      byType,
      byEntity,
      byPeriod,
      totalAmount,
      timeRange: minTime && maxTime ? { start: minTime, end: maxTime } : null,
    };
  }
}

/**
 * Create event normalizer
 */
export function createDatevEventNormalizer(): DatevEventNormalizer {
  return new DatevEventNormalizer();
}
