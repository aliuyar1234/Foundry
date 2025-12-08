/**
 * SAP B1 Business Partners Extractor
 * Task: T061
 *
 * Extracts customers, suppliers, and leads from SAP Business One.
 * Handles addresses, contacts, and relationships.
 */

import { ExtractedEvent } from '../../base/connector';
import { SapB1Client, SapBusinessPartner, SapBPAddress, SapContactEmployee } from '../sapClient';

export interface BusinessPartnerExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  cardTypes?: Array<'cCustomer' | 'cSupplier' | 'cLead'>;
  limit?: number;
  includeAddresses?: boolean;
  includeContacts?: boolean;
}

export interface ExtractedBusinessPartner {
  cardCode: string;
  cardName: string;
  cardType: string;
  groupCode: number;
  email?: string;
  phone?: string;
  fax?: string;
  federalTaxId?: string;
  currency?: string;
  addresses: SapBPAddress[];
  contacts: SapContactEmployee[];
  createDate: Date;
  updateDate: Date;
}

export class SapBusinessPartnersExtractor {
  private client: SapB1Client;

  constructor(client: SapB1Client) {
    this.client = client;
  }

  /**
   * Extract business partners
   */
  async extractBusinessPartners(
    options: BusinessPartnerExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    partners: ExtractedBusinessPartner[];
    stats: { customers: number; suppliers: number; leads: number };
  }> {
    const events: ExtractedEvent[] = [];
    const partners: ExtractedBusinessPartner[] = [];
    const stats = { customers: 0, suppliers: 0, leads: 0 };

    const cardTypes = options.cardTypes || ['cCustomer', 'cSupplier'];

    for (const cardType of cardTypes) {
      const bps = await this.client.getBusinessPartners({
        cardType,
        modifiedSince: options.modifiedAfter,
        limit: options.limit,
      });

      for (const bp of bps) {
        const extracted = this.mapBusinessPartner(bp);
        partners.push(extracted);

        // Track stats
        switch (cardType) {
          case 'cCustomer':
            stats.customers++;
            break;
          case 'cSupplier':
            stats.suppliers++;
            break;
          case 'cLead':
            stats.leads++;
            break;
        }

        // Create event
        events.push(this.partnerToEvent(bp, options.organizationId));

        // Create contact events if included
        if (options.includeContacts && bp.ContactEmployees?.length) {
          for (const contact of bp.ContactEmployees) {
            events.push(this.contactToEvent(contact, bp, options.organizationId));
          }
        }
      }
    }

    return { events, partners, stats };
  }

  /**
   * Extract customers only
   */
  async extractCustomers(
    options: Omit<BusinessPartnerExtractionOptions, 'cardTypes'>
  ): Promise<{
    events: ExtractedEvent[];
    customers: ExtractedBusinessPartner[];
  }> {
    const result = await this.extractBusinessPartners({
      ...options,
      cardTypes: ['cCustomer'],
    });

    return {
      events: result.events,
      customers: result.partners,
    };
  }

  /**
   * Extract suppliers only
   */
  async extractSuppliers(
    options: Omit<BusinessPartnerExtractionOptions, 'cardTypes'>
  ): Promise<{
    events: ExtractedEvent[];
    suppliers: ExtractedBusinessPartner[];
  }> {
    const result = await this.extractBusinessPartners({
      ...options,
      cardTypes: ['cSupplier'],
    });

    return {
      events: result.events,
      suppliers: result.partners,
    };
  }

  /**
   * Get business partner by code
   */
  async getBusinessPartner(cardCode: string): Promise<ExtractedBusinessPartner | null> {
    try {
      const bp = await this.client.get<SapBusinessPartner>('BusinessPartners', cardCode);
      return this.mapBusinessPartner(bp);
    } catch {
      return null;
    }
  }

  /**
   * Map SAP business partner to extracted format
   */
  private mapBusinessPartner(bp: SapBusinessPartner): ExtractedBusinessPartner {
    return {
      cardCode: bp.CardCode,
      cardName: bp.CardName,
      cardType: bp.CardType,
      groupCode: bp.GroupCode,
      email: bp.EmailAddress,
      phone: bp.Phone1 || bp.Phone2,
      fax: bp.Fax,
      federalTaxId: bp.FederalTaxID,
      currency: bp.Currency,
      addresses: bp.BPAddresses || [],
      contacts: bp.ContactEmployees || [],
      createDate: new Date(bp.CreateDate),
      updateDate: new Date(bp.UpdateDate),
    };
  }

  /**
   * Convert business partner to event
   */
  private partnerToEvent(
    bp: SapBusinessPartner,
    organizationId: string
  ): ExtractedEvent {
    const createDate = new Date(bp.CreateDate);
    const updateDate = new Date(bp.UpdateDate);
    const isNew = Math.abs(updateDate.getTime() - createDate.getTime()) < 60000;

    let eventType: string;
    switch (bp.CardType) {
      case 'cCustomer':
        eventType = isNew ? 'erp.customer.created' : 'erp.customer.updated';
        break;
      case 'cSupplier':
        eventType = isNew ? 'erp.vendor.created' : 'erp.vendor.updated';
        break;
      case 'cLead':
        eventType = isNew ? 'erp.lead.created' : 'erp.lead.updated';
        break;
      default:
        eventType = isNew ? 'erp.partner.created' : 'erp.partner.updated';
    }

    // Get primary address
    const primaryAddress = bp.BPAddresses?.find(
      (a) => a.AddressType === 'bo_BillTo'
    ) || bp.BPAddresses?.[0];

    return {
      type: eventType,
      timestamp: updateDate,
      actorId: undefined,
      targetId: bp.CardCode,
      metadata: {
        source: 'sap_b1',
        organizationId,
        cardCode: bp.CardCode,
        cardName: bp.CardName,
        cardType: bp.CardType,
        groupCode: bp.GroupCode,
        email: bp.EmailAddress,
        phone: bp.Phone1,
        phone2: bp.Phone2,
        fax: bp.Fax,
        federalTaxId: bp.FederalTaxID,
        vatStatus: bp.VatStatus,
        currency: bp.Currency,
        contactPerson: bp.ContactPerson,
        address: primaryAddress
          ? {
              street: primaryAddress.Street,
              city: primaryAddress.City,
              zipCode: primaryAddress.ZipCode,
              country: primaryAddress.Country,
              state: primaryAddress.State,
            }
          : undefined,
        addressCount: bp.BPAddresses?.length || 0,
        contactCount: bp.ContactEmployees?.length || 0,
        createdAt: bp.CreateDate,
        updatedAt: bp.UpdateDate,
      },
    };
  }

  /**
   * Convert contact to event
   */
  private contactToEvent(
    contact: SapContactEmployee,
    bp: SapBusinessPartner,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'erp.contact',
      timestamp: new Date(bp.UpdateDate),
      actorId: undefined,
      targetId: `${bp.CardCode}:${contact.Name}`,
      metadata: {
        source: 'sap_b1',
        organizationId,
        cardCode: bp.CardCode,
        cardName: bp.CardName,
        contactName: contact.Name,
        firstName: contact.FirstName,
        middleName: contact.MiddleName,
        lastName: contact.LastName,
        title: contact.Title,
        position: contact.Position,
        phone: contact.Phone1,
        phone2: contact.Phone2,
        mobile: contact.MobilePhone,
        fax: contact.Fax,
        email: contact.E_Mail,
        active: contact.Active === 'tYES',
      },
    };
  }
}

/**
 * Create business partners extractor
 */
export function createSapBusinessPartnersExtractor(
  client: SapB1Client
): SapBusinessPartnersExtractor {
  return new SapBusinessPartnersExtractor(client);
}
