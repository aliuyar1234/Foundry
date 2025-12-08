/**
 * SAP B1 Event Normalizer
 * Task: T069
 *
 * Normalizes events from SAP B1 into a consistent format.
 * Handles all SAP B1 entities and German localization.
 */

import { ExtractedEvent } from '../base/connector';
import { germanDocTypeMapper, GermanDocumentType } from './germanDocTypes';

export interface NormalizedSapEvent {
  id: string;
  type: string;
  subtype?: string;
  timestamp: Date;
  source: 'sap_b1';
  entity: string;
  actor: {
    id?: number;
    name?: string;
    type: 'user' | 'system';
  };
  target?: {
    id: string | number;
    type: string;
    name?: string;
    entity: string;
  };
  context: {
    organizationId: string;
    instanceId: string;
    companyDb: string;
    batchId?: string;
  };
  data: Record<string, unknown>;
  localization?: {
    germanName: string;
    formattedNumber?: string;
    category: string;
  };
  relationships?: Array<{
    type: string;
    targetId: string;
    targetType: string;
    targetEntity: string;
  }>;
}

export interface NormalizationOptions {
  organizationId: string;
  instanceId: string;
  companyDb: string;
  batchId?: string;
  includeRawData?: boolean;
  includeGermanLocalization?: boolean;
}

// Entity to event type mappings
const ENTITY_EVENT_TYPES: Record<string, { type: string; category: string }> = {
  BusinessPartners: { type: 'entity', category: 'master_data' },
  Items: { type: 'entity', category: 'master_data' },
  Orders: { type: 'transaction', category: 'sales' },
  Quotations: { type: 'transaction', category: 'sales' },
  DeliveryNotes: { type: 'transaction', category: 'logistics' },
  Invoices: { type: 'financial', category: 'sales' },
  CreditNotes: { type: 'financial', category: 'sales' },
  PurchaseOrders: { type: 'transaction', category: 'purchase' },
  PurchaseQuotations: { type: 'transaction', category: 'purchase' },
  PurchaseDeliveryNotes: { type: 'transaction', category: 'logistics' },
  PurchaseInvoices: { type: 'financial', category: 'purchase' },
  PurchaseCreditNotes: { type: 'financial', category: 'purchase' },
  IncomingPayments: { type: 'financial', category: 'banking' },
  VendorPayments: { type: 'financial', category: 'banking' },
  JournalEntries: { type: 'financial', category: 'accounting' },
  StockTransfers: { type: 'transaction', category: 'inventory' },
  InventoryTransferRequests: { type: 'transaction', category: 'inventory' },
  ApprovalRequests: { type: 'workflow', category: 'approval' },
};

export class SapB1EventNormalizer {
  /**
   * Normalize a single event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedSapEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const entity = this.detectEntity(event.type, metadata);
    const entityInfo = ENTITY_EVENT_TYPES[entity] || { type: 'unknown', category: 'unknown' };

    const normalized: NormalizedSapEvent = {
      id: this.generateEventId(event, metadata),
      type: entityInfo.type,
      subtype: this.extractSubtype(event.type),
      timestamp: event.timestamp,
      source: 'sap_b1',
      entity,
      actor: this.normalizeActor(metadata),
      target: this.normalizeTarget(event, metadata, entity),
      context: {
        organizationId: options.organizationId,
        instanceId: options.instanceId,
        companyDb: options.companyDb,
        batchId: options.batchId,
      },
      data: this.normalizeData(event, metadata, options.includeRawData),
      relationships: this.buildRelationships(metadata, entity),
    };

    // Add German localization if requested
    if (options.includeGermanLocalization) {
      normalized.localization = this.getGermanLocalization(entity, metadata);
    }

    return normalized;
  }

  /**
   * Normalize batch of events
   */
  normalizeEvents(
    events: ExtractedEvent[],
    options: NormalizationOptions
  ): NormalizedSapEvent[] {
    return events
      .map((event) => {
        try {
          return this.normalizeEvent(event, options);
        } catch (error) {
          console.warn(`Failed to normalize SAP B1 event: ${error}`);
          return null;
        }
      })
      .filter((event): event is NormalizedSapEvent => event !== null);
  }

  /**
   * Detect entity from event type
   */
  private detectEntity(eventType: string, metadata: Record<string, unknown>): string {
    // Check metadata first
    if (metadata.docType) {
      return metadata.docType as string;
    }

    // Parse from event type
    if (eventType.includes('customer') || eventType.includes('vendor') || eventType.includes('partner')) {
      return 'BusinessPartners';
    }
    if (eventType.includes('item') || eventType.includes('product')) {
      return 'Items';
    }
    if (eventType.includes('sales_order')) {
      return 'Orders';
    }
    if (eventType.includes('purchase_order')) {
      return 'PurchaseOrders';
    }
    if (eventType.includes('invoice') && !eventType.includes('vendor')) {
      return 'Invoices';
    }
    if (eventType.includes('vendor_invoice') || eventType.includes('purchase_invoice')) {
      return 'PurchaseInvoices';
    }
    if (eventType.includes('delivery')) {
      return eventType.includes('purchase') ? 'PurchaseDeliveryNotes' : 'DeliveryNotes';
    }
    if (eventType.includes('credit')) {
      return eventType.includes('purchase') ? 'PurchaseCreditNotes' : 'CreditNotes';
    }
    if (eventType.includes('payment')) {
      return eventType.includes('vendor') || eventType.includes('outgoing')
        ? 'VendorPayments'
        : 'IncomingPayments';
    }
    if (eventType.includes('approval')) {
      return 'ApprovalRequests';
    }

    return 'Unknown';
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(event: ExtractedEvent, metadata: Record<string, unknown>): string {
    const docEntry = metadata.docEntry || metadata.cardCode || event.targetId;
    return `sap:${docEntry}:${event.timestamp.getTime()}`;
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
  private normalizeActor(metadata: Record<string, unknown>): NormalizedSapEvent['actor'] {
    const userId = metadata.userId as number;
    const userName = metadata.userName as string;

    if (userId || userName) {
      return {
        id: userId,
        name: userName,
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
  ): NormalizedSapEvent['target'] | undefined {
    if (!event.targetId) return undefined;

    let targetType: string;
    let targetName: string | undefined;

    switch (entity) {
      case 'BusinessPartners':
        targetType = (metadata.cardType as string) === 'cCustomer' ? 'customer' : 'supplier';
        targetName = metadata.cardName as string;
        break;
      case 'Items':
        targetType = 'product';
        targetName = metadata.itemName as string;
        break;
      default:
        targetType = entity.toLowerCase().replace(/s$/, '');
        targetName = metadata.docNum ? `Doc ${metadata.docNum}` : undefined;
    }

    return {
      id: metadata.docEntry || metadata.cardCode || event.targetId,
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

    // Copy key fields
    const keyFields = [
      'docEntry', 'docNum', 'cardCode', 'cardName', 'itemCode', 'itemName',
      'docDate', 'docDueDate', 'docTotal', 'vatSum', 'currency',
      'status', 'cancelled', 'lineCount',
    ];

    for (const field of keyFields) {
      if (field in metadata) {
        data[field] = metadata[field];
      }
    }

    // Add amounts
    if (metadata.docTotal !== undefined) {
      data.amount = {
        total: metadata.docTotal,
        totalFC: metadata.docTotalFC,
        vat: metadata.vatSum,
        currency: metadata.currency,
      };
    }

    // Add dates
    if (metadata.docDate) {
      data.dates = {
        document: metadata.docDate,
        due: metadata.docDueDate,
        created: metadata.createdAt,
        updated: metadata.updatedAt,
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
  ): NormalizedSapEvent['relationships'] {
    const relationships: NormalizedSapEvent['relationships'] = [];

    // Business partner relationship
    if (metadata.cardCode && entity !== 'BusinessPartners') {
      const cardType = metadata.cardType as string;
      relationships.push({
        type: cardType === 'cCustomer' ? 'customer' : 'supplier',
        targetId: metadata.cardCode as string,
        targetType: 'business_partner',
        targetEntity: 'BusinessPartners',
      });
    }

    // Item relationships (for line items)
    if (metadata.itemCode && entity !== 'Items') {
      relationships.push({
        type: 'product',
        targetId: metadata.itemCode as string,
        targetType: 'item',
        targetEntity: 'Items',
      });
    }

    // Document relationships
    if (metadata.baseEntry) {
      relationships.push({
        type: 'base_document',
        targetId: String(metadata.baseEntry),
        targetType: 'document',
        targetEntity: (metadata.baseType as string) || 'Documents',
      });
    }

    return relationships.length > 0 ? relationships : undefined;
  }

  /**
   * Get German localization
   */
  private getGermanLocalization(
    entity: string,
    metadata: Record<string, unknown>
  ): NormalizedSapEvent['localization'] {
    const docType = germanDocTypeMapper.getByEntity(entity);

    if (!docType) {
      return {
        germanName: entity,
        category: 'other',
      };
    }

    const docNum = metadata.docNum as number;

    return {
      germanName: docType.germanName,
      formattedNumber: docNum
        ? germanDocTypeMapper.formatDocNumber(entity, docNum)
        : undefined,
      category: docType.category,
    };
  }
}

/**
 * Create event normalizer
 */
export function createSapB1EventNormalizer(): SapB1EventNormalizer {
  return new SapB1EventNormalizer();
}
