/**
 * SAP Business One Exporter
 * Transforms entity records to SAP B1 Data Import format
 */

import { EntityRecord, EntityType } from '../entityRecordService.js';

export interface SAPB1ExportOptions {
  includeMetadata?: boolean;
  companyDb?: string;
  dateFormat?: string;
}

export interface SAPB1BusinessPartner {
  CardCode: string;
  CardName: string;
  CardType: 'C' | 'S' | 'L'; // Customer, Supplier, Lead
  GroupCode?: number;
  Phone1?: string;
  Phone2?: string;
  Fax?: string;
  Email?: string;
  Website?: string;
  FederalTaxID?: string;
  VatGroup?: string;
  Currency?: string;
  ContactPerson?: string;
  BillToStreet?: string;
  BillToBlock?: string;
  BillToCity?: string;
  BillToZipCode?: string;
  BillToCountry?: string;
  BillToState?: string;
  ShipToStreet?: string;
  ShipToBlock?: string;
  ShipToCity?: string;
  ShipToZipCode?: string;
  ShipToCountry?: string;
  ShipToState?: string;
  U_CustomField1?: string;
  U_CustomField2?: string;
}

export interface SAPB1Item {
  ItemCode: string;
  ItemName: string;
  ItemType: 'I' | 'L' | 'F'; // Item, Labor, Travel
  ItemsGroupCode?: number;
  BarCode?: string;
  ManufacturerCode?: number;
  SuppCatNum?: string;
  PurchaseItem?: 'Y' | 'N';
  SalesItem?: 'Y' | 'N';
  InventoryItem?: 'Y' | 'N';
  DefaultWarehouse?: string;
  PurchaseVATGroup?: string;
  SalesVATGroup?: string;
  PurchaseUnit?: string;
  SalesUnit?: string;
  InventoryUOM?: string;
}

export interface SAPB1Address {
  AddressName: string;
  Street: string;
  Block?: string;
  City: string;
  ZipCode: string;
  Country: string;
  State?: string;
  County?: string;
  Building?: string;
  AddressType: 'B' | 'S'; // Bill-to, Ship-to
}

export interface SAPB1ContactPerson {
  CardCode: string;
  Name: string;
  FirstName?: string;
  LastName?: string;
  Title?: string;
  Position?: string;
  Phone1?: string;
  Phone2?: string;
  MobilePhone?: string;
  Fax?: string;
  Email?: string;
  Address?: string;
  Remarks?: string;
}

export interface SAPB1ExportResult {
  format: 'sap_b1';
  version: string;
  data: {
    BusinessPartners?: SAPB1BusinessPartner[];
    Items?: SAPB1Item[];
    Addresses?: SAPB1Address[];
    ContactPersons?: SAPB1ContactPerson[];
  };
  recordCount: number;
  exportedAt: string;
  metadata?: {
    companyDb?: string;
    sourceRecordIds: string[];
  };
}

/**
 * Map country name to SAP B1 country code
 */
function mapCountryCode(country: string | undefined): string {
  if (!country) return 'DE';

  const countryMap: Record<string, string> = {
    'deutschland': 'DE',
    'germany': 'DE',
    'österreich': 'AT',
    'austria': 'AT',
    'schweiz': 'CH',
    'switzerland': 'CH',
    'frankreich': 'FR',
    'france': 'FR',
    'niederlande': 'NL',
    'netherlands': 'NL',
    'belgien': 'BE',
    'belgium': 'BE',
    'italien': 'IT',
    'italy': 'IT',
    'spanien': 'ES',
    'spain': 'ES',
    'polen': 'PL',
    'poland': 'PL',
    'tschechien': 'CZ',
    'czech republic': 'CZ',
  };

  const normalized = country.toLowerCase().trim();
  return countryMap[normalized] || country.substring(0, 2).toUpperCase();
}

/**
 * Map German state name to SAP code
 */
function mapStateCode(state: string | undefined, country: string): string | undefined {
  if (!state || country !== 'DE') return state;

  const stateMap: Record<string, string> = {
    'bayern': 'BY',
    'bavaria': 'BY',
    'baden-württemberg': 'BW',
    'berlin': 'BE',
    'brandenburg': 'BB',
    'bremen': 'HB',
    'hamburg': 'HH',
    'hessen': 'HE',
    'mecklenburg-vorpommern': 'MV',
    'niedersachsen': 'NI',
    'nordrhein-westfalen': 'NW',
    'rheinland-pfalz': 'RP',
    'saarland': 'SL',
    'sachsen': 'SN',
    'sachsen-anhalt': 'ST',
    'schleswig-holstein': 'SH',
    'thüringen': 'TH',
  };

  const normalized = state.toLowerCase().trim();
  return stateMap[normalized] || state;
}

/**
 * Convert company record to SAP B1 Business Partner
 */
function companyToBusinessPartner(
  record: EntityRecord,
  options: SAPB1ExportOptions
): SAPB1BusinessPartner {
  const data = { ...record.data, ...record.normalizedData };

  const partner: SAPB1BusinessPartner = {
    CardCode: `C${record.externalId.substring(0, 14)}`, // SAP limit: 15 chars
    CardName: (data.companyName as string) || (data.name as string) || '',
    CardType: 'C', // Default to Customer
  };

  // Contact information
  if (data.phone) partner.Phone1 = data.phone as string;
  if (data.fax) partner.Fax = data.fax as string;
  if (data.email) partner.Email = data.email as string;
  if (data.website) partner.Website = data.website as string;

  // Tax information
  if (data.vatId) partner.FederalTaxID = data.vatId as string;

  // Address information
  const country = mapCountryCode(data.country as string);
  if (data.street) partner.BillToStreet = data.street as string;
  if (data.city) partner.BillToCity = data.city as string;
  if (data.postalCode) partner.BillToZipCode = data.postalCode as string;
  partner.BillToCountry = country;
  if (data.state) partner.BillToState = mapStateCode(data.state as string, country);

  // Copy billing to shipping if not specified
  if (!data.shippingStreet) {
    partner.ShipToStreet = partner.BillToStreet;
    partner.ShipToCity = partner.BillToCity;
    partner.ShipToZipCode = partner.BillToZipCode;
    partner.ShipToCountry = partner.BillToCountry;
    partner.ShipToState = partner.BillToState;
  } else {
    partner.ShipToStreet = data.shippingStreet as string;
    partner.ShipToCity = data.shippingCity as string;
    partner.ShipToZipCode = data.shippingPostalCode as string;
    partner.ShipToCountry = mapCountryCode(data.shippingCountry as string);
  }

  return partner;
}

/**
 * Convert person record to SAP B1 Contact Person
 */
function personToContactPerson(record: EntityRecord): SAPB1ContactPerson {
  const data = { ...record.data, ...record.normalizedData };

  const contact: SAPB1ContactPerson = {
    CardCode: `P${record.externalId.substring(0, 14)}`,
    Name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || (data.name as string) || '',
  };

  if (data.firstName) contact.FirstName = data.firstName as string;
  if (data.lastName) contact.LastName = data.lastName as string;
  if (data.title) contact.Title = data.title as string;
  if (data.position) contact.Position = data.position as string;
  if (data.phone) contact.Phone1 = data.phone as string;
  if (data.mobile) contact.MobilePhone = data.mobile as string;
  if (data.fax) contact.Fax = data.fax as string;
  if (data.email) contact.Email = data.email as string;

  return contact;
}

/**
 * Convert product record to SAP B1 Item
 */
function productToItem(record: EntityRecord): SAPB1Item {
  const data = { ...record.data, ...record.normalizedData };

  const item: SAPB1Item = {
    ItemCode: `I${record.externalId.substring(0, 19)}`, // SAP limit: 20 chars
    ItemName: (data.productName as string) || (data.name as string) || '',
    ItemType: 'I',
    PurchaseItem: 'Y',
    SalesItem: 'Y',
    InventoryItem: 'Y',
  };

  if (data.ean) item.BarCode = data.ean as string;
  if (data.supplierProductCode) item.SuppCatNum = data.supplierProductCode as string;
  if (data.unit) {
    item.PurchaseUnit = data.unit as string;
    item.SalesUnit = data.unit as string;
    item.InventoryUOM = data.unit as string;
  }

  return item;
}

/**
 * Convert address record to SAP B1 Address
 */
function addressToSAPAddress(record: EntityRecord): SAPB1Address {
  const data = { ...record.data, ...record.normalizedData };
  const country = mapCountryCode(data.country as string);

  return {
    AddressName: (data.addressName as string) || record.externalId,
    Street: (data.street as string) || '',
    Block: data.block as string,
    City: (data.city as string) || '',
    ZipCode: (data.postalCode as string) || '',
    Country: country,
    State: mapStateCode(data.state as string, country),
    County: data.county as string,
    Building: data.building as string,
    AddressType: (data.addressType as string)?.toLowerCase() === 'shipping' ? 'S' : 'B',
  };
}

/**
 * Export entity records to SAP B1 format
 */
export async function exportToSAPB1(
  records: EntityRecord[],
  options: SAPB1ExportOptions = {}
): Promise<SAPB1ExportResult> {
  const result: SAPB1ExportResult = {
    format: 'sap_b1',
    version: '10.0',
    data: {},
    recordCount: records.length,
    exportedAt: new Date().toISOString(),
  };

  if (options.includeMetadata) {
    result.metadata = {
      companyDb: options.companyDb,
      sourceRecordIds: records.map((r) => r.id),
    };
  }

  // Group records by entity type
  const byType = records.reduce(
    (acc, record) => {
      if (!acc[record.entityType]) {
        acc[record.entityType] = [];
      }
      acc[record.entityType].push(record);
      return acc;
    },
    {} as Record<EntityType, EntityRecord[]>
  );

  // Convert each type
  if (byType.company) {
    result.data.BusinessPartners = byType.company.map((r) =>
      companyToBusinessPartner(r, options)
    );
  }

  if (byType.person) {
    result.data.ContactPersons = byType.person.map(personToContactPerson);
  }

  if (byType.product) {
    result.data.Items = byType.product.map(productToItem);
  }

  if (byType.address) {
    result.data.Addresses = byType.address.map(addressToSAPAddress);
  }

  return result;
}

export default exportToSAPB1;
