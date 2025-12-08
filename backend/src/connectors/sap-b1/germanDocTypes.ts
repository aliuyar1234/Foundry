/**
 * German Document Type Mapper for SAP B1
 * Task: T066
 *
 * Maps SAP B1 document types to German business document terminology.
 * Supports Rechnung, Gutschrift, Lieferschein, Angebot, etc.
 */

export interface GermanDocumentType {
  code: string;
  sapEntity: string;
  germanName: string;
  germanNamePlural: string;
  englishName: string;
  abbreviation: string;
  category: 'sales' | 'purchase' | 'inventory' | 'financial';
  isCredit: boolean;
}

// German document type mappings
export const GERMAN_DOC_TYPES: Record<string, GermanDocumentType> = {
  // Sales Documents
  'Quotations': {
    code: 'QT',
    sapEntity: 'Quotations',
    germanName: 'Angebot',
    germanNamePlural: 'Angebote',
    englishName: 'Sales Quotation',
    abbreviation: 'AG',
    category: 'sales',
    isCredit: false,
  },
  'Orders': {
    code: 'OR',
    sapEntity: 'Orders',
    germanName: 'Auftrag',
    germanNamePlural: 'Aufträge',
    englishName: 'Sales Order',
    abbreviation: 'AU',
    category: 'sales',
    isCredit: false,
  },
  'DeliveryNotes': {
    code: 'DN',
    sapEntity: 'DeliveryNotes',
    germanName: 'Lieferschein',
    germanNamePlural: 'Lieferscheine',
    englishName: 'Delivery Note',
    abbreviation: 'LS',
    category: 'inventory',
    isCredit: false,
  },
  'Invoices': {
    code: 'IN',
    sapEntity: 'Invoices',
    germanName: 'Rechnung',
    germanNamePlural: 'Rechnungen',
    englishName: 'A/R Invoice',
    abbreviation: 'RE',
    category: 'sales',
    isCredit: false,
  },
  'CreditNotes': {
    code: 'CN',
    sapEntity: 'CreditNotes',
    germanName: 'Gutschrift',
    germanNamePlural: 'Gutschriften',
    englishName: 'A/R Credit Note',
    abbreviation: 'GS',
    category: 'sales',
    isCredit: true,
  },
  'Returns': {
    code: 'RT',
    sapEntity: 'Returns',
    germanName: 'Retoure',
    germanNamePlural: 'Retouren',
    englishName: 'Returns',
    abbreviation: 'RT',
    category: 'inventory',
    isCredit: true,
  },
  'DownPaymentRequests': {
    code: 'DP',
    sapEntity: 'DownPaymentRequests',
    germanName: 'Anzahlungsanforderung',
    germanNamePlural: 'Anzahlungsanforderungen',
    englishName: 'Down Payment Request',
    abbreviation: 'AZ',
    category: 'sales',
    isCredit: false,
  },

  // Purchase Documents
  'PurchaseQuotations': {
    code: 'PQ',
    sapEntity: 'PurchaseQuotations',
    germanName: 'Preisanfrage',
    germanNamePlural: 'Preisanfragen',
    englishName: 'Purchase Quotation',
    abbreviation: 'PA',
    category: 'purchase',
    isCredit: false,
  },
  'PurchaseOrders': {
    code: 'PO',
    sapEntity: 'PurchaseOrders',
    germanName: 'Bestellung',
    germanNamePlural: 'Bestellungen',
    englishName: 'Purchase Order',
    abbreviation: 'BE',
    category: 'purchase',
    isCredit: false,
  },
  'PurchaseDeliveryNotes': {
    code: 'PD',
    sapEntity: 'PurchaseDeliveryNotes',
    germanName: 'Wareneingang',
    germanNamePlural: 'Wareneingänge',
    englishName: 'Goods Receipt PO',
    abbreviation: 'WE',
    category: 'inventory',
    isCredit: false,
  },
  'PurchaseInvoices': {
    code: 'PI',
    sapEntity: 'PurchaseInvoices',
    germanName: 'Eingangsrechnung',
    germanNamePlural: 'Eingangsrechnungen',
    englishName: 'A/P Invoice',
    abbreviation: 'ER',
    category: 'purchase',
    isCredit: false,
  },
  'PurchaseCreditNotes': {
    code: 'PC',
    sapEntity: 'PurchaseCreditNotes',
    germanName: 'Lieferantengutschrift',
    germanNamePlural: 'Lieferantengutschriften',
    englishName: 'A/P Credit Note',
    abbreviation: 'LG',
    category: 'purchase',
    isCredit: true,
  },
  'PurchaseReturns': {
    code: 'PR',
    sapEntity: 'PurchaseReturns',
    germanName: 'Warenrücksendung',
    germanNamePlural: 'Warenrücksendungen',
    englishName: 'Goods Return',
    abbreviation: 'WR',
    category: 'inventory',
    isCredit: true,
  },

  // Inventory Documents
  'InventoryTransferRequest': {
    code: 'WTR',
    sapEntity: 'InventoryTransferRequests',
    germanName: 'Umlagerungsanforderung',
    germanNamePlural: 'Umlagerungsanforderungen',
    englishName: 'Inventory Transfer Request',
    abbreviation: 'UA',
    category: 'inventory',
    isCredit: false,
  },
  'StockTransfer': {
    code: 'WT',
    sapEntity: 'StockTransfers',
    germanName: 'Umlagerung',
    germanNamePlural: 'Umlagerungen',
    englishName: 'Stock Transfer',
    abbreviation: 'UL',
    category: 'inventory',
    isCredit: false,
  },

  // Financial Documents
  'JournalEntry': {
    code: 'JE',
    sapEntity: 'JournalEntries',
    germanName: 'Buchungssatz',
    germanNamePlural: 'Buchungssätze',
    englishName: 'Journal Entry',
    abbreviation: 'BS',
    category: 'financial',
    isCredit: false,
  },
  'IncomingPayments': {
    code: 'IP',
    sapEntity: 'IncomingPayments',
    germanName: 'Zahlungseingang',
    germanNamePlural: 'Zahlungseingänge',
    englishName: 'Incoming Payment',
    abbreviation: 'ZE',
    category: 'financial',
    isCredit: false,
  },
  'VendorPayments': {
    code: 'VP',
    sapEntity: 'VendorPayments',
    germanName: 'Zahlungsausgang',
    germanNamePlural: 'Zahlungsausgänge',
    englishName: 'Outgoing Payment',
    abbreviation: 'ZA',
    category: 'financial',
    isCredit: false,
  },
};

// SAP object type codes to document types
const SAP_OBJECT_TYPES: Record<string, string> = {
  '13': 'Invoices',
  '14': 'CreditNotes',
  '15': 'DeliveryNotes',
  '16': 'Returns',
  '17': 'Orders',
  '18': 'PurchaseInvoices',
  '19': 'PurchaseCreditNotes',
  '20': 'PurchaseDeliveryNotes',
  '21': 'PurchaseReturns',
  '22': 'PurchaseOrders',
  '23': 'Quotations',
  '540000006': 'PurchaseQuotations',
  '67': 'StockTransfer',
  '30': 'JournalEntry',
  '24': 'IncomingPayments',
  '46': 'VendorPayments',
};

export class GermanDocTypeMapper {
  /**
   * Get German document type by SAP entity
   */
  getByEntity(sapEntity: string): GermanDocumentType | undefined {
    return GERMAN_DOC_TYPES[sapEntity];
  }

  /**
   * Get German document type by SAP object type code
   */
  getByObjectType(objectType: string): GermanDocumentType | undefined {
    const entity = SAP_OBJECT_TYPES[objectType];
    return entity ? GERMAN_DOC_TYPES[entity] : undefined;
  }

  /**
   * Get German name for document
   */
  getGermanName(sapEntity: string, plural = false): string {
    const docType = GERMAN_DOC_TYPES[sapEntity];
    if (!docType) return sapEntity;
    return plural ? docType.germanNamePlural : docType.germanName;
  }

  /**
   * Get abbreviation for document
   */
  getAbbreviation(sapEntity: string): string {
    return GERMAN_DOC_TYPES[sapEntity]?.abbreviation || sapEntity.substring(0, 2).toUpperCase();
  }

  /**
   * Format document number with German prefix
   */
  formatDocNumber(sapEntity: string, docNum: number): string {
    const abbrev = this.getAbbreviation(sapEntity);
    return `${abbrev}-${docNum.toString().padStart(6, '0')}`;
  }

  /**
   * Get all document types by category
   */
  getByCategory(category: 'sales' | 'purchase' | 'inventory' | 'financial'): GermanDocumentType[] {
    return Object.values(GERMAN_DOC_TYPES).filter((dt) => dt.category === category);
  }

  /**
   * Get all credit document types
   */
  getCreditTypes(): GermanDocumentType[] {
    return Object.values(GERMAN_DOC_TYPES).filter((dt) => dt.isCredit);
  }

  /**
   * Check if document is a credit type
   */
  isCredit(sapEntity: string): boolean {
    return GERMAN_DOC_TYPES[sapEntity]?.isCredit || false;
  }

  /**
   * Map document for German localization
   */
  localizeDocument(doc: {
    sapEntity: string;
    docNum: number;
    docTotal: number;
    currency?: string;
  }): {
    germanName: string;
    formattedNumber: string;
    formattedTotal: string;
    isCredit: boolean;
  } {
    const docType = GERMAN_DOC_TYPES[doc.sapEntity];

    return {
      germanName: docType?.germanName || doc.sapEntity,
      formattedNumber: this.formatDocNumber(doc.sapEntity, doc.docNum),
      formattedTotal: new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: doc.currency || 'EUR',
      }).format(doc.docTotal),
      isCredit: docType?.isCredit || false,
    };
  }

  /**
   * Get document flow description in German
   */
  getDocumentFlowDescription(flow: string[]): string {
    const germanNames = flow.map((entity) => this.getGermanName(entity));
    return germanNames.join(' → ');
  }

  /**
   * Standard German document flows
   */
  getStandardFlows(): Record<string, string[]> {
    return {
      salesProcess: ['Quotations', 'Orders', 'DeliveryNotes', 'Invoices'],
      purchaseProcess: ['PurchaseQuotations', 'PurchaseOrders', 'PurchaseDeliveryNotes', 'PurchaseInvoices'],
      salesReturn: ['Returns', 'CreditNotes'],
      purchaseReturn: ['PurchaseReturns', 'PurchaseCreditNotes'],
    };
  }
}

/**
 * Create German document type mapper
 */
export function createGermanDocTypeMapper(): GermanDocTypeMapper {
  return new GermanDocTypeMapper();
}

// Export singleton for convenience
export const germanDocTypeMapper = new GermanDocTypeMapper();
