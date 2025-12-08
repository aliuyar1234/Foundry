/**
 * BMD Event Normalizer
 * Task: T156
 *
 * Normalizes events from BMD NTCS into a consistent format.
 * Handles all BMD-specific event types and Austrian accounting structures.
 */

import { ExtractedEvent } from '../base/connector';

export interface NormalizedBmdEvent {
  id: string;
  type: string;
  subtype?: string;
  timestamp: Date;
  source: 'bmd';
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
    netAmount?: number;
    taxAmount?: number;
    currency?: string;
    taxCode?: string;
    costCenter?: string;
    costObject?: string;
  };
  austrian?: {
    steuernummer?: string; // Austrian tax number
    uid?: string; // Austrian UID (Umsatzsteuer-Identifikationsnummer)
    firmenbuch?: string; // Company register number
    documentType?: string; // Austrian document type
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

// Event type mappings for BMD entities
const ENTITY_EVENT_TYPES: Record<string, { type: string; category: string }> = {
  document: { type: 'transaction', category: 'accounting' },
  booking: { type: 'transaction', category: 'accounting' },
  invoice: { type: 'transaction', category: 'accounting' },
  credit_note: { type: 'transaction', category: 'accounting' },
  journal_entry: { type: 'entry', category: 'accounting' },
  account: { type: 'entity', category: 'chart_of_accounts' },
  customer: { type: 'entity', category: 'master_data' },
  vendor: { type: 'entity', category: 'master_data' },
  business_partner: { type: 'entity', category: 'master_data' },
  cost_center: { type: 'entity', category: 'cost_accounting' },
  cost_object: { type: 'entity', category: 'cost_accounting' },
  tax_report: { type: 'report', category: 'tax' },
};

// Austrian document type mappings
const AUSTRIAN_DOC_TYPES: Record<string, { de: string; en: string }> = {
  invoice: { de: 'Rechnung', en: 'Invoice' },
  credit_note: { de: 'Gutschrift', en: 'Credit Note' },
  debit_note: { de: 'Lastschrift', en: 'Debit Note' },
  payment: { de: 'Zahlung', en: 'Payment' },
  receipt: { de: 'Beleg', en: 'Receipt' },
  incoming_invoice: { de: 'Eingangsrechnung', en: 'Incoming Invoice' },
  outgoing_invoice: { de: 'Ausgangsrechnung', en: 'Outgoing Invoice' },
  bank_statement: { de: 'Kontoauszug', en: 'Bank Statement' },
};

export class BmdEventNormalizer {
  /**
   * Normalize a single event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedBmdEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const entity = this.detectEntity(event.type);
    const entityInfo = ENTITY_EVENT_TYPES[entity] || { type: 'unknown', category: 'unknown' };

    const normalized: NormalizedBmdEvent = {
      id: this.generateEventId(event, metadata),
      type: entityInfo.type,
      subtype: this.extractSubtype(event.type),
      timestamp: event.timestamp,
      source: 'bmd',
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
      austrian: this.extractAustrianData(metadata),
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
  ): NormalizedBmdEvent[] {
    return events
      .map((event) => {
        try {
          return this.normalizeEvent(event, options);
        } catch (error) {
          console.warn(`Failed to normalize BMD event: ${error}`);
          return null;
        }
      })
      .filter((event): event is NormalizedBmdEvent => event !== null);
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
    const targetId = event.targetId || metadata.documentId || metadata.entryId || metadata.accountNumber || metadata.id;
    return `bmd:${targetId}:${event.timestamp.getTime()}`;
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
    const dateStr = (metadata.date || metadata.postingDate || metadata.documentDate || metadata.createdAt) as string;

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
    const dateStr = (metadata.date || metadata.postingDate || metadata.documentDate || metadata.createdAt) as string;

    if (dateStr) {
      const date = new Date(dateStr);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    return `${event.timestamp.getFullYear()}-${String(event.timestamp.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Normalize actor
   */
  private normalizeActor(metadata: Record<string, unknown>): NormalizedBmdEvent['actor'] {
    // BMD typically doesn't track individual users in NTCS files
    const userId = metadata.userId || metadata.createdBy;
    const userName = metadata.userName || metadata.createdByName;

    if (userId) {
      return {
        id: userId as string,
        name: userName as string | undefined,
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
  ): NormalizedBmdEvent['target'] | undefined {
    if (!event.targetId) return undefined;

    let targetType: string;
    let targetName: string | undefined;
    let targetEntity: string;

    switch (entity) {
      case 'document':
      case 'booking':
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
        targetName = metadata.name as string;
        break;
      case 'cost_object':
        targetType = 'cost_object';
        targetEntity = 'cost_accounting';
        targetName = metadata.name as string;
        break;
      case 'tax_report':
        targetType = 'tax_report';
        targetEntity = 'tax';
        targetName = metadata.reportName as string;
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
        'documentNumber', 'documentType', 'documentDate', 'postingDate', 'dueDate',
        'amount', 'netAmount', 'taxAmount', 'currency', 'description', 'status',
      ],
      booking: [
        'documentNumber', 'documentType', 'documentDate', 'postingDate', 'dueDate',
        'amount', 'netAmount', 'taxAmount', 'currency', 'description', 'status',
      ],
      invoice: [
        'documentNumber', 'documentDate', 'dueDate', 'amount', 'netAmount',
        'taxAmount', 'currency', 'description', 'status',
      ],
      journal_entry: [
        'postingDate', 'debitAmount', 'creditAmount', 'currency', 'description',
        'documentNumber', 'documentId',
      ],
      account: [
        'number', 'name', 'accountClass', 'accountType', 'balance', 'currency',
        'isActive', 'parentNumber', 'taxCode',
      ],
      customer: [
        'number', 'name', 'shortName', 'taxNumber', 'vatNumber', 'email',
        'phone', 'fax', 'website', 'address', 'accountNumber', 'paymentTermsDays',
        'creditLimit', 'isActive',
      ],
      vendor: [
        'number', 'name', 'shortName', 'taxNumber', 'vatNumber', 'email',
        'phone', 'fax', 'website', 'address', 'accountNumber', 'paymentTermsDays',
        'creditLimit', 'isActive',
      ],
      business_partner: [
        'number', 'name', 'shortName', 'type', 'taxNumber', 'vatNumber', 'email',
        'phone', 'fax', 'website', 'address', 'accountNumber', 'paymentTermsDays',
        'creditLimit', 'isActive',
      ],
      cost_center: [
        'id', 'number', 'name', 'description', 'isActive', 'parentId',
      ],
      cost_object: [
        'id', 'number', 'name', 'description', 'objectType', 'status',
        'budgetAmount', 'actualAmount',
      ],
      tax_report: [
        'reportName', 'reportType', 'periodStart', 'periodEnd', 'taxAmount',
        'netAmount', 'submittedAt', 'status',
      ],
    };

    const keyFields = keyFieldsByEntity[entity] || [];

    for (const field of keyFields) {
      if (field in metadata && metadata[field] !== null && metadata[field] !== undefined) {
        data[field] = metadata[field];
      }
    }

    // Add Austrian labels for document types
    if (entity in AUSTRIAN_DOC_TYPES) {
      const labels = AUSTRIAN_DOC_TYPES[entity];
      data.typeLabel = labels.en;
      data.typeLabelDe = labels.de;
    } else if (metadata.documentType && typeof metadata.documentType === 'string') {
      const docType = metadata.documentType.toLowerCase();
      if (docType in AUSTRIAN_DOC_TYPES) {
        const labels = AUSTRIAN_DOC_TYPES[docType];
        data.typeLabel = labels.en;
        data.typeLabelDe = labels.de;
      }
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
  ): NormalizedBmdEvent['accounting'] | undefined {
    const accounting: NormalizedBmdEvent['accounting'] = {};
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
    if (metadata.netAmount !== undefined) {
      accounting.netAmount = metadata.netAmount as number;
      hasData = true;
    }
    if (metadata.taxAmount !== undefined) {
      accounting.taxAmount = metadata.taxAmount as number;
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
   * Extract Austrian-specific data
   */
  private extractAustrianData(
    metadata: Record<string, unknown>
  ): NormalizedBmdEvent['austrian'] | undefined {
    const austrian: NormalizedBmdEvent['austrian'] = {};
    let hasData = false;

    // Austrian tax number (Steuernummer)
    if (metadata.steuernummer || metadata.taxNumber) {
      austrian.steuernummer = (metadata.steuernummer || metadata.taxNumber) as string;
      hasData = true;
    }

    // Austrian UID (VAT ID)
    if (metadata.uid || metadata.vatNumber) {
      austrian.uid = (metadata.uid || metadata.vatNumber) as string;
      hasData = true;
    }

    // Company register number (Firmenbuch)
    if (metadata.firmenbuch || metadata.companyRegisterNumber) {
      austrian.firmenbuch = (metadata.firmenbuch || metadata.companyRegisterNumber) as string;
      hasData = true;
    }

    // Document type
    if (metadata.documentType) {
      austrian.documentType = metadata.documentType as string;
      hasData = true;
    }

    return hasData ? austrian : undefined;
  }

  /**
   * Build relationships
   */
  private buildRelationships(
    metadata: Record<string, unknown>
  ): NormalizedBmdEvent['relationships'] {
    const relationships: NormalizedBmdEvent['relationships'] = [];

    // Account relationship
    if (metadata.accountNumber) {
      relationships.push({
        type: 'account',
        targetId: `bmd:account:${metadata.accountNumber}`,
        targetType: 'Account',
      });
    }

    // Contra account relationship
    if (metadata.contraAccountNumber) {
      relationships.push({
        type: 'contra_account',
        targetId: `bmd:account:${metadata.contraAccountNumber}`,
        targetType: 'Account',
      });
    }

    // Cost center relationship
    if (metadata.costCenter) {
      relationships.push({
        type: 'cost_center',
        targetId: `bmd:costcenter:${metadata.costCenter}`,
        targetType: 'CostCenter',
      });
    }

    // Cost object relationship
    if (metadata.costObject) {
      relationships.push({
        type: 'cost_object',
        targetId: `bmd:costobject:${metadata.costObject}`,
        targetType: 'CostObject',
      });
    }

    // Document relationship
    if (metadata.documentId) {
      relationships.push({
        type: 'document',
        targetId: `bmd:doc:${metadata.documentId}`,
        targetType: 'Document',
      });
    }

    // Business partner relationship
    if (metadata.partnerId) {
      relationships.push({
        type: 'business_partner',
        targetId: `bmd:partner:${metadata.partnerId}`,
        targetType: 'BusinessPartner',
      });
    }

    return relationships.length > 0 ? relationships : undefined;
  }

  /**
   * Group events by fiscal period
   */
  groupByPeriod(events: NormalizedBmdEvent[]): Map<string, NormalizedBmdEvent[]> {
    const groups = new Map<string, NormalizedBmdEvent[]>();

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
  groupByAccount(events: NormalizedBmdEvent[]): Map<string, NormalizedBmdEvent[]> {
    const groups = new Map<string, NormalizedBmdEvent[]>();

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
  calculateStatistics(events: NormalizedBmdEvent[]): {
    totalEvents: number;
    byType: Record<string, number>;
    byEntity: Record<string, number>;
    byPeriod: Record<string, number>;
    totalAmount: number;
    totalNetAmount: number;
    totalTaxAmount: number;
    timeRange: { start: Date; end: Date } | null;
  } {
    const byType: Record<string, number> = {};
    const byEntity: Record<string, number> = {};
    const byPeriod: Record<string, number> = {};
    let totalAmount = 0;
    let totalNetAmount = 0;
    let totalTaxAmount = 0;
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

      // Total amounts
      if (event.accounting?.amount) {
        totalAmount += event.accounting.amount;
      }
      if (event.accounting?.netAmount) {
        totalNetAmount += event.accounting.netAmount;
      }
      if (event.accounting?.taxAmount) {
        totalTaxAmount += event.accounting.taxAmount;
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
      totalNetAmount,
      totalTaxAmount,
      timeRange: minTime && maxTime ? { start: minTime, end: maxTime } : null,
    };
  }
}

/**
 * Create event normalizer
 */
export function createBmdEventNormalizer(): BmdEventNormalizer {
  return new BmdEventNormalizer();
}
