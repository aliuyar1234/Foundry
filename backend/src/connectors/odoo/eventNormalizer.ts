/**
 * Odoo Event Normalizer
 * Task: T051
 *
 * Normalizes events from Odoo into a consistent format.
 * Handles all Odoo modules and custom fields.
 */

import { ExtractedEvent } from '../base/connector';

export interface NormalizedEvent {
  id: string;
  type: string;
  subtype?: string;
  timestamp: Date;
  source: 'odoo';
  module: string;
  actor: {
    id?: number;
    email?: string;
    name?: string;
    type: 'user' | 'system' | 'automated';
  };
  target?: {
    id: number;
    type: string;
    name?: string;
    model: string;
  };
  context: {
    organizationId: string;
    instanceId: string;
    companyId?: number;
    batchId?: string;
  };
  data: Record<string, unknown>;
  relationships?: Array<{
    type: string;
    targetId: string;
    targetType: string;
    targetModel: string;
  }>;
}

export interface NormalizationOptions {
  organizationId: string;
  instanceId: string;
  companyId?: number;
  batchId?: string;
  includeRawData?: boolean;
}

// Module detection from model name
const MODULE_MAPPINGS: Record<string, string> = {
  'res.partner': 'contacts',
  'res.company': 'base',
  'res.users': 'base',
  'product.product': 'product',
  'product.template': 'product',
  'product.category': 'product',
  'sale.order': 'sales',
  'sale.order.line': 'sales',
  'purchase.order': 'purchase',
  'purchase.order.line': 'purchase',
  'account.move': 'accounting',
  'account.move.line': 'accounting',
  'account.payment': 'accounting',
  'stock.picking': 'inventory',
  'stock.move': 'inventory',
  'stock.quant': 'inventory',
  'stock.warehouse': 'inventory',
  'stock.location': 'inventory',
  'crm.lead': 'crm',
  'crm.stage': 'crm',
  'project.project': 'project',
  'project.task': 'project',
  'hr.employee': 'hr',
  'hr.department': 'hr',
};

// Event type mappings
const EVENT_TYPE_MAPPINGS: Record<string, { type: string; subtype?: string }> = {
  'erp.customer.created': { type: 'entity', subtype: 'customer_created' },
  'erp.customer.updated': { type: 'entity', subtype: 'customer_updated' },
  'erp.vendor.created': { type: 'entity', subtype: 'vendor_created' },
  'erp.vendor.updated': { type: 'entity', subtype: 'vendor_updated' },
  'erp.product.created': { type: 'entity', subtype: 'product_created' },
  'erp.product.updated': { type: 'entity', subtype: 'product_updated' },
  'erp.sale.created': { type: 'transaction', subtype: 'sale_created' },
  'erp.sale.updated': { type: 'transaction', subtype: 'sale_updated' },
  'erp.sale.confirmed': { type: 'transaction', subtype: 'sale_confirmed' },
  'erp.sale.cancelled': { type: 'transaction', subtype: 'sale_cancelled' },
  'erp.quotation.created': { type: 'transaction', subtype: 'quotation_created' },
  'erp.quotation.sent': { type: 'transaction', subtype: 'quotation_sent' },
  'erp.purchase.created': { type: 'transaction', subtype: 'purchase_created' },
  'erp.purchase.confirmed': { type: 'transaction', subtype: 'purchase_confirmed' },
  'erp.purchase.cancelled': { type: 'transaction', subtype: 'purchase_cancelled' },
  'erp.rfq.created': { type: 'transaction', subtype: 'rfq_created' },
  'erp.rfq.sent': { type: 'transaction', subtype: 'rfq_sent' },
  'erp.invoice.created': { type: 'financial', subtype: 'invoice_created' },
  'erp.invoice.posted': { type: 'financial', subtype: 'invoice_posted' },
  'erp.invoice.paid': { type: 'financial', subtype: 'invoice_paid' },
  'erp.transfer.created': { type: 'logistics', subtype: 'transfer_created' },
  'erp.transfer.done': { type: 'logistics', subtype: 'transfer_done' },
  'erp.stock.moved': { type: 'logistics', subtype: 'stock_moved' },
  'erp.stock.level': { type: 'logistics', subtype: 'stock_level' },
  'erp.workflow.transition': { type: 'workflow', subtype: 'state_change' },
};

export class OdooEventNormalizer {
  /**
   * Normalize a single event
   */
  normalizeEvent(
    event: ExtractedEvent,
    options: NormalizationOptions
  ): NormalizedEvent {
    const metadata = event.metadata as Record<string, unknown>;
    const model = (metadata.model as string) || this.detectModel(event.type);
    const module = MODULE_MAPPINGS[model] || 'unknown';

    const typeMapping = EVENT_TYPE_MAPPINGS[event.type] || {
      type: 'unknown',
      subtype: event.type,
    };

    const normalized: NormalizedEvent = {
      id: `odoo:${model}:${event.targetId}:${event.timestamp.getTime()}`,
      type: typeMapping.type,
      subtype: typeMapping.subtype,
      timestamp: event.timestamp,
      source: 'odoo',
      module,
      actor: this.normalizeActor(event, metadata),
      target: this.normalizeTarget(event, metadata, model),
      context: {
        organizationId: options.organizationId,
        instanceId: options.instanceId,
        companyId: options.companyId || (metadata.companyId as number),
        batchId: options.batchId,
      },
      data: this.normalizeData(event, metadata, options.includeRawData),
      relationships: this.buildRelationships(metadata, model),
    };

    return normalized;
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
   * Detect model from event type
   */
  private detectModel(eventType: string): string {
    if (eventType.includes('customer') || eventType.includes('vendor')) {
      return 'res.partner';
    }
    if (eventType.includes('product')) {
      return 'product.product';
    }
    if (eventType.includes('sale') || eventType.includes('quotation')) {
      return 'sale.order';
    }
    if (eventType.includes('purchase') || eventType.includes('rfq')) {
      return 'purchase.order';
    }
    if (eventType.includes('invoice')) {
      return 'account.move';
    }
    if (eventType.includes('transfer') || eventType.includes('picking')) {
      return 'stock.picking';
    }
    if (eventType.includes('stock')) {
      return 'stock.move';
    }
    return 'unknown';
  }

  /**
   * Normalize actor information
   */
  private normalizeActor(
    event: ExtractedEvent,
    metadata: Record<string, unknown>
  ): NormalizedEvent['actor'] {
    // Check for user information in various fields
    const userId =
      (metadata.userId as number) ||
      (metadata.user_id as number) ||
      (metadata.salespersonId as number) ||
      (metadata.buyerId as number);

    const userName =
      (metadata.userName as string) ||
      (metadata.user_name as string) ||
      (metadata.salespersonName as string) ||
      (metadata.buyerName as string) ||
      event.actorId;

    const userEmail = metadata.userEmail as string;

    if (userId || userName) {
      return {
        id: userId,
        name: userName,
        email: userEmail,
        type: 'user',
      };
    }

    // System or automated action
    if (event.type.includes('automated') || event.type.includes('system')) {
      return { type: 'system' };
    }

    return { type: 'automated' };
  }

  /**
   * Normalize target information
   */
  private normalizeTarget(
    event: ExtractedEvent,
    metadata: Record<string, unknown>,
    model: string
  ): NormalizedEvent['target'] | undefined {
    if (!event.targetId) return undefined;

    // Get target name from various fields
    const targetName =
      (metadata.name as string) ||
      (metadata.orderNumber as string) ||
      (metadata.invoiceNumber as string) ||
      (metadata.pickingName as string) ||
      (metadata.productName as string);

    // Determine target type
    let targetType: string;
    switch (model) {
      case 'res.partner':
        targetType = metadata.isCompany ? 'company' : 'contact';
        break;
      case 'product.product':
        targetType = 'product';
        break;
      case 'sale.order':
        targetType = metadata.status === 'draft' ? 'quotation' : 'sales_order';
        break;
      case 'purchase.order':
        targetType = metadata.status === 'draft' ? 'rfq' : 'purchase_order';
        break;
      case 'account.move':
        targetType = this.getInvoiceType(metadata);
        break;
      case 'stock.picking':
        targetType = 'transfer';
        break;
      default:
        targetType = model.replace('.', '_');
    }

    return {
      id: parseInt(event.targetId, 10),
      type: targetType,
      name: targetName,
      model,
    };
  }

  /**
   * Get invoice type from metadata
   */
  private getInvoiceType(metadata: Record<string, unknown>): string {
    const moveType = metadata.invoiceType as string;
    switch (moveType) {
      case 'out_invoice':
        return 'customer_invoice';
      case 'out_refund':
        return 'customer_credit_note';
      case 'in_invoice':
        return 'vendor_bill';
      case 'in_refund':
        return 'vendor_credit_note';
      default:
        return 'invoice';
    }
  }

  /**
   * Normalize event data
   */
  private normalizeData(
    event: ExtractedEvent,
    metadata: Record<string, unknown>,
    includeRawData?: boolean
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // Copy relevant fields based on event type
    const relevantFields = this.getRelevantFields(event.type);

    for (const field of relevantFields) {
      if (field in metadata) {
        data[field] = metadata[field];
      }
    }

    // Add amounts if present
    if (metadata.totalAmount !== undefined) {
      data.amount = {
        total: metadata.totalAmount,
        subtotal: metadata.subtotal,
        tax: metadata.taxAmount,
        currency: metadata.currency,
      };
    }

    // Add dates if present
    if (metadata.orderDate || metadata.invoiceDate || metadata.date) {
      data.dates = {
        order: metadata.orderDate,
        invoice: metadata.invoiceDate,
        due: metadata.dueDate,
        delivery: metadata.deliveryDate,
        created: metadata.createdAt,
        modified: metadata.updatedAt,
      };
    }

    // Add status information
    if (metadata.status) {
      data.status = {
        current: metadata.status,
        previous: metadata.previousStatus,
      };
    }

    // Include raw data if requested
    if (includeRawData && event.rawData) {
      data._raw = event.rawData;
    }

    return data;
  }

  /**
   * Get relevant fields for event type
   */
  private getRelevantFields(eventType: string): string[] {
    if (eventType.includes('customer') || eventType.includes('vendor')) {
      return [
        'name', 'email', 'phone', 'address', 'isCompany',
        'customerRank', 'supplierRank',
      ];
    }

    if (eventType.includes('product')) {
      return [
        'name', 'sku', 'barcode', 'type', 'category',
        'listPrice', 'costPrice',
      ];
    }

    if (eventType.includes('sale') || eventType.includes('purchase')) {
      return [
        'orderNumber', 'customerId', 'customerName', 'vendorId', 'vendorName',
        'status', 'lineCount', 'invoiceCount', 'deliveryCount',
      ];
    }

    if (eventType.includes('invoice')) {
      return [
        'invoiceNumber', 'invoiceType', 'partnerId', 'partnerName',
        'status', 'isPaid', 'balanceDue',
      ];
    }

    if (eventType.includes('transfer') || eventType.includes('stock')) {
      return [
        'pickingName', 'productId', 'productName', 'quantity',
        'sourceLocation', 'destLocation', 'status',
      ];
    }

    return [];
  }

  /**
   * Build relationships from metadata
   */
  private buildRelationships(
    metadata: Record<string, unknown>,
    model: string
  ): NormalizedEvent['relationships'] {
    const relationships: NormalizedEvent['relationships'] = [];

    // Partner relationships
    if (metadata.customerId) {
      relationships.push({
        type: 'customer',
        targetId: String(metadata.customerId),
        targetType: 'contact',
        targetModel: 'res.partner',
      });
    }

    if (metadata.vendorId) {
      relationships.push({
        type: 'vendor',
        targetId: String(metadata.vendorId),
        targetType: 'contact',
        targetModel: 'res.partner',
      });
    }

    // Product relationships
    if (metadata.productId) {
      relationships.push({
        type: 'product',
        targetId: String(metadata.productId),
        targetType: 'product',
        targetModel: 'product.product',
      });
    }

    // Order relationships
    if (metadata.orderId && model !== 'sale.order' && model !== 'purchase.order') {
      const orderModel = metadata.orderNumber?.toString().startsWith('S')
        ? 'sale.order'
        : 'purchase.order';
      relationships.push({
        type: 'order',
        targetId: String(metadata.orderId),
        targetType: 'order',
        targetModel: orderModel,
      });
    }

    // Invoice relationships
    if (metadata.invoiceId && model !== 'account.move') {
      relationships.push({
        type: 'invoice',
        targetId: String(metadata.invoiceId),
        targetType: 'invoice',
        targetModel: 'account.move',
      });
    }

    // Location relationships (for inventory)
    if (metadata.sourceLocationId) {
      relationships.push({
        type: 'source_location',
        targetId: String(metadata.sourceLocationId),
        targetType: 'location',
        targetModel: 'stock.location',
      });
    }

    if (metadata.destLocationId) {
      relationships.push({
        type: 'destination_location',
        targetId: String(metadata.destLocationId),
        targetType: 'location',
        targetModel: 'stock.location',
      });
    }

    // User relationships
    if (metadata.salespersonId) {
      relationships.push({
        type: 'salesperson',
        targetId: String(metadata.salespersonId),
        targetType: 'user',
        targetModel: 'res.users',
      });
    }

    return relationships.length > 0 ? relationships : undefined;
  }
}

/**
 * Create event normalizer
 */
export function createOdooEventNormalizer(): OdooEventNormalizer {
  return new OdooEventNormalizer();
}
