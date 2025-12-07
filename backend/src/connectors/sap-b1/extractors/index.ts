/**
 * SAP Business One Data Extractors
 * Extract business partners, items, orders, and invoices from SAP B1
 */

import {
  SapB1Client,
  SapBusinessPartner,
  SapItem,
  SapOrder,
  SapInvoice,
} from '../sapClient.js';
import { ExtractedEvent } from '../../base/connector.js';

export interface SapExtractionOptions {
  organizationId: string;
  lookbackDate?: Date;
}

export interface SapExtractionResult {
  events: ExtractedEvent[];
  recordsProcessed: number;
}

/**
 * Convert SAP Business Partner to ExtractedEvent
 */
function businessPartnerToEvent(
  bp: SapBusinessPartner,
  organizationId: string
): ExtractedEvent {
  const timestamp = new Date(bp.UpdateDate);
  const isCustomer = bp.CardType === 'cCustomer';
  const isSupplier = bp.CardType === 'cSupplier';

  let eventType: string;
  if (isCustomer) {
    eventType = 'erp.customer.updated';
  } else if (isSupplier) {
    eventType = 'erp.vendor.updated';
  } else {
    eventType = 'erp.lead.updated';
  }

  // Get primary address
  const primaryAddress = bp.BPAddresses?.find(a => a.AddressType === 'bo_BillTo');

  return {
    type: eventType,
    timestamp,
    actorId: undefined,
    targetId: bp.CardCode,
    metadata: {
      source: 'sap-b1',
      organizationId,
      cardCode: bp.CardCode,
      name: bp.CardName,
      type: bp.CardType,
      groupCode: bp.GroupCode,
      email: bp.EmailAddress,
      phone: bp.Phone1,
      phone2: bp.Phone2,
      fax: bp.Fax,
      contactPerson: bp.ContactPerson,
      currency: bp.Currency,
      taxId: bp.FederalTaxID,
      vatStatus: bp.VatStatus,
      address: {
        street: primaryAddress?.Street || bp.Address,
        city: primaryAddress?.City || bp.City,
        zipCode: primaryAddress?.ZipCode || bp.ZipCode,
        country: primaryAddress?.Country || bp.Country,
        state: primaryAddress?.State,
      },
      addressCount: bp.BPAddresses?.length || 0,
      contactCount: bp.ContactEmployees?.length || 0,
      createdAt: bp.CreateDate,
      updatedAt: bp.UpdateDate,
    },
    rawData: { sapBusinessPartner: bp },
  };
}

/**
 * Convert SAP Item to ExtractedEvent
 */
function itemToEvent(
  item: SapItem,
  organizationId: string
): ExtractedEvent {
  const timestamp = new Date(item.UpdateDate);

  return {
    type: 'erp.product.updated',
    timestamp,
    actorId: undefined,
    targetId: item.ItemCode,
    metadata: {
      source: 'sap-b1',
      organizationId,
      itemCode: item.ItemCode,
      name: item.ItemName,
      type: item.ItemType,
      groupCode: item.ItemsGroupCode,
      barcode: item.BarCode,
      price: item.AvgStdPrice,
      defaultWarehouse: item.DefaultWarehouse,
      isPurchaseItem: item.PurchaseItem === 'tYES',
      isSalesItem: item.SalesItem === 'tYES',
      isInventoryItem: item.InventoryItem === 'tYES',
      manageSerialNumbers: item.ManageSerialNumbers === 'tYES',
      manageBatchNumbers: item.ManageBatchNumbers === 'tYES',
      createdAt: item.CreateDate,
      updatedAt: item.UpdateDate,
    },
    rawData: { sapItem: item },
  };
}

/**
 * Convert SAP Order to ExtractedEvent
 */
function orderToEvent(
  order: SapOrder,
  organizationId: string,
  orderType: 'sale' | 'purchase'
): ExtractedEvent {
  const timestamp = new Date(order.UpdateDate);

  let eventType: string;
  if (order.Cancelled === 'tYES') {
    eventType = `erp.${orderType}.cancelled`;
  } else if (order.DocumentStatus === 'bost_Close' || order.DocumentStatus === 'bost_Delivered') {
    eventType = `erp.${orderType}.completed`;
  } else {
    eventType = `erp.${orderType}.updated`;
  }

  return {
    type: eventType,
    timestamp,
    actorId: undefined,
    targetId: String(order.DocEntry),
    metadata: {
      source: 'sap-b1',
      organizationId,
      docEntry: order.DocEntry,
      docNum: order.DocNum,
      orderNumber: String(order.DocNum),
      cardCode: order.CardCode,
      cardName: order.CardName,
      docType: order.DocType,
      orderDate: order.DocDate,
      dueDate: order.DocDueDate,
      totalAmount: order.DocTotal,
      totalAmountFC: order.DocTotalFC,
      taxAmount: order.VatSum,
      currency: order.DocCurrency,
      exchangeRate: order.DocRate,
      customerRef: order.NumAtCard,
      comments: order.Comments,
      status: order.DocumentStatus,
      isCancelled: order.Cancelled === 'tYES',
      lineCount: order.DocumentLines?.length || 0,
      createdAt: order.CreateDate,
      updatedAt: order.UpdateDate,
    },
    rawData: { sapOrder: order },
  };
}

/**
 * Convert SAP Invoice to ExtractedEvent
 */
function invoiceToEvent(
  invoice: SapInvoice,
  organizationId: string,
  invoiceType: 'ar' | 'ap'
): ExtractedEvent {
  const timestamp = new Date(invoice.UpdateDate);
  const typePrefix = invoiceType === 'ar' ? 'receivable' : 'payable';

  let eventType: string;
  if (invoice.Cancelled === 'tYES') {
    eventType = `erp.invoice.${typePrefix}.cancelled`;
  } else if (invoice.DocumentStatus === 'bost_Paid') {
    eventType = `erp.invoice.${typePrefix}.paid`;
  } else if (invoice.DocumentStatus === 'bost_Close') {
    eventType = `erp.invoice.${typePrefix}.closed`;
  } else {
    eventType = `erp.invoice.${typePrefix}.updated`;
  }

  return {
    type: eventType,
    timestamp,
    actorId: undefined,
    targetId: String(invoice.DocEntry),
    metadata: {
      source: 'sap-b1',
      organizationId,
      docEntry: invoice.DocEntry,
      docNum: invoice.DocNum,
      invoiceNumber: String(invoice.DocNum),
      cardCode: invoice.CardCode,
      cardName: invoice.CardName,
      docType: invoice.DocType,
      invoiceDate: invoice.DocDate,
      dueDate: invoice.DocDueDate,
      totalAmount: invoice.DocTotal,
      totalAmountFC: invoice.DocTotalFC,
      taxAmount: invoice.VatSum,
      currency: invoice.DocCurrency,
      exchangeRate: invoice.DocRate,
      customerRef: invoice.NumAtCard,
      paymentMethod: invoice.PaymentMethod,
      cashDiscount: invoice.CashDiscount,
      status: invoice.DocumentStatus,
      isCancelled: invoice.Cancelled === 'tYES',
      isPaid: invoice.DocumentStatus === 'bost_Paid',
      invoiceDirection: invoiceType,
      lineCount: invoice.DocumentLines?.length || 0,
      createdAt: invoice.CreateDate,
      updatedAt: invoice.UpdateDate,
    },
    rawData: { sapInvoice: invoice },
  };
}

/**
 * Extract customers from SAP B1
 */
export async function extractCustomers(
  client: SapB1Client,
  options: SapExtractionOptions
): Promise<SapExtractionResult> {
  const businessPartners = await client.getBusinessPartners({
    cardType: 'cCustomer',
    modifiedSince: options.lookbackDate,
  });

  const events = businessPartners.map(bp =>
    businessPartnerToEvent(bp, options.organizationId)
  );

  return { events, recordsProcessed: businessPartners.length };
}

/**
 * Extract vendors from SAP B1
 */
export async function extractVendors(
  client: SapB1Client,
  options: SapExtractionOptions
): Promise<SapExtractionResult> {
  const businessPartners = await client.getBusinessPartners({
    cardType: 'cSupplier',
    modifiedSince: options.lookbackDate,
  });

  const events = businessPartners.map(bp =>
    businessPartnerToEvent(bp, options.organizationId)
  );

  return { events, recordsProcessed: businessPartners.length };
}

/**
 * Extract items from SAP B1
 */
export async function extractItems(
  client: SapB1Client,
  options: SapExtractionOptions
): Promise<SapExtractionResult> {
  const items = await client.getItems({
    modifiedSince: options.lookbackDate,
  });

  const events = items.map(item =>
    itemToEvent(item, options.organizationId)
  );

  return { events, recordsProcessed: items.length };
}

/**
 * Extract sales orders from SAP B1
 */
export async function extractSalesOrders(
  client: SapB1Client,
  options: SapExtractionOptions
): Promise<SapExtractionResult> {
  const orders = await client.getOrders({
    modifiedSince: options.lookbackDate,
  });

  const events = orders.map(order =>
    orderToEvent(order, options.organizationId, 'sale')
  );

  return { events, recordsProcessed: orders.length };
}

/**
 * Extract purchase orders from SAP B1
 */
export async function extractPurchaseOrders(
  client: SapB1Client,
  options: SapExtractionOptions
): Promise<SapExtractionResult> {
  const orders = await client.getPurchaseOrders({
    modifiedSince: options.lookbackDate,
  });

  const events = orders.map(order =>
    orderToEvent(order, options.organizationId, 'purchase')
  );

  return { events, recordsProcessed: orders.length };
}

/**
 * Extract A/R invoices from SAP B1
 */
export async function extractARInvoices(
  client: SapB1Client,
  options: SapExtractionOptions
): Promise<SapExtractionResult> {
  const invoices = await client.getInvoices({
    modifiedSince: options.lookbackDate,
  });

  const events = invoices.map(invoice =>
    invoiceToEvent(invoice, options.organizationId, 'ar')
  );

  return { events, recordsProcessed: invoices.length };
}

/**
 * Extract A/P invoices from SAP B1
 */
export async function extractAPInvoices(
  client: SapB1Client,
  options: SapExtractionOptions
): Promise<SapExtractionResult> {
  const invoices = await client.getPurchaseInvoices({
    modifiedSince: options.lookbackDate,
  });

  const events = invoices.map(invoice =>
    invoiceToEvent(invoice, options.organizationId, 'ap')
  );

  return { events, recordsProcessed: invoices.length };
}

/**
 * Extract all SAP B1 data
 */
export async function extractAllSapData(
  client: SapB1Client,
  options: SapExtractionOptions
): Promise<{
  events: ExtractedEvent[];
  stats: {
    customers: number;
    vendors: number;
    items: number;
    salesOrders: number;
    purchaseOrders: number;
    arInvoices: number;
    apInvoices: number;
    total: number;
  };
}> {
  const allEvents: ExtractedEvent[] = [];
  const stats = {
    customers: 0,
    vendors: 0,
    items: 0,
    salesOrders: 0,
    purchaseOrders: 0,
    arInvoices: 0,
    apInvoices: 0,
    total: 0,
  };

  // Extract all entity types
  const extractors = [
    { name: 'customers', fn: extractCustomers, stat: 'customers' as const },
    { name: 'vendors', fn: extractVendors, stat: 'vendors' as const },
    { name: 'items', fn: extractItems, stat: 'items' as const },
    { name: 'salesOrders', fn: extractSalesOrders, stat: 'salesOrders' as const },
    { name: 'purchaseOrders', fn: extractPurchaseOrders, stat: 'purchaseOrders' as const },
    { name: 'arInvoices', fn: extractARInvoices, stat: 'arInvoices' as const },
    { name: 'apInvoices', fn: extractAPInvoices, stat: 'apInvoices' as const },
  ];

  for (const extractor of extractors) {
    try {
      const result = await extractor.fn(client, options);
      allEvents.push(...result.events);
      stats[extractor.stat] = result.recordsProcessed;
    } catch (error) {
      console.error(`Failed to extract ${extractor.name}:`, error);
    }
  }

  stats.total = allEvents.length;

  // Sort by timestamp
  allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return { events: allEvents, stats };
}
