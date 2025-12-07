/**
 * Odoo Data Extractors
 * Extract customers, products, orders, and invoices from Odoo
 */

import {
  OdooXmlRpcClient,
  OdooJsonRpcClient,
  OdooPartner,
  OdooProduct,
  OdooSaleOrder,
  OdooPurchaseOrder,
  OdooAccountMove,
} from '../odooClient.js';
import { ExtractedEvent } from '../../base/connector.js';

type OdooClient = OdooXmlRpcClient | OdooJsonRpcClient;

export interface OdooExtractionOptions {
  organizationId: string;
  lookbackDate?: Date;
  batchSize?: number;
}

export interface OdooExtractionResult {
  events: ExtractedEvent[];
  recordsProcessed: number;
}

// Common fields for incremental sync
const PARTNER_FIELDS = [
  'id', 'name', 'email', 'phone', 'street', 'city', 'zip',
  'country_id', 'is_company', 'customer_rank', 'supplier_rank',
  'create_date', 'write_date',
];

const PRODUCT_FIELDS = [
  'id', 'name', 'default_code', 'barcode', 'type',
  'list_price', 'standard_price', 'categ_id',
  'create_date', 'write_date',
];

const SALE_ORDER_FIELDS = [
  'id', 'name', 'partner_id', 'state', 'date_order',
  'amount_total', 'amount_untaxed', 'amount_tax', 'currency_id',
  'order_line', 'create_date', 'write_date',
];

const PURCHASE_ORDER_FIELDS = [
  'id', 'name', 'partner_id', 'state', 'date_order',
  'amount_total', 'amount_untaxed', 'amount_tax', 'currency_id',
  'order_line', 'create_date', 'write_date',
];

const INVOICE_FIELDS = [
  'id', 'name', 'partner_id', 'move_type', 'state',
  'invoice_date', 'date', 'amount_total', 'amount_untaxed',
  'amount_tax', 'amount_residual', 'currency_id',
  'create_date', 'write_date',
];

/**
 * Convert Odoo partner to ExtractedEvent
 */
function partnerToEvent(
  partner: OdooPartner,
  organizationId: string,
  eventType: 'erp.customer.created' | 'erp.customer.updated' | 'erp.vendor.created' | 'erp.vendor.updated'
): ExtractedEvent {
  const timestamp = new Date(partner.write_date);

  return {
    type: eventType,
    timestamp,
    actorId: undefined,
    targetId: String(partner.id),
    metadata: {
      source: 'odoo',
      organizationId,
      partnerId: partner.id,
      name: partner.name,
      email: partner.email,
      phone: partner.phone,
      address: {
        street: partner.street,
        city: partner.city,
        zip: partner.zip,
        country: partner.country_id?.[1],
      },
      isCompany: partner.is_company,
      customerRank: partner.customer_rank,
      supplierRank: partner.supplier_rank,
      createdAt: partner.create_date,
      updatedAt: partner.write_date,
    },
    rawData: { odooPartner: partner },
  };
}

/**
 * Convert Odoo product to ExtractedEvent
 */
function productToEvent(
  product: OdooProduct,
  organizationId: string,
  eventType: 'erp.product.created' | 'erp.product.updated'
): ExtractedEvent {
  const timestamp = new Date(product.write_date);

  return {
    type: eventType,
    timestamp,
    actorId: undefined,
    targetId: String(product.id),
    metadata: {
      source: 'odoo',
      organizationId,
      productId: product.id,
      name: product.name,
      sku: product.default_code,
      barcode: product.barcode,
      type: product.type,
      listPrice: product.list_price,
      costPrice: product.standard_price,
      category: product.categ_id?.[1],
      createdAt: product.create_date,
      updatedAt: product.write_date,
    },
    rawData: { odooProduct: product },
  };
}

/**
 * Convert Odoo sale order to ExtractedEvent
 */
function saleOrderToEvent(
  order: OdooSaleOrder,
  organizationId: string,
  eventType: 'erp.sale.created' | 'erp.sale.updated' | 'erp.sale.confirmed' | 'erp.sale.cancelled'
): ExtractedEvent {
  const timestamp = new Date(order.write_date);

  return {
    type: eventType,
    timestamp,
    actorId: undefined,
    targetId: String(order.id),
    metadata: {
      source: 'odoo',
      organizationId,
      orderId: order.id,
      orderNumber: order.name,
      customerId: order.partner_id?.[0],
      customerName: order.partner_id?.[1],
      status: order.state,
      orderDate: order.date_order,
      totalAmount: order.amount_total,
      subtotal: order.amount_untaxed,
      taxAmount: order.amount_tax,
      currency: order.currency_id?.[1],
      lineCount: order.order_line?.length || 0,
      createdAt: order.create_date,
      updatedAt: order.write_date,
    },
    rawData: { odooSaleOrder: order },
  };
}

/**
 * Convert Odoo purchase order to ExtractedEvent
 */
function purchaseOrderToEvent(
  order: OdooPurchaseOrder,
  organizationId: string,
  eventType: 'erp.purchase.created' | 'erp.purchase.updated' | 'erp.purchase.confirmed' | 'erp.purchase.cancelled'
): ExtractedEvent {
  const timestamp = new Date(order.write_date);

  return {
    type: eventType,
    timestamp,
    actorId: undefined,
    targetId: String(order.id),
    metadata: {
      source: 'odoo',
      organizationId,
      orderId: order.id,
      orderNumber: order.name,
      vendorId: order.partner_id?.[0],
      vendorName: order.partner_id?.[1],
      status: order.state,
      orderDate: order.date_order,
      totalAmount: order.amount_total,
      subtotal: order.amount_untaxed,
      taxAmount: order.amount_tax,
      currency: order.currency_id?.[1],
      lineCount: order.order_line?.length || 0,
      createdAt: order.create_date,
      updatedAt: order.write_date,
    },
    rawData: { odooPurchaseOrder: order },
  };
}

/**
 * Convert Odoo invoice to ExtractedEvent
 */
function invoiceToEvent(
  invoice: OdooAccountMove,
  organizationId: string,
  eventType: 'erp.invoice.created' | 'erp.invoice.updated' | 'erp.invoice.posted' | 'erp.invoice.paid'
): ExtractedEvent {
  const timestamp = new Date(invoice.write_date);

  // Determine invoice direction
  const isInbound = invoice.move_type.startsWith('in_');
  const isRefund = invoice.move_type.includes('refund');

  return {
    type: eventType,
    timestamp,
    actorId: undefined,
    targetId: String(invoice.id),
    metadata: {
      source: 'odoo',
      organizationId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.name,
      partnerId: invoice.partner_id?.[0],
      partnerName: invoice.partner_id?.[1],
      invoiceType: invoice.move_type,
      isInbound,
      isRefund,
      status: invoice.state,
      invoiceDate: invoice.invoice_date || invoice.date,
      totalAmount: invoice.amount_total,
      subtotal: invoice.amount_untaxed,
      taxAmount: invoice.amount_tax,
      balanceDue: invoice.amount_residual,
      currency: invoice.currency_id?.[1],
      isPaid: invoice.amount_residual === 0 && invoice.state === 'posted',
      createdAt: invoice.create_date,
      updatedAt: invoice.write_date,
    },
    rawData: { odooInvoice: invoice },
  };
}

/**
 * Extract customers (partners with customer_rank > 0)
 */
export async function extractCustomers(
  client: OdooClient,
  options: OdooExtractionOptions
): Promise<OdooExtractionResult> {
  const events: ExtractedEvent[] = [];
  const batchSize = options.batchSize || 100;

  const domain: Array<[string, string, unknown]> = [['customer_rank', '>', 0]];

  if (options.lookbackDate) {
    domain.push(['write_date', '>=', options.lookbackDate.toISOString().split('T')[0]]);
  }

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const partners = await client.searchRead<OdooPartner>('res.partner', {
      domain,
      fields: PARTNER_FIELDS,
      limit: batchSize,
      offset,
      order: 'write_date desc',
    });

    for (const partner of partners) {
      const createdAt = new Date(partner.create_date);
      const updatedAt = new Date(partner.write_date);

      // Determine if this is a create or update event
      const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000; // Within 1 minute
      const eventType = isNew ? 'erp.customer.created' : 'erp.customer.updated';

      events.push(partnerToEvent(partner, options.organizationId, eventType));
    }

    hasMore = partners.length === batchSize;
    offset += batchSize;
  }

  return { events, recordsProcessed: events.length };
}

/**
 * Extract vendors (partners with supplier_rank > 0)
 */
export async function extractVendors(
  client: OdooClient,
  options: OdooExtractionOptions
): Promise<OdooExtractionResult> {
  const events: ExtractedEvent[] = [];
  const batchSize = options.batchSize || 100;

  const domain: Array<[string, string, unknown]> = [['supplier_rank', '>', 0]];

  if (options.lookbackDate) {
    domain.push(['write_date', '>=', options.lookbackDate.toISOString().split('T')[0]]);
  }

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const partners = await client.searchRead<OdooPartner>('res.partner', {
      domain,
      fields: PARTNER_FIELDS,
      limit: batchSize,
      offset,
      order: 'write_date desc',
    });

    for (const partner of partners) {
      const createdAt = new Date(partner.create_date);
      const updatedAt = new Date(partner.write_date);
      const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;
      const eventType = isNew ? 'erp.vendor.created' : 'erp.vendor.updated';

      events.push(partnerToEvent(partner, options.organizationId, eventType));
    }

    hasMore = partners.length === batchSize;
    offset += batchSize;
  }

  return { events, recordsProcessed: events.length };
}

/**
 * Extract products
 */
export async function extractProducts(
  client: OdooClient,
  options: OdooExtractionOptions
): Promise<OdooExtractionResult> {
  const events: ExtractedEvent[] = [];
  const batchSize = options.batchSize || 100;

  const domain: Array<[string, string, unknown]> = [];

  if (options.lookbackDate) {
    domain.push(['write_date', '>=', options.lookbackDate.toISOString().split('T')[0]]);
  }

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const products = await client.searchRead<OdooProduct>('product.product', {
      domain,
      fields: PRODUCT_FIELDS,
      limit: batchSize,
      offset,
      order: 'write_date desc',
    });

    for (const product of products) {
      const createdAt = new Date(product.create_date);
      const updatedAt = new Date(product.write_date);
      const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;
      const eventType = isNew ? 'erp.product.created' : 'erp.product.updated';

      events.push(productToEvent(product, options.organizationId, eventType));
    }

    hasMore = products.length === batchSize;
    offset += batchSize;
  }

  return { events, recordsProcessed: events.length };
}

/**
 * Extract sale orders
 */
export async function extractSaleOrders(
  client: OdooClient,
  options: OdooExtractionOptions
): Promise<OdooExtractionResult> {
  const events: ExtractedEvent[] = [];
  const batchSize = options.batchSize || 100;

  const domain: Array<[string, string, unknown]> = [];

  if (options.lookbackDate) {
    domain.push(['write_date', '>=', options.lookbackDate.toISOString().split('T')[0]]);
  }

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const orders = await client.searchRead<OdooSaleOrder>('sale.order', {
      domain,
      fields: SALE_ORDER_FIELDS,
      limit: batchSize,
      offset,
      order: 'write_date desc',
    });

    for (const order of orders) {
      let eventType: 'erp.sale.created' | 'erp.sale.updated' | 'erp.sale.confirmed' | 'erp.sale.cancelled';

      if (order.state === 'cancel') {
        eventType = 'erp.sale.cancelled';
      } else if (order.state === 'sale' || order.state === 'done') {
        eventType = 'erp.sale.confirmed';
      } else {
        const createdAt = new Date(order.create_date);
        const updatedAt = new Date(order.write_date);
        const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;
        eventType = isNew ? 'erp.sale.created' : 'erp.sale.updated';
      }

      events.push(saleOrderToEvent(order, options.organizationId, eventType));
    }

    hasMore = orders.length === batchSize;
    offset += batchSize;
  }

  return { events, recordsProcessed: events.length };
}

/**
 * Extract purchase orders
 */
export async function extractPurchaseOrders(
  client: OdooClient,
  options: OdooExtractionOptions
): Promise<OdooExtractionResult> {
  const events: ExtractedEvent[] = [];
  const batchSize = options.batchSize || 100;

  const domain: Array<[string, string, unknown]> = [];

  if (options.lookbackDate) {
    domain.push(['write_date', '>=', options.lookbackDate.toISOString().split('T')[0]]);
  }

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const orders = await client.searchRead<OdooPurchaseOrder>('purchase.order', {
      domain,
      fields: PURCHASE_ORDER_FIELDS,
      limit: batchSize,
      offset,
      order: 'write_date desc',
    });

    for (const order of orders) {
      let eventType: 'erp.purchase.created' | 'erp.purchase.updated' | 'erp.purchase.confirmed' | 'erp.purchase.cancelled';

      if (order.state === 'cancel') {
        eventType = 'erp.purchase.cancelled';
      } else if (order.state === 'purchase' || order.state === 'done') {
        eventType = 'erp.purchase.confirmed';
      } else {
        const createdAt = new Date(order.create_date);
        const updatedAt = new Date(order.write_date);
        const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;
        eventType = isNew ? 'erp.purchase.created' : 'erp.purchase.updated';
      }

      events.push(purchaseOrderToEvent(order, options.organizationId, eventType));
    }

    hasMore = orders.length === batchSize;
    offset += batchSize;
  }

  return { events, recordsProcessed: events.length };
}

/**
 * Extract invoices
 */
export async function extractInvoices(
  client: OdooClient,
  options: OdooExtractionOptions
): Promise<OdooExtractionResult> {
  const events: ExtractedEvent[] = [];
  const batchSize = options.batchSize || 100;

  // Only get actual invoices, not journal entries
  const domain: Array<[string, string, unknown]> = [
    ['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']],
  ];

  if (options.lookbackDate) {
    domain.push(['write_date', '>=', options.lookbackDate.toISOString().split('T')[0]]);
  }

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const invoices = await client.searchRead<OdooAccountMove>('account.move', {
      domain,
      fields: INVOICE_FIELDS,
      limit: batchSize,
      offset,
      order: 'write_date desc',
    });

    for (const invoice of invoices) {
      let eventType: 'erp.invoice.created' | 'erp.invoice.updated' | 'erp.invoice.posted' | 'erp.invoice.paid';

      if (invoice.state === 'posted' && invoice.amount_residual === 0) {
        eventType = 'erp.invoice.paid';
      } else if (invoice.state === 'posted') {
        eventType = 'erp.invoice.posted';
      } else {
        const createdAt = new Date(invoice.create_date);
        const updatedAt = new Date(invoice.write_date);
        const isNew = Math.abs(updatedAt.getTime() - createdAt.getTime()) < 60000;
        eventType = isNew ? 'erp.invoice.created' : 'erp.invoice.updated';
      }

      events.push(invoiceToEvent(invoice, options.organizationId, eventType));
    }

    hasMore = invoices.length === batchSize;
    offset += batchSize;
  }

  return { events, recordsProcessed: events.length };
}

/**
 * Extract all Odoo data
 */
export async function extractAllOdooData(
  client: OdooClient,
  options: OdooExtractionOptions
): Promise<{
  events: ExtractedEvent[];
  stats: {
    customers: number;
    vendors: number;
    products: number;
    saleOrders: number;
    purchaseOrders: number;
    invoices: number;
    total: number;
  };
}> {
  const allEvents: ExtractedEvent[] = [];
  const stats = {
    customers: 0,
    vendors: 0,
    products: 0,
    saleOrders: 0,
    purchaseOrders: 0,
    invoices: 0,
    total: 0,
  };

  // Extract customers
  try {
    const customersResult = await extractCustomers(client, options);
    allEvents.push(...customersResult.events);
    stats.customers = customersResult.recordsProcessed;
  } catch (error) {
    console.error('Failed to extract customers:', error);
  }

  // Extract vendors
  try {
    const vendorsResult = await extractVendors(client, options);
    allEvents.push(...vendorsResult.events);
    stats.vendors = vendorsResult.recordsProcessed;
  } catch (error) {
    console.error('Failed to extract vendors:', error);
  }

  // Extract products
  try {
    const productsResult = await extractProducts(client, options);
    allEvents.push(...productsResult.events);
    stats.products = productsResult.recordsProcessed;
  } catch (error) {
    console.error('Failed to extract products:', error);
  }

  // Extract sale orders
  try {
    const salesResult = await extractSaleOrders(client, options);
    allEvents.push(...salesResult.events);
    stats.saleOrders = salesResult.recordsProcessed;
  } catch (error) {
    console.error('Failed to extract sale orders:', error);
  }

  // Extract purchase orders
  try {
    const purchasesResult = await extractPurchaseOrders(client, options);
    allEvents.push(...purchasesResult.events);
    stats.purchaseOrders = purchasesResult.recordsProcessed;
  } catch (error) {
    console.error('Failed to extract purchase orders:', error);
  }

  // Extract invoices
  try {
    const invoicesResult = await extractInvoices(client, options);
    allEvents.push(...invoicesResult.events);
    stats.invoices = invoicesResult.recordsProcessed;
  } catch (error) {
    console.error('Failed to extract invoices:', error);
  }

  stats.total = allEvents.length;

  // Sort by timestamp
  allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return { events: allEvents, stats };
}
