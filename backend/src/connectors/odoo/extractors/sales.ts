/**
 * Odoo Sales Module Extractor
 * Task: T044
 *
 * Extracts sales orders, quotations, and order lines from Odoo.
 * Tracks sales workflow state transitions.
 */

import { ExtractedEvent } from '../../base/connector';
import { OdooXmlRpcClient } from '../xmlrpcClient';
import { OdooRestClient } from '../restClient';

type OdooClient = OdooXmlRpcClient | OdooRestClient;

export interface SalesExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  states?: string[];
  limit?: number;
  includeLines?: boolean;
  includeQuotations?: boolean;
}

export interface SaleOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  partner_invoice_id?: [number, string];
  partner_shipping_id?: [number, string];
  state: 'draft' | 'sent' | 'sale' | 'done' | 'cancel';
  date_order: string;
  validity_date?: string;
  commitment_date?: string;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  currency_id: [number, string];
  user_id?: [number, string];
  team_id?: [number, string];
  company_id: [number, string];
  order_line: number[];
  invoice_ids: number[];
  picking_ids: number[];
  origin?: string;
  client_order_ref?: string;
  note?: string;
  create_date: string;
  write_date: string;
}

export interface SaleOrderLine {
  id: number;
  order_id: [number, string];
  name: string;
  product_id?: [number, string];
  product_uom_qty: number;
  product_uom: [number, string];
  price_unit: number;
  discount: number;
  price_subtotal: number;
  price_total: number;
  tax_id: number[];
  qty_delivered: number;
  qty_invoiced: number;
  create_date: string;
  write_date: string;
}

const SALE_ORDER_FIELDS = [
  'id', 'name', 'partner_id', 'partner_invoice_id', 'partner_shipping_id',
  'state', 'date_order', 'validity_date', 'commitment_date',
  'amount_untaxed', 'amount_tax', 'amount_total', 'currency_id',
  'user_id', 'team_id', 'company_id', 'order_line', 'invoice_ids',
  'picking_ids', 'origin', 'client_order_ref', 'note',
  'create_date', 'write_date',
];

const SALE_LINE_FIELDS = [
  'id', 'order_id', 'name', 'product_id', 'product_uom_qty', 'product_uom',
  'price_unit', 'discount', 'price_subtotal', 'price_total', 'tax_id',
  'qty_delivered', 'qty_invoiced', 'create_date', 'write_date',
];

export class OdooSalesExtractor {
  private client: OdooClient;

  constructor(client: OdooClient) {
    this.client = client;
  }

  /**
   * Extract sales orders
   */
  async extractSalesOrders(options: SalesExtractionOptions): Promise<{
    events: ExtractedEvent[];
    orders: SaleOrder[];
    linesProcessed: number;
  }> {
    const events: ExtractedEvent[] = [];
    const orders: SaleOrder[] = [];
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
    } else if (!options.includeQuotations) {
      // Exclude draft/cancelled by default
      domain.push(['state', 'in', ['sale', 'done']]);
    }

    // Fetch orders
    const batchSize = options.limit || 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.client.searchRead<SaleOrder>('sale.order', domain, {
        fields: SALE_ORDER_FIELDS,
        limit: batchSize,
        offset,
        order: 'write_date desc',
      });

      for (const order of batch) {
        orders.push(order);

        // Create order event
        events.push(this.orderToEvent(order, options.organizationId));

        // Extract line items
        if (options.includeLines && order.order_line?.length > 0) {
          const lines = await this.client.searchRead<SaleOrderLine>(
            'sale.order.line',
            [['id', 'in', order.order_line]],
            { fields: SALE_LINE_FIELDS }
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
   * Extract quotations (draft and sent)
   */
  async extractQuotations(options: SalesExtractionOptions): Promise<{
    events: ExtractedEvent[];
    quotations: SaleOrder[];
  }> {
    const result = await this.extractSalesOrders({
      ...options,
      states: ['draft', 'sent'],
      includeQuotations: true,
    });

    return {
      events: result.events,
      quotations: result.orders,
    };
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: number): Promise<SaleOrder | null> {
    const orders = await this.client.searchRead<SaleOrder>(
      'sale.order',
      [['id', '=', orderId]],
      { fields: SALE_ORDER_FIELDS }
    );

    return orders[0] || null;
  }

  /**
   * Get order lines
   */
  async getOrderLines(orderId: number): Promise<SaleOrderLine[]> {
    return this.client.searchRead<SaleOrderLine>(
      'sale.order.line',
      [['order_id', '=', orderId]],
      { fields: SALE_LINE_FIELDS }
    );
  }

  /**
   * Get orders by customer
   */
  async getOrdersByCustomer(
    partnerId: number,
    options: { modifiedAfter?: Date; limit?: number } = {}
  ): Promise<SaleOrder[]> {
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

    return this.client.searchRead<SaleOrder>('sale.order', domain, {
      fields: SALE_ORDER_FIELDS,
      limit: options.limit || 100,
      order: 'date_order desc',
    });
  }

  /**
   * Get sales statistics
   */
  async getSalesStats(options: {
    dateFrom?: Date;
    dateTo?: Date;
    userId?: number;
    teamId?: number;
  } = {}): Promise<{
    totalOrders: number;
    confirmedOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    topProducts: Array<{ productId: number; productName: string; quantity: number; revenue: number }>;
  }> {
    const domain: Array<[string, string, unknown]> = [
      ['state', 'in', ['sale', 'done']],
    ];

    if (options.dateFrom) {
      domain.push(['date_order', '>=', options.dateFrom.toISOString().split('T')[0]]);
    }

    if (options.dateTo) {
      domain.push(['date_order', '<=', options.dateTo.toISOString().split('T')[0]]);
    }

    if (options.userId) {
      domain.push(['user_id', '=', options.userId]);
    }

    if (options.teamId) {
      domain.push(['team_id', '=', options.teamId]);
    }

    const orders = await this.client.searchRead<SaleOrder>('sale.order', domain, {
      fields: ['id', 'amount_total', 'order_line'],
    });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.amount_total, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get top products
    const allLineIds = orders.flatMap((o) => o.order_line);
    const productStats = new Map<number, { name: string; quantity: number; revenue: number }>();

    if (allLineIds.length > 0) {
      const lines = await this.client.searchRead<SaleOrderLine>(
        'sale.order.line',
        [['id', 'in', allLineIds]],
        { fields: ['product_id', 'product_uom_qty', 'price_subtotal'] }
      );

      for (const line of lines) {
        if (!line.product_id) continue;

        const [productId, productName] = line.product_id;
        const existing = productStats.get(productId) || {
          name: productName,
          quantity: 0,
          revenue: 0,
        };

        existing.quantity += line.product_uom_qty;
        existing.revenue += line.price_subtotal;
        productStats.set(productId, existing);
      }
    }

    const topProducts = Array.from(productStats.entries())
      .map(([productId, stats]) => ({
        productId,
        productName: stats.name,
        quantity: stats.quantity,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalOrders,
      confirmedOrders: totalOrders,
      totalRevenue,
      averageOrderValue,
      topProducts,
    };
  }

  /**
   * Convert order to event
   */
  private orderToEvent(order: SaleOrder, organizationId: string): ExtractedEvent {
    const createdAt = new Date(order.create_date);
    const updatedAt = new Date(order.write_date);
    const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;

    let eventType: string;
    switch (order.state) {
      case 'draft':
        eventType = isNew ? 'erp.quotation.created' : 'erp.quotation.updated';
        break;
      case 'sent':
        eventType = 'erp.quotation.sent';
        break;
      case 'sale':
        eventType = 'erp.sale.confirmed';
        break;
      case 'done':
        eventType = 'erp.sale.done';
        break;
      case 'cancel':
        eventType = 'erp.sale.cancelled';
        break;
      default:
        eventType = isNew ? 'erp.sale.created' : 'erp.sale.updated';
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
        customerId: order.partner_id[0],
        customerName: order.partner_id[1],
        invoicePartnerId: order.partner_invoice_id?.[0],
        shippingPartnerId: order.partner_shipping_id?.[0],
        status: order.state,
        orderDate: order.date_order,
        validityDate: order.validity_date,
        commitmentDate: order.commitment_date,
        subtotal: order.amount_untaxed,
        taxAmount: order.amount_tax,
        totalAmount: order.amount_total,
        currency: order.currency_id[1],
        salespersonId: order.user_id?.[0],
        salespersonName: order.user_id?.[1],
        teamId: order.team_id?.[0],
        teamName: order.team_id?.[1],
        companyId: order.company_id[0],
        lineCount: order.order_line?.length || 0,
        invoiceCount: order.invoice_ids?.length || 0,
        deliveryCount: order.picking_ids?.length || 0,
        origin: order.origin,
        customerRef: order.client_order_ref,
        createdAt: order.create_date,
        updatedAt: order.write_date,
      },
    };
  }

  /**
   * Convert line to event
   */
  private lineToEvent(
    line: SaleOrderLine,
    order: SaleOrder,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'erp.sale.line',
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
        quantity: line.product_uom_qty,
        unitOfMeasure: line.product_uom[1],
        unitPrice: line.price_unit,
        discount: line.discount,
        subtotal: line.price_subtotal,
        total: line.price_total,
        quantityDelivered: line.qty_delivered,
        quantityInvoiced: line.qty_invoiced,
        createdAt: line.create_date,
        updatedAt: line.write_date,
      },
    };
  }
}

/**
 * Create sales extractor
 */
export function createOdooSalesExtractor(client: OdooClient): OdooSalesExtractor {
  return new OdooSalesExtractor(client);
}
