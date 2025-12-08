/**
 * Odoo Purchase Module Extractor
 * Task: T045
 *
 * Extracts purchase orders, RFQs, and order lines from Odoo.
 * Tracks procurement workflow state transitions.
 */

import { ExtractedEvent } from '../../base/connector';
import { OdooXmlRpcClient } from '../xmlrpcClient';
import { OdooRestClient } from '../restClient';

type OdooClient = OdooXmlRpcClient | OdooRestClient;

export interface PurchaseExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  states?: string[];
  limit?: number;
  includeLines?: boolean;
  includeRFQs?: boolean;
}

export interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  partner_ref?: string;
  state: 'draft' | 'sent' | 'to approve' | 'purchase' | 'done' | 'cancel';
  date_order: string;
  date_approve?: string;
  date_planned?: string;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  currency_id: [number, string];
  user_id?: [number, string];
  company_id: [number, string];
  order_line: number[];
  invoice_ids: number[];
  picking_ids: number[];
  origin?: string;
  notes?: string;
  create_date: string;
  write_date: string;
}

export interface PurchaseOrderLine {
  id: number;
  order_id: [number, string];
  name: string;
  product_id?: [number, string];
  product_qty: number;
  product_uom: [number, string];
  price_unit: number;
  price_subtotal: number;
  price_total: number;
  taxes_id: number[];
  qty_received: number;
  qty_invoiced: number;
  date_planned?: string;
  create_date: string;
  write_date: string;
}

const PURCHASE_ORDER_FIELDS = [
  'id', 'name', 'partner_id', 'partner_ref', 'state',
  'date_order', 'date_approve', 'date_planned',
  'amount_untaxed', 'amount_tax', 'amount_total', 'currency_id',
  'user_id', 'company_id', 'order_line', 'invoice_ids', 'picking_ids',
  'origin', 'notes', 'create_date', 'write_date',
];

const PURCHASE_LINE_FIELDS = [
  'id', 'order_id', 'name', 'product_id', 'product_qty', 'product_uom',
  'price_unit', 'price_subtotal', 'price_total', 'taxes_id',
  'qty_received', 'qty_invoiced', 'date_planned',
  'create_date', 'write_date',
];

export class OdooPurchaseExtractor {
  private client: OdooClient;

  constructor(client: OdooClient) {
    this.client = client;
  }

  /**
   * Extract purchase orders
   */
  async extractPurchaseOrders(options: PurchaseExtractionOptions): Promise<{
    events: ExtractedEvent[];
    orders: PurchaseOrder[];
    linesProcessed: number;
  }> {
    const events: ExtractedEvent[] = [];
    const orders: PurchaseOrder[] = [];
    let linesProcessed = 0;

    const domain: Array<[string, string, unknown]> = [];

    // Filter by modification date
    if (options.modifiedAfter) {
      domain.push([
        'write_date',
        '>=',
        options.modifiedAfter.toISOString().split('T')[0],
      ]);
    }

    // Filter by states
    if (options.states?.length) {
      domain.push(['state', 'in', options.states]);
    } else if (!options.includeRFQs) {
      // Exclude draft/cancelled by default
      domain.push(['state', 'in', ['purchase', 'done']]);
    }

    // Fetch orders
    const batchSize = options.limit || 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.client.searchRead<PurchaseOrder>(
        'purchase.order',
        domain,
        {
          fields: PURCHASE_ORDER_FIELDS,
          limit: batchSize,
          offset,
          order: 'write_date desc',
        }
      );

      for (const order of batch) {
        orders.push(order);

        // Create order event
        events.push(this.orderToEvent(order, options.organizationId));

        // Extract line items
        if (options.includeLines && order.order_line?.length > 0) {
          const lines = await this.client.searchRead<PurchaseOrderLine>(
            'purchase.order.line',
            [['id', 'in', order.order_line]],
            { fields: PURCHASE_LINE_FIELDS }
          );

          for (const line of lines) {
            events.push(this.lineToEvent(line, order, options.organizationId));
            linesProcessed++;
          }
        }
      }

      hasMore = batch.length === batchSize;
      offset += batchSize;
    }

    return { events, orders, linesProcessed };
  }

  /**
   * Extract RFQs (draft and sent)
   */
  async extractRFQs(options: PurchaseExtractionOptions): Promise<{
    events: ExtractedEvent[];
    rfqs: PurchaseOrder[];
  }> {
    const result = await this.extractPurchaseOrders({
      ...options,
      states: ['draft', 'sent'],
      includeRFQs: true,
    });

    return {
      events: result.events,
      rfqs: result.orders,
    };
  }

  /**
   * Extract pending approvals
   */
  async extractPendingApprovals(options: PurchaseExtractionOptions): Promise<{
    events: ExtractedEvent[];
    orders: PurchaseOrder[];
  }> {
    const result = await this.extractPurchaseOrders({
      ...options,
      states: ['to approve'],
    });

    return {
      events: result.events,
      orders: result.orders,
    };
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: number): Promise<PurchaseOrder | null> {
    const orders = await this.client.searchRead<PurchaseOrder>(
      'purchase.order',
      [['id', '=', orderId]],
      { fields: PURCHASE_ORDER_FIELDS }
    );

    return orders[0] || null;
  }

  /**
   * Get order lines
   */
  async getOrderLines(orderId: number): Promise<PurchaseOrderLine[]> {
    return this.client.searchRead<PurchaseOrderLine>(
      'purchase.order.line',
      [['order_id', '=', orderId]],
      { fields: PURCHASE_LINE_FIELDS }
    );
  }

  /**
   * Get orders by vendor
   */
  async getOrdersByVendor(
    partnerId: number,
    options: { modifiedAfter?: Date; limit?: number } = {}
  ): Promise<PurchaseOrder[]> {
    const domain: Array<[string, string, unknown]> = [
      ['partner_id', '=', partnerId],
    ];

    if (options.modifiedAfter) {
      domain.push([
        'write_date',
        '>=',
        options.modifiedAfter.toISOString().split('T')[0],
      ]);
    }

    return this.client.searchRead<PurchaseOrder>('purchase.order', domain, {
      fields: PURCHASE_ORDER_FIELDS,
      limit: options.limit || 100,
      order: 'date_order desc',
    });
  }

  /**
   * Get purchase statistics
   */
  async getPurchaseStats(options: {
    dateFrom?: Date;
    dateTo?: Date;
    userId?: number;
  } = {}): Promise<{
    totalOrders: number;
    confirmedOrders: number;
    pendingApprovals: number;
    totalSpend: number;
    averageOrderValue: number;
    topVendors: Array<{ vendorId: number; vendorName: string; orderCount: number; totalSpend: number }>;
  }> {
    const baseDomain: Array<[string, string, unknown]> = [];

    if (options.dateFrom) {
      baseDomain.push(['date_order', '>=', options.dateFrom.toISOString().split('T')[0]]);
    }

    if (options.dateTo) {
      baseDomain.push(['date_order', '<=', options.dateTo.toISOString().split('T')[0]]);
    }

    if (options.userId) {
      baseDomain.push(['user_id', '=', options.userId]);
    }

    // Get confirmed orders
    const confirmedDomain = [...baseDomain, ['state', 'in', ['purchase', 'done']]];
    const confirmedOrders = await this.client.searchRead<PurchaseOrder>(
      'purchase.order',
      confirmedDomain,
      { fields: ['id', 'partner_id', 'amount_total'] }
    );

    // Get pending approvals
    const pendingDomain = [...baseDomain, ['state', '=', 'to approve']];
    const pendingCount = await this.client.searchCount('purchase.order', pendingDomain);

    // Get total orders (all states except cancel)
    const totalDomain = [...baseDomain, ['state', '!=', 'cancel']];
    const totalCount = await this.client.searchCount('purchase.order', totalDomain);

    const totalSpend = confirmedOrders.reduce((sum, o) => sum + o.amount_total, 0);
    const averageOrderValue =
      confirmedOrders.length > 0 ? totalSpend / confirmedOrders.length : 0;

    // Calculate top vendors
    const vendorStats = new Map<number, { name: string; orderCount: number; totalSpend: number }>();

    for (const order of confirmedOrders) {
      const [vendorId, vendorName] = order.partner_id;
      const existing = vendorStats.get(vendorId) || {
        name: vendorName,
        orderCount: 0,
        totalSpend: 0,
      };

      existing.orderCount++;
      existing.totalSpend += order.amount_total;
      vendorStats.set(vendorId, existing);
    }

    const topVendors = Array.from(vendorStats.entries())
      .map(([vendorId, stats]) => ({
        vendorId,
        vendorName: stats.name,
        orderCount: stats.orderCount,
        totalSpend: stats.totalSpend,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10);

    return {
      totalOrders: totalCount,
      confirmedOrders: confirmedOrders.length,
      pendingApprovals: pendingCount,
      totalSpend,
      averageOrderValue,
      topVendors,
    };
  }

  /**
   * Convert order to event
   */
  private orderToEvent(order: PurchaseOrder, organizationId: string): ExtractedEvent {
    const createdAt = new Date(order.create_date);
    const updatedAt = new Date(order.write_date);
    const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;

    let eventType: string;
    switch (order.state) {
      case 'draft':
        eventType = isNew ? 'erp.rfq.created' : 'erp.rfq.updated';
        break;
      case 'sent':
        eventType = 'erp.rfq.sent';
        break;
      case 'to approve':
        eventType = 'erp.purchase.pending_approval';
        break;
      case 'purchase':
        eventType = 'erp.purchase.confirmed';
        break;
      case 'done':
        eventType = 'erp.purchase.done';
        break;
      case 'cancel':
        eventType = 'erp.purchase.cancelled';
        break;
      default:
        eventType = isNew ? 'erp.purchase.created' : 'erp.purchase.updated';
    }

    return {
      type: eventType,
      timestamp: updatedAt,
      actorId: order.user_id?.[1],
      targetId: String(order.id),
      metadata: {
        source: 'odoo',
        organizationId,
        orderId: order.id,
        orderNumber: order.name,
        vendorId: order.partner_id[0],
        vendorName: order.partner_id[1],
        vendorRef: order.partner_ref,
        status: order.state,
        orderDate: order.date_order,
        approvalDate: order.date_approve,
        plannedDate: order.date_planned,
        subtotal: order.amount_untaxed,
        taxAmount: order.amount_tax,
        totalAmount: order.amount_total,
        currency: order.currency_id[1],
        buyerId: order.user_id?.[0],
        buyerName: order.user_id?.[1],
        companyId: order.company_id[0],
        lineCount: order.order_line?.length || 0,
        invoiceCount: order.invoice_ids?.length || 0,
        receiptCount: order.picking_ids?.length || 0,
        origin: order.origin,
        createdAt: order.create_date,
        updatedAt: order.write_date,
      },
    };
  }

  /**
   * Convert line to event
   */
  private lineToEvent(
    line: PurchaseOrderLine,
    order: PurchaseOrder,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'erp.purchase.line',
      timestamp: new Date(line.write_date),
      actorId: undefined,
      targetId: String(line.id),
      metadata: {
        source: 'odoo',
        organizationId,
        lineId: line.id,
        orderId: order.id,
        orderNumber: order.name,
        productId: line.product_id?.[0],
        productName: line.product_id?.[1],
        description: line.name,
        quantity: line.product_qty,
        unitOfMeasure: line.product_uom[1],
        unitPrice: line.price_unit,
        subtotal: line.price_subtotal,
        total: line.price_total,
        quantityReceived: line.qty_received,
        quantityInvoiced: line.qty_invoiced,
        plannedDate: line.date_planned,
        createdAt: line.create_date,
        updatedAt: line.write_date,
      },
    };
  }
}

/**
 * Create purchase extractor
 */
export function createOdooPurchaseExtractor(
  client: OdooClient
): OdooPurchaseExtractor {
  return new OdooPurchaseExtractor(client);
}
