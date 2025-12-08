/**
 * HubSpot Data Extractors
 * Convert HubSpot records to ExtractedEvent objects
 */

import {
  HubSpotCompany,
  HubSpotContact,
  HubSpotDeal,
  HubSpotTicket,
  HubSpotClient,
} from '../hubspotClient.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ExtractionOptions {
  organizationId: string;
  modifiedSince?: Date;
}

export interface ExtractionResult {
  events: ExtractedEvent[];
  stats: {
    companies: number;
    contacts: number;
    deals: number;
    tickets: number;
    total: number;
  };
}

/**
 * Extract company data
 */
export function extractCompany(
  company: HubSpotCompany,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `hs-company-${company.id}`,
    source: 'hubspot',
    eventType: 'crm.company',
    timestamp: new Date(company.updatedAt),
    data: {
      id: company.id,
      name: company.properties.name,
      domain: company.properties.domain,
      industry: company.properties.industry,
      phone: company.properties.phone,
      website: company.properties.website,
      description: company.properties.description,
      address: {
        street: company.properties.address,
        city: company.properties.city,
        state: company.properties.state,
        postalCode: company.properties.zip,
        country: company.properties.country,
      },
      annualRevenue: company.properties.annualrevenue
        ? parseFloat(company.properties.annualrevenue)
        : null,
      numberOfEmployees: company.properties.numberofemployees
        ? parseInt(company.properties.numberofemployees, 10)
        : null,
      ownerId: company.properties.hubspot_owner_id,
      lifecycleStage: company.properties.lifecyclestage,
      archived: company.archived,
    },
    metadata: {
      organizationId,
      createdAt: company.createdAt,
      modifiedAt: company.updatedAt,
      objectType: 'Company',
    },
  };
}

/**
 * Extract contact data
 */
export function extractContact(
  contact: HubSpotContact,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `hs-contact-${contact.id}`,
    source: 'hubspot',
    eventType: 'crm.contact',
    timestamp: new Date(contact.updatedAt),
    data: {
      id: contact.id,
      firstName: contact.properties.firstname,
      lastName: contact.properties.lastname,
      email: contact.properties.email,
      phone: contact.properties.phone,
      mobilePhone: contact.properties.mobilephone,
      company: contact.properties.company,
      jobTitle: contact.properties.jobtitle,
      address: {
        street: contact.properties.address,
        city: contact.properties.city,
        state: contact.properties.state,
        postalCode: contact.properties.zip,
        country: contact.properties.country,
      },
      ownerId: contact.properties.hubspot_owner_id,
      lifecycleStage: contact.properties.lifecyclestage,
      leadStatus: contact.properties.hs_lead_status,
      archived: contact.archived,
    },
    metadata: {
      organizationId,
      createdAt: contact.createdAt,
      modifiedAt: contact.updatedAt,
      objectType: 'Contact',
    },
  };
}

/**
 * Extract deal data
 */
export function extractDeal(
  deal: HubSpotDeal,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `hs-deal-${deal.id}`,
    source: 'hubspot',
    eventType: 'crm.deal',
    timestamp: new Date(deal.updatedAt),
    data: {
      id: deal.id,
      name: deal.properties.dealname,
      amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
      closeDate: deal.properties.closedate,
      stage: deal.properties.dealstage,
      pipeline: deal.properties.pipeline,
      ownerId: deal.properties.hubspot_owner_id,
      description: deal.properties.description,
      dealType: deal.properties.dealtype,
      priority: deal.properties.hs_priority,
      probability: deal.properties.hs_deal_stage_probability
        ? parseFloat(deal.properties.hs_deal_stage_probability)
        : null,
      archived: deal.archived,
    },
    metadata: {
      organizationId,
      createdAt: deal.createdAt,
      modifiedAt: deal.updatedAt,
      objectType: 'Deal',
    },
  };
}

/**
 * Extract ticket data
 */
export function extractTicket(
  ticket: HubSpotTicket,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `hs-ticket-${ticket.id}`,
    source: 'hubspot',
    eventType: 'crm.ticket',
    timestamp: new Date(ticket.updatedAt),
    data: {
      id: ticket.id,
      subject: ticket.properties.subject,
      content: ticket.properties.content,
      pipeline: ticket.properties.hs_pipeline,
      stage: ticket.properties.hs_pipeline_stage,
      priority: ticket.properties.hs_ticket_priority,
      ownerId: ticket.properties.hubspot_owner_id,
      closedDate: ticket.properties.closed_date,
      archived: ticket.archived,
    },
    metadata: {
      organizationId,
      createdAt: ticket.properties.createdate || ticket.createdAt,
      modifiedAt: ticket.properties.hs_lastmodifieddate || ticket.updatedAt,
      objectType: 'Ticket',
    },
  };
}

/**
 * Extract all HubSpot data
 */
export async function extractAllHubSpotData(
  client: HubSpotClient,
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    companies: 0,
    contacts: 0,
    deals: 0,
    tickets: 0,
    total: 0,
  };

  // Extract companies
  const companies = await client.getAllCompanies();
  for (const company of companies) {
    // Filter by modifiedSince if provided
    if (options.modifiedSince && new Date(company.updatedAt) < options.modifiedSince) {
      continue;
    }
    events.push(extractCompany(company, options.organizationId));
    stats.companies++;
  }

  // Extract contacts
  const contacts = await client.getAllContacts();
  for (const contact of contacts) {
    if (options.modifiedSince && new Date(contact.updatedAt) < options.modifiedSince) {
      continue;
    }
    events.push(extractContact(contact, options.organizationId));
    stats.contacts++;
  }

  // Extract deals
  const deals = await client.getAllDeals();
  for (const deal of deals) {
    if (options.modifiedSince && new Date(deal.updatedAt) < options.modifiedSince) {
      continue;
    }
    events.push(extractDeal(deal, options.organizationId));
    stats.deals++;
  }

  // Extract tickets
  const tickets = await client.getAllTickets();
  for (const ticket of tickets) {
    if (options.modifiedSince && new Date(ticket.updatedAt) < options.modifiedSince) {
      continue;
    }
    events.push(extractTicket(ticket, options.organizationId));
    stats.tickets++;
  }

  stats.total = events.length;

  return { events, stats };
}

// Re-export specialized extractors
export * from './deals.js';
export * from './engagements.js';
