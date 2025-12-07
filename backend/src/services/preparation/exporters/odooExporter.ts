/**
 * Odoo Exporter
 * Transforms entity records to Odoo External ID import format
 */

import { EntityRecord, EntityType } from '../entityRecordService.js';

export interface OdooExportOptions {
  includeMetadata?: boolean;
  dbName?: string;
  modulePrefix?: string;
}

export interface OdooPartner {
  id: string; // External ID
  name: string;
  is_company: boolean;
  company_type: 'company' | 'person';
  street?: string;
  street2?: string;
  city?: string;
  zip?: string;
  country_id?: string; // External ID reference
  state_id?: string; // External ID reference
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  vat?: string;
  customer_rank?: number;
  supplier_rank?: number;
  lang?: string;
  comment?: string;
  parent_id?: string; // External ID reference for parent company
  function?: string; // Job position
  title?: string; // External ID reference
}

export interface OdooProduct {
  id: string; // External ID
  name: string;
  default_code?: string; // Internal reference
  barcode?: string;
  type: 'consu' | 'service' | 'product';
  categ_id?: string; // External ID reference
  list_price?: number;
  standard_price?: number;
  sale_ok: boolean;
  purchase_ok: boolean;
  uom_id?: string; // External ID reference
  uom_po_id?: string; // External ID reference
  description?: string;
  description_sale?: string;
  description_purchase?: string;
  weight?: number;
  volume?: number;
}

export interface OdooAddress {
  id: string; // External ID
  parent_id: string; // External ID reference to partner
  type: 'contact' | 'invoice' | 'delivery' | 'other';
  name?: string;
  street?: string;
  street2?: string;
  city?: string;
  zip?: string;
  country_id?: string;
  state_id?: string;
  phone?: string;
  email?: string;
}

export interface OdooExportResult {
  format: 'odoo';
  version: string;
  data: {
    'res.partner'?: OdooPartner[];
    'product.template'?: OdooProduct[];
  };
  recordCount: number;
  exportedAt: string;
  metadata?: {
    dbName?: string;
    modulePrefix: string;
    sourceRecordIds: string[];
  };
}

/**
 * Map country name to Odoo country external ID
 */
function mapCountryId(country: string | undefined): string | undefined {
  if (!country) return 'base.de';

  const countryMap: Record<string, string> = {
    'deutschland': 'base.de',
    'germany': 'base.de',
    'österreich': 'base.at',
    'austria': 'base.at',
    'schweiz': 'base.ch',
    'switzerland': 'base.ch',
    'frankreich': 'base.fr',
    'france': 'base.fr',
    'niederlande': 'base.nl',
    'netherlands': 'base.nl',
    'belgien': 'base.be',
    'belgium': 'base.be',
    'italien': 'base.it',
    'italy': 'base.it',
    'spanien': 'base.es',
    'spain': 'base.es',
    'polen': 'base.pl',
    'poland': 'base.pl',
    'vereinigtes königreich': 'base.gb',
    'united kingdom': 'base.gb',
    'usa': 'base.us',
    'united states': 'base.us',
  };

  const normalized = country.toLowerCase().trim();
  return countryMap[normalized] || `base.${country.substring(0, 2).toLowerCase()}`;
}

/**
 * Map German state to Odoo state external ID
 */
function mapStateId(state: string | undefined, countryId: string | undefined): string | undefined {
  if (!state || countryId !== 'base.de') return undefined;

  const stateMap: Record<string, string> = {
    'bayern': 'base.state_de_by',
    'bavaria': 'base.state_de_by',
    'baden-württemberg': 'base.state_de_bw',
    'berlin': 'base.state_de_be',
    'brandenburg': 'base.state_de_bb',
    'bremen': 'base.state_de_hb',
    'hamburg': 'base.state_de_hh',
    'hessen': 'base.state_de_he',
    'mecklenburg-vorpommern': 'base.state_de_mv',
    'niedersachsen': 'base.state_de_ni',
    'nordrhein-westfalen': 'base.state_de_nw',
    'rheinland-pfalz': 'base.state_de_rp',
    'saarland': 'base.state_de_sl',
    'sachsen': 'base.state_de_sn',
    'sachsen-anhalt': 'base.state_de_st',
    'schleswig-holstein': 'base.state_de_sh',
    'thüringen': 'base.state_de_th',
  };

  const normalized = state.toLowerCase().trim();
  return stateMap[normalized];
}

/**
 * Generate Odoo external ID
 */
function generateExternalId(prefix: string, entityType: string, externalId: string): string {
  const sanitized = externalId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  return `${prefix}.${entityType}_${sanitized}`;
}

/**
 * Convert company record to Odoo partner
 */
function companyToPartner(
  record: EntityRecord,
  modulePrefix: string
): OdooPartner {
  const data = { ...record.data, ...record.normalizedData };
  const countryId = mapCountryId(data.country as string);

  const partner: OdooPartner = {
    id: generateExternalId(modulePrefix, 'company', record.externalId),
    name: (data.companyName as string) || (data.name as string) || '',
    is_company: true,
    company_type: 'company',
    customer_rank: 1,
    supplier_rank: 0,
  };

  // Address
  if (data.street) partner.street = data.street as string;
  if (data.street2) partner.street2 = data.street2 as string;
  if (data.city) partner.city = data.city as string;
  if (data.postalCode) partner.zip = data.postalCode as string;
  partner.country_id = countryId;
  partner.state_id = mapStateId(data.state as string, countryId);

  // Contact
  if (data.phone) partner.phone = data.phone as string;
  if (data.mobile) partner.mobile = data.mobile as string;
  if (data.email) partner.email = data.email as string;
  if (data.website) partner.website = data.website as string;

  // VAT - Odoo expects format like 'DE123456789'
  if (data.vatId) {
    let vat = (data.vatId as string).replace(/\s/g, '');
    // Ensure country prefix
    if (/^\d/.test(vat)) {
      const countryCode = (countryId || 'base.de').split('.')[1].toUpperCase();
      vat = countryCode + vat;
    }
    partner.vat = vat;
  }

  // Language mapping
  if (data.language) {
    const langMap: Record<string, string> = {
      'deutsch': 'de_DE',
      'german': 'de_DE',
      'englisch': 'en_US',
      'english': 'en_US',
      'französisch': 'fr_FR',
      'french': 'fr_FR',
    };
    const lang = (data.language as string).toLowerCase();
    partner.lang = langMap[lang] || 'de_DE';
  }

  if (data.notes) partner.comment = data.notes as string;

  return partner;
}

/**
 * Convert person record to Odoo partner (contact)
 */
function personToPartner(
  record: EntityRecord,
  modulePrefix: string
): OdooPartner {
  const data = { ...record.data, ...record.normalizedData };
  const countryId = mapCountryId(data.country as string);

  const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || (data.name as string) || '';

  const partner: OdooPartner = {
    id: generateExternalId(modulePrefix, 'person', record.externalId),
    name: fullName,
    is_company: false,
    company_type: 'person',
    customer_rank: 1,
    supplier_rank: 0,
  };

  // Address
  if (data.street) partner.street = data.street as string;
  if (data.city) partner.city = data.city as string;
  if (data.postalCode) partner.zip = data.postalCode as string;
  partner.country_id = countryId;
  partner.state_id = mapStateId(data.state as string, countryId);

  // Contact
  if (data.phone) partner.phone = data.phone as string;
  if (data.mobile) partner.mobile = data.mobile as string;
  if (data.email) partner.email = data.email as string;

  // Job info
  if (data.position) partner.function = data.position as string;
  if (data.title) {
    // Map common titles to Odoo title external IDs
    const titleMap: Record<string, string> = {
      'herr': 'base.res_partner_title_mister',
      'mr': 'base.res_partner_title_mister',
      'frau': 'base.res_partner_title_madam',
      'mrs': 'base.res_partner_title_madam',
      'ms': 'base.res_partner_title_miss',
      'dr': 'base.res_partner_title_doctor',
      'prof': 'base.res_partner_title_prof',
    };
    const title = (data.title as string).toLowerCase().replace(/\./g, '');
    partner.title = titleMap[title];
  }

  // Link to parent company if available
  if (data.companyId) {
    partner.parent_id = generateExternalId(modulePrefix, 'company', data.companyId as string);
  }

  if (data.notes) partner.comment = data.notes as string;

  return partner;
}

/**
 * Convert product record to Odoo product template
 */
function productToTemplate(
  record: EntityRecord,
  modulePrefix: string
): OdooProduct {
  const data = { ...record.data, ...record.normalizedData };

  const product: OdooProduct = {
    id: generateExternalId(modulePrefix, 'product', record.externalId),
    name: (data.productName as string) || (data.name as string) || '',
    type: 'product', // Stockable product
    sale_ok: true,
    purchase_ok: true,
  };

  if (data.sku || data.productCode) {
    product.default_code = (data.sku as string) || (data.productCode as string);
  }
  if (data.ean || data.barcode) {
    product.barcode = (data.ean as string) || (data.barcode as string);
  }

  // Pricing
  if (data.price || data.listPrice) {
    product.list_price = parseFloat((data.price || data.listPrice) as string) || 0;
  }
  if (data.cost || data.standardPrice) {
    product.standard_price = parseFloat((data.cost || data.standardPrice) as string) || 0;
  }

  // Descriptions
  if (data.description) {
    product.description = data.description as string;
    product.description_sale = data.description as string;
  }
  if (data.purchaseDescription) {
    product.description_purchase = data.purchaseDescription as string;
  }

  // Physical properties
  if (data.weight) {
    product.weight = parseFloat(data.weight as string) || 0;
  }
  if (data.volume) {
    product.volume = parseFloat(data.volume as string) || 0;
  }

  // Unit of measure mapping
  if (data.unit) {
    const uomMap: Record<string, string> = {
      'stück': 'uom.product_uom_unit',
      'stk': 'uom.product_uom_unit',
      'pcs': 'uom.product_uom_unit',
      'kg': 'uom.product_uom_kgm',
      'g': 'uom.product_uom_gram',
      'l': 'uom.product_uom_litre',
      'ml': 'uom.product_uom_millilitre',
      'm': 'uom.product_uom_meter',
      'cm': 'uom.product_uom_cm',
      'h': 'uom.product_uom_hour',
      'tag': 'uom.product_uom_day',
      'day': 'uom.product_uom_day',
    };
    const unit = (data.unit as string).toLowerCase();
    product.uom_id = uomMap[unit] || 'uom.product_uom_unit';
    product.uom_po_id = product.uom_id;
  }

  // Product type
  if (data.productType) {
    const typeMap: Record<string, 'consu' | 'service' | 'product'> = {
      'service': 'service',
      'dienstleistung': 'service',
      'consumable': 'consu',
      'verbrauchsmaterial': 'consu',
      'stockable': 'product',
      'lagerware': 'product',
    };
    const productType = (data.productType as string).toLowerCase();
    product.type = typeMap[productType] || 'product';
  }

  return product;
}

/**
 * Convert address record to Odoo delivery/invoice address
 */
function addressToPartner(
  record: EntityRecord,
  modulePrefix: string
): OdooPartner {
  const data = { ...record.data, ...record.normalizedData };
  const countryId = mapCountryId(data.country as string);

  const partner: OdooPartner = {
    id: generateExternalId(modulePrefix, 'address', record.externalId),
    name: (data.addressName as string) || (data.name as string) || 'Address',
    is_company: false,
    company_type: 'person',
  };

  if (data.street) partner.street = data.street as string;
  if (data.street2) partner.street2 = data.street2 as string;
  if (data.city) partner.city = data.city as string;
  if (data.postalCode) partner.zip = data.postalCode as string;
  partner.country_id = countryId;
  partner.state_id = mapStateId(data.state as string, countryId);

  if (data.phone) partner.phone = data.phone as string;
  if (data.email) partner.email = data.email as string;

  // Link to parent if available
  if (data.parentId || data.companyId) {
    const parentType = data.companyId ? 'company' : 'person';
    partner.parent_id = generateExternalId(
      modulePrefix,
      parentType,
      (data.parentId || data.companyId) as string
    );
  }

  return partner;
}

/**
 * Export entity records to Odoo format
 */
export async function exportToOdoo(
  records: EntityRecord[],
  options: OdooExportOptions = {}
): Promise<OdooExportResult> {
  const modulePrefix = options.modulePrefix || 'import_data';

  const result: OdooExportResult = {
    format: 'odoo',
    version: '16.0',
    data: {},
    recordCount: records.length,
    exportedAt: new Date().toISOString(),
  };

  if (options.includeMetadata) {
    result.metadata = {
      dbName: options.dbName,
      modulePrefix,
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

  // Collect all partners
  const partners: OdooPartner[] = [];

  // Convert companies first (they may be parents)
  if (byType.company) {
    partners.push(...byType.company.map((r) => companyToPartner(r, modulePrefix)));
  }

  // Convert persons
  if (byType.person) {
    partners.push(...byType.person.map((r) => personToPartner(r, modulePrefix)));
  }

  // Convert addresses as child contacts
  if (byType.address) {
    partners.push(...byType.address.map((r) => addressToPartner(r, modulePrefix)));
  }

  // Convert contacts
  if (byType.contact) {
    partners.push(...byType.contact.map((r) => personToPartner(r, modulePrefix)));
  }

  if (partners.length > 0) {
    result.data['res.partner'] = partners;
  }

  // Convert products
  if (byType.product) {
    result.data['product.template'] = byType.product.map((r) =>
      productToTemplate(r, modulePrefix)
    );
  }

  return result;
}

export default exportToOdoo;
