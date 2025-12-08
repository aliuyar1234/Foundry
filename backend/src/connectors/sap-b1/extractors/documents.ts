/**
 * SAP B1 Documents Extractor
 * Task: T063
 *
 * Extracts sales orders, purchase orders, invoices, and other documents.
 * Handles document lines, attachments, and status tracking.
 */

import { ExtractedEvent } from '../../base/connector';
import { SapB1Client, SapOrder, SapInvoice, SapDocumentLine } from '../sapClient';

export interface DocumentExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  limit?: number;
  includeLines?: boolean;
  includeCancelled?: boolean;
}

export type DocumentType =
  | 'Orders'           // Sales Orders
  | 'PurchaseOrders'   // Purchase Orders
  | 'Invoices'         // A/R Invoices
  | 'PurchaseInvoices' // A/P Invoices
  | 'DeliveryNotes'    // Delivery Notes
  | 'PurchaseDeliveryNotes' // Goods Receipt PO
  | 'CreditNotes'      // A/R Credit Notes
  | 'PurchaseCreditNotes'   // A/P Credit Notes
  | 'Quotations'       // Sales Quotations
  | 'PurchaseQuotations';   // Purchase Quotations

export interface ExtractedDocument {
  docEntry: number;
  docNum: number;
  docType: string;
  cardCode: string;
  cardName: string;
  docDate: Date;
  docDueDate: Date;
  docTotal: number;
  vatSum: number;
  currency: string;
  status: string;
  cancelled: boolean;
  lineCount: number;
  lines: SapDocumentLine[];
  createDate: Date;
  updateDate: Date;
}

export class SapDocumentsExtractor {
  private client: SapB1Client;

  constructor(client: SapB1Client) {
    this.client = client;
  }

  /**
   * Extract sales orders
   */
  async extractSalesOrders(
    options: DocumentExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    documents: ExtractedDocument[];
  }> {
    return this.extractDocuments('Orders', options, 'sales_order');
  }

  /**
   * Extract purchase orders
   */
  async extractPurchaseOrders(
    options: DocumentExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    documents: ExtractedDocument[];
  }> {
    return this.extractDocuments('PurchaseOrders', options, 'purchase_order');
  }

  /**
   * Extract A/R invoices (customer invoices)
   */
  async extractInvoices(
    options: DocumentExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    documents: ExtractedDocument[];
  }> {
    return this.extractDocuments('Invoices', options, 'invoice');
  }

  /**
   * Extract A/P invoices (vendor invoices)
   */
  async extractPurchaseInvoices(
    options: DocumentExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    documents: ExtractedDocument[];
  }> {
    return this.extractDocuments('PurchaseInvoices', options, 'vendor_invoice');
  }

  /**
   * Extract delivery notes
   */
  async extractDeliveryNotes(
    options: DocumentExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    documents: ExtractedDocument[];
  }> {
    return this.extractDocuments('DeliveryNotes', options, 'delivery');
  }

  /**
   * Extract credit notes
   */
  async extractCreditNotes(
    options: DocumentExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    documents: ExtractedDocument[];
  }> {
    return this.extractDocuments('CreditNotes', options, 'credit_note');
  }

  /**
   * Extract all document types
   */
  async extractAllDocuments(
    options: DocumentExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    documents: ExtractedDocument[];
    stats: Record<string, number>;
  }> {
    const allEvents: ExtractedEvent[] = [];
    const allDocuments: ExtractedDocument[] = [];
    const stats: Record<string, number> = {};

    const documentTypes: Array<{ type: DocumentType; eventPrefix: string }> = [
      { type: 'Orders', eventPrefix: 'sales_order' },
      { type: 'PurchaseOrders', eventPrefix: 'purchase_order' },
      { type: 'Invoices', eventPrefix: 'invoice' },
      { type: 'PurchaseInvoices', eventPrefix: 'vendor_invoice' },
      { type: 'DeliveryNotes', eventPrefix: 'delivery' },
      { type: 'CreditNotes', eventPrefix: 'credit_note' },
    ];

    for (const { type, eventPrefix } of documentTypes) {
      try {
        const result = await this.extractDocuments(type, options, eventPrefix);
        allEvents.push(...result.events);
        allDocuments.push(...result.documents);
        stats[type] = result.documents.length;
      } catch (error) {
        console.warn(`Failed to extract ${type}:`, error);
        stats[type] = 0;
      }
    }

    return { events: allEvents, documents: allDocuments, stats };
  }

  /**
   * Extract documents by type
   */
  private async extractDocuments(
    documentType: DocumentType,
    options: DocumentExtractionOptions,
    eventPrefix: string
  ): Promise<{
    events: ExtractedEvent[];
    documents: ExtractedDocument[];
  }> {
    const events: ExtractedEvent[] = [];
    const documents: ExtractedDocument[] = [];

    // Build filters
    const filters: string[] = [];

    if (options.modifiedAfter) {
      filters.push(`UpdateDate ge '${options.modifiedAfter.toISOString().split('T')[0]}'`);
    }

    if (!options.includeCancelled) {
      filters.push("Cancelled eq 'tNO'");
    }

    // Fetch documents
    const docs = await this.client.getAll<SapOrder | SapInvoice>(documentType, {
      $filter: filters.length > 0 ? filters.join(' and ') : undefined,
      $orderby: 'UpdateDate desc',
      $top: options.limit || 100,
      $expand: options.includeLines !== false ? 'DocumentLines' : undefined,
    });

    for (const doc of docs) {
      const extracted = this.mapDocument(doc, documentType);
      documents.push(extracted);

      // Create document event
      events.push(this.documentToEvent(doc, documentType, eventPrefix, options.organizationId));

      // Create line events if included
      if (options.includeLines !== false && doc.DocumentLines?.length) {
        for (const line of doc.DocumentLines) {
          events.push(this.lineToEvent(line, doc, documentType, eventPrefix, options.organizationId));
        }
      }
    }

    return { events, documents };
  }

  /**
   * Map SAP document to extracted format
   */
  private mapDocument(doc: SapOrder | SapInvoice, docType: DocumentType): ExtractedDocument {
    return {
      docEntry: doc.DocEntry,
      docNum: doc.DocNum,
      docType: docType,
      cardCode: doc.CardCode,
      cardName: doc.CardName,
      docDate: new Date(doc.DocDate),
      docDueDate: new Date(doc.DocDueDate),
      docTotal: doc.DocTotal,
      vatSum: doc.VatSum,
      currency: doc.DocCurrency,
      status: doc.DocumentStatus,
      cancelled: doc.Cancelled === 'tYES',
      lineCount: doc.DocumentLines?.length || 0,
      lines: doc.DocumentLines || [],
      createDate: new Date(doc.CreateDate),
      updateDate: new Date(doc.UpdateDate),
    };
  }

  /**
   * Convert document to event
   */
  private documentToEvent(
    doc: SapOrder | SapInvoice,
    docType: DocumentType,
    eventPrefix: string,
    organizationId: string
  ): ExtractedEvent {
    const createDate = new Date(doc.CreateDate);
    const updateDate = new Date(doc.UpdateDate);
    const isNew = Math.abs(updateDate.getTime() - createDate.getTime()) < 60000;

    let eventType: string;
    if (doc.Cancelled === 'tYES') {
      eventType = `erp.${eventPrefix}.cancelled`;
    } else if (doc.DocumentStatus === 'bost_Close') {
      eventType = `erp.${eventPrefix}.closed`;
    } else if (doc.DocumentStatus === 'bost_Paid') {
      eventType = `erp.${eventPrefix}.paid`;
    } else if (doc.DocumentStatus === 'bost_Delivered') {
      eventType = `erp.${eventPrefix}.delivered`;
    } else {
      eventType = isNew ? `erp.${eventPrefix}.created` : `erp.${eventPrefix}.updated`;
    }

    return {
      type: eventType,
      timestamp: updateDate,
      actorId: undefined,
      targetId: String(doc.DocEntry),
      metadata: {
        source: 'sap_b1',
        organizationId,
        docEntry: doc.DocEntry,
        docNum: doc.DocNum,
        docType,
        cardCode: doc.CardCode,
        cardName: doc.CardName,
        docDate: doc.DocDate,
        docDueDate: doc.DocDueDate,
        docTotal: doc.DocTotal,
        docTotalFC: doc.DocTotalFC,
        vatSum: doc.VatSum,
        currency: doc.DocCurrency,
        exchangeRate: doc.DocRate,
        customerRef: doc.NumAtCard,
        comments: doc.Comments,
        status: doc.DocumentStatus,
        cancelled: doc.Cancelled === 'tYES',
        lineCount: doc.DocumentLines?.length || 0,
        createdAt: doc.CreateDate,
        updatedAt: doc.UpdateDate,
      },
    };
  }

  /**
   * Convert document line to event
   */
  private lineToEvent(
    line: SapDocumentLine,
    doc: SapOrder | SapInvoice,
    docType: DocumentType,
    eventPrefix: string,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: `erp.${eventPrefix}.line`,
      timestamp: new Date(doc.UpdateDate),
      actorId: undefined,
      targetId: `${doc.DocEntry}:${line.LineNum}`,
      metadata: {
        source: 'sap_b1',
        organizationId,
        docEntry: doc.DocEntry,
        docNum: doc.DocNum,
        docType,
        lineNum: line.LineNum,
        itemCode: line.ItemCode,
        itemDescription: line.ItemDescription,
        quantity: line.Quantity,
        price: line.Price,
        priceAfterVat: line.PriceAfterVAT,
        currency: line.Currency,
        discountPercent: line.DiscountPercent,
        lineTotal: line.LineTotal,
        warehouseCode: line.WarehouseCode,
      },
    };
  }
}

/**
 * Create documents extractor
 */
export function createSapDocumentsExtractor(
  client: SapB1Client
): SapDocumentsExtractor {
  return new SapDocumentsExtractor(client);
}
