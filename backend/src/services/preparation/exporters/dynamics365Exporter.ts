/**
 * Microsoft Dynamics 365 Exporter
 * Transforms entity records to Dynamics 365 Web API format
 */

import { EntityRecord, EntityType } from '../entityRecordService.js';

export interface Dynamics365ExportOptions {
  includeMetadata?: boolean;
  organizationUrl?: string;
  apiVersion?: string;
}

export interface Dynamics365Account {
  '@odata.type': 'Microsoft.Dynamics.CRM.account';
  name: string;
  accountnumber?: string;
  telephone1?: string;
  telephone2?: string;
  fax?: string;
  emailaddress1?: string;
  websiteurl?: string;
  // Tax info
  accountclassificationcode?: number;
  // Addresses
  address1_line1?: string;
  address1_line2?: string;
  address1_city?: string;
  address1_postalcode?: string;
  address1_country?: string;
  address1_stateorprovince?: string;
  address1_addresstypecode?: number;
  address2_line1?: string;
  address2_line2?: string;
  address2_city?: string;
  address2_postalcode?: string;
  address2_country?: string;
  address2_stateorprovince?: string;
  address2_addresstypecode?: number;
  // Industry
  industrycode?: number;
  // Revenue
  revenue?: number;
  numberofemployees?: number;
  // Description
  description?: string;
  // Custom fields for VAT
  new_vatid?: string;
  // Source tracking
  new_externalid?: string;
}

export interface Dynamics365Contact {
  '@odata.type': 'Microsoft.Dynamics.CRM.contact';
  firstname?: string;
  lastname?: string;
  fullname?: string;
  jobtitle?: string;
  salutation?: string;
  telephone1?: string;
  telephone2?: string;
  mobilephone?: string;
  fax?: string;
  emailaddress1?: string;
  emailaddress2?: string;
  // Address
  address1_line1?: string;
  address1_line2?: string;
  address1_city?: string;
  address1_postalcode?: string;
  address1_country?: string;
  address1_stateorprovince?: string;
  // Company link (navigation property)
  'parentcustomerid_account@odata.bind'?: string;
  // Description
  description?: string;
  // Source tracking
  new_externalid?: string;
  // Gender
  gendercode?: number;
  // Birth date
  birthdate?: string;
  // Department
  department?: string;
}

export interface Dynamics365Product {
  '@odata.type': 'Microsoft.Dynamics.CRM.product';
  name: string;
  productnumber: string;
  description?: string;
  // Pricing
  price?: number;
  currentcost?: number;
  standardcost?: number;
  // Physical
  stockweight?: number;
  stockvolume?: number;
  // Status
  statecode?: number;
  statuscode?: number;
  // Product type
  producttypecode?: number;
  // Vendor info
  vendorpartnumber?: string;
  vendorname?: string;
  // Source tracking
  new_externalid?: string;
  new_barcode?: string;
}

export interface Dynamics365Address {
  '@odata.type': 'Microsoft.Dynamics.CRM.customeraddress';
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  postalcode?: string;
  country?: string;
  stateorprovince?: string;
  addresstypecode?: number; // 1=Bill To, 2=Ship To, 3=Primary
  telephone1?: string;
  fax?: string;
  // Parent entity binding
  'parentid_account@odata.bind'?: string;
  'parentid_contact@odata.bind'?: string;
}

export interface Dynamics365ExportResult {
  format: 'dynamics_365';
  version: string;
  data: {
    accounts?: Dynamics365Account[];
    contacts?: Dynamics365Contact[];
    products?: Dynamics365Product[];
    customeraddresses?: Dynamics365Address[];
  };
  recordCount: number;
  exportedAt: string;
  metadata?: {
    organizationUrl?: string;
    apiVersion: string;
    sourceRecordIds: string[];
  };
}

/**
 * Map country name to Dynamics 365 country name
 */
function mapCountryName(country: string | undefined): string {
  if (!country) return 'Germany';

  const countryMap: Record<string, string> = {
    'deutschland': 'Germany',
    'de': 'Germany',
    'österreich': 'Austria',
    'at': 'Austria',
    'schweiz': 'Switzerland',
    'ch': 'Switzerland',
    'frankreich': 'France',
    'fr': 'France',
    'niederlande': 'Netherlands',
    'nl': 'Netherlands',
    'belgien': 'Belgium',
    'be': 'Belgium',
    'italien': 'Italy',
    'it': 'Italy',
    'spanien': 'Spain',
    'es': 'Spain',
    'polen': 'Poland',
    'pl': 'Poland',
    'vereinigtes königreich': 'United Kingdom',
    'gb': 'United Kingdom',
    'usa': 'United States',
    'us': 'United States',
  };

  const normalized = country.toLowerCase().trim();
  return countryMap[normalized] || country;
}

/**
 * Map German state name to full name
 */
function mapStateName(state: string | undefined): string | undefined {
  if (!state) return undefined;

  const stateMap: Record<string, string> = {
    'by': 'Bavaria',
    'bayern': 'Bavaria',
    'bw': 'Baden-Württemberg',
    'be': 'Berlin',
    'berlin': 'Berlin',
    'bb': 'Brandenburg',
    'hb': 'Bremen',
    'hh': 'Hamburg',
    'he': 'Hesse',
    'hessen': 'Hesse',
    'mv': 'Mecklenburg-Vorpommern',
    'ni': 'Lower Saxony',
    'niedersachsen': 'Lower Saxony',
    'nw': 'North Rhine-Westphalia',
    'nordrhein-westfalen': 'North Rhine-Westphalia',
    'rp': 'Rhineland-Palatinate',
    'rheinland-pfalz': 'Rhineland-Palatinate',
    'sl': 'Saarland',
    'sn': 'Saxony',
    'sachsen': 'Saxony',
    'st': 'Saxony-Anhalt',
    'sachsen-anhalt': 'Saxony-Anhalt',
    'sh': 'Schleswig-Holstein',
    'th': 'Thuringia',
    'thüringen': 'Thuringia',
  };

  const normalized = state.toLowerCase().trim();
  return stateMap[normalized] || state;
}

/**
 * Map salutation to Dynamics gendercode
 */
function mapGenderCode(salutation: string | undefined): number | undefined {
  if (!salutation) return undefined;

  const genderMap: Record<string, number> = {
    'herr': 1, // Male
    'mr': 1,
    'frau': 2, // Female
    'mrs': 2,
    'ms': 2,
  };

  const normalized = salutation.toLowerCase().replace(/\./g, '');
  return genderMap[normalized];
}

/**
 * Map industry to Dynamics industrycode
 */
function mapIndustryCode(industry: string | undefined): number | undefined {
  if (!industry) return undefined;

  const industryMap: Record<string, number> = {
    'agriculture': 1,
    'landwirtschaft': 1,
    'automotive': 2,
    'automobil': 2,
    'banking': 3,
    'bank': 3,
    'construction': 4,
    'bau': 4,
    'consulting': 5,
    'beratung': 5,
    'education': 6,
    'bildung': 6,
    'energy': 7,
    'energie': 7,
    'financial': 8,
    'finanz': 8,
    'government': 9,
    'regierung': 9,
    'healthcare': 10,
    'gesundheit': 10,
    'hospitality': 11,
    'gastgewerbe': 11,
    'insurance': 12,
    'versicherung': 12,
    'it': 13,
    'informationstechnologie': 13,
    'legal': 14,
    'recht': 14,
    'manufacturing': 15,
    'fertigung': 15,
    'media': 16,
    'medien': 16,
    'pharmaceutical': 17,
    'pharma': 17,
    'retail': 18,
    'einzelhandel': 18,
    'technology': 19,
    'technologie': 19,
    'telecommunications': 20,
    'telekommunikation': 20,
    'transportation': 21,
    'transport': 21,
    'utilities': 22,
    'versorgung': 22,
  };

  const normalized = industry.toLowerCase().trim();
  return industryMap[normalized];
}

/**
 * Convert company record to Dynamics 365 Account
 */
function companyToAccount(record: EntityRecord): Dynamics365Account {
  const data = { ...record.data, ...record.normalizedData };

  const account: Dynamics365Account = {
    '@odata.type': 'Microsoft.Dynamics.CRM.account',
    name: (data.companyName as string) || (data.name as string) || '',
    new_externalid: record.externalId,
  };

  // Account number
  if (data.customerNumber || data.accountNumber) {
    account.accountnumber = (data.customerNumber || data.accountNumber) as string;
  }

  // Contact info
  if (data.phone) account.telephone1 = data.phone as string;
  if (data.phone2) account.telephone2 = data.phone2 as string;
  if (data.fax) account.fax = data.fax as string;
  if (data.email) account.emailaddress1 = data.email as string;
  if (data.website) account.websiteurl = data.website as string;

  // Primary address (billing)
  if (data.street) account.address1_line1 = data.street as string;
  if (data.street2) account.address1_line2 = data.street2 as string;
  if (data.city) account.address1_city = data.city as string;
  if (data.postalCode) account.address1_postalcode = data.postalCode as string;
  account.address1_country = mapCountryName(data.country as string);
  account.address1_stateorprovince = mapStateName(data.state as string);
  account.address1_addresstypecode = 1; // Bill To

  // Secondary address (shipping)
  if (data.shippingStreet) {
    account.address2_line1 = data.shippingStreet as string;
    account.address2_line2 = data.shippingStreet2 as string;
    account.address2_city = data.shippingCity as string;
    account.address2_postalcode = data.shippingPostalCode as string;
    account.address2_country = mapCountryName(data.shippingCountry as string);
    account.address2_stateorprovince = mapStateName(data.shippingState as string);
    account.address2_addresstypecode = 2; // Ship To
  }

  // Business info
  if (data.industry) {
    account.industrycode = mapIndustryCode(data.industry as string);
  }
  if (data.revenue) {
    account.revenue = parseFloat(data.revenue as string) || 0;
  }
  if (data.employees) {
    account.numberofemployees = parseInt(data.employees as string, 10) || 0;
  }

  // VAT ID (custom field)
  if (data.vatId) {
    account.new_vatid = data.vatId as string;
  }

  if (data.description || data.notes) {
    account.description = (data.description || data.notes) as string;
  }

  return account;
}

/**
 * Convert person record to Dynamics 365 Contact
 */
function personToContact(record: EntityRecord): Dynamics365Contact {
  const data = { ...record.data, ...record.normalizedData };

  const firstName = (data.firstName as string) || '';
  const lastName = (data.lastName as string) || '';
  const fullName = `${firstName} ${lastName}`.trim() || (data.name as string) || '';

  const contact: Dynamics365Contact = {
    '@odata.type': 'Microsoft.Dynamics.CRM.contact',
    fullname: fullName,
    new_externalid: record.externalId,
  };

  if (firstName) contact.firstname = firstName;
  if (lastName) contact.lastname = lastName;

  // Salutation
  if (data.salutation || data.title) {
    contact.salutation = (data.salutation || data.title) as string;
    contact.gendercode = mapGenderCode((data.salutation || data.title) as string);
  }

  // Job info
  if (data.position || data.jobTitle) {
    contact.jobtitle = (data.position || data.jobTitle) as string;
  }
  if (data.department) {
    contact.department = data.department as string;
  }

  // Contact info
  if (data.phone) contact.telephone1 = data.phone as string;
  if (data.phone2) contact.telephone2 = data.phone2 as string;
  if (data.mobile) contact.mobilephone = data.mobile as string;
  if (data.fax) contact.fax = data.fax as string;
  if (data.email) contact.emailaddress1 = data.email as string;
  if (data.email2) contact.emailaddress2 = data.email2 as string;

  // Address
  if (data.street) contact.address1_line1 = data.street as string;
  if (data.street2) contact.address1_line2 = data.street2 as string;
  if (data.city) contact.address1_city = data.city as string;
  if (data.postalCode) contact.address1_postalcode = data.postalCode as string;
  contact.address1_country = mapCountryName(data.country as string);
  contact.address1_stateorprovince = mapStateName(data.state as string);

  // Birth date
  if (data.birthDate) {
    const date = new Date(data.birthDate as string);
    if (!isNaN(date.getTime())) {
      contact.birthdate = date.toISOString().split('T')[0];
    }
  }

  // Company link - requires account GUID, stored as custom binding
  if (data.companyId) {
    contact['parentcustomerid_account@odata.bind'] = `/accounts(${data.companyId})`;
  }

  if (data.description || data.notes) {
    contact.description = (data.description || data.notes) as string;
  }

  return contact;
}

/**
 * Convert product record to Dynamics 365 Product
 */
function productToProduct(record: EntityRecord): Dynamics365Product {
  const data = { ...record.data, ...record.normalizedData };

  const product: Dynamics365Product = {
    '@odata.type': 'Microsoft.Dynamics.CRM.product',
    name: (data.productName as string) || (data.name as string) || '',
    productnumber: (data.sku as string) || (data.productCode as string) || record.externalId,
    new_externalid: record.externalId,
    statecode: 0, // Active
    statuscode: 1, // Active
    producttypecode: 1, // Sales Inventory
  };

  // Barcode
  if (data.ean || data.barcode) {
    product.new_barcode = (data.ean || data.barcode) as string;
  }

  // Description
  if (data.description) {
    product.description = data.description as string;
  }

  // Pricing
  if (data.price || data.listPrice) {
    product.price = parseFloat((data.price || data.listPrice) as string) || 0;
  }
  if (data.cost || data.standardCost) {
    product.currentcost = parseFloat((data.cost || data.standardCost) as string) || 0;
    product.standardcost = product.currentcost;
  }

  // Physical properties
  if (data.weight) {
    product.stockweight = parseFloat(data.weight as string) || 0;
  }
  if (data.volume) {
    product.stockvolume = parseFloat(data.volume as string) || 0;
  }

  // Vendor info
  if (data.supplierProductCode) {
    product.vendorpartnumber = data.supplierProductCode as string;
  }
  if (data.supplierName) {
    product.vendorname = data.supplierName as string;
  }

  // Product type
  if (data.productType) {
    const typeMap: Record<string, number> = {
      'sales inventory': 1,
      'lagerware': 1,
      'miscellaneous charges': 2,
      'sonstige': 2,
      'services': 3,
      'dienstleistung': 3,
      'flat fees': 4,
      'pauschale': 4,
    };
    const productType = (data.productType as string).toLowerCase();
    product.producttypecode = typeMap[productType] || 1;
  }

  return product;
}

/**
 * Convert address record to Dynamics 365 Customer Address
 */
function addressToCustomerAddress(record: EntityRecord): Dynamics365Address {
  const data = { ...record.data, ...record.normalizedData };

  const address: Dynamics365Address = {
    '@odata.type': 'Microsoft.Dynamics.CRM.customeraddress',
    name: (data.addressName as string) || (data.name as string) || 'Address',
  };

  if (data.street) address.line1 = data.street as string;
  if (data.street2) address.line2 = data.street2 as string;
  if (data.city) address.city = data.city as string;
  if (data.postalCode) address.postalcode = data.postalCode as string;
  address.country = mapCountryName(data.country as string);
  address.stateorprovince = mapStateName(data.state as string);

  if (data.phone) address.telephone1 = data.phone as string;
  if (data.fax) address.fax = data.fax as string;

  // Address type
  const addressType = ((data.addressType as string) || 'primary').toLowerCase();
  if (addressType === 'billing' || addressType === 'bill to' || addressType === 'rechnung') {
    address.addresstypecode = 1;
  } else if (addressType === 'shipping' || addressType === 'ship to' || addressType === 'lieferung') {
    address.addresstypecode = 2;
  } else {
    address.addresstypecode = 3; // Primary
  }

  // Parent binding
  if (data.accountId) {
    address['parentid_account@odata.bind'] = `/accounts(${data.accountId})`;
  } else if (data.contactId) {
    address['parentid_contact@odata.bind'] = `/contacts(${data.contactId})`;
  }

  return address;
}

/**
 * Export entity records to Dynamics 365 format
 */
export async function exportToDynamics365(
  records: EntityRecord[],
  options: Dynamics365ExportOptions = {}
): Promise<Dynamics365ExportResult> {
  const apiVersion = options.apiVersion || 'v9.2';

  const result: Dynamics365ExportResult = {
    format: 'dynamics_365',
    version: apiVersion,
    data: {},
    recordCount: records.length,
    exportedAt: new Date().toISOString(),
  };

  if (options.includeMetadata) {
    result.metadata = {
      organizationUrl: options.organizationUrl,
      apiVersion,
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
    result.data.accounts = byType.company.map(companyToAccount);
  }

  if (byType.person || byType.contact) {
    const persons = byType.person || [];
    const contacts = byType.contact || [];
    result.data.contacts = [...persons, ...contacts].map(personToContact);
  }

  if (byType.product) {
    result.data.products = byType.product.map(productToProduct);
  }

  if (byType.address) {
    result.data.customeraddresses = byType.address.map(addressToCustomerAddress);
  }

  return result;
}

export default exportToDynamics365;
