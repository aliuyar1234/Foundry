/**
 * Salesforce Data Extractors
 * Convert Salesforce records to ExtractedEvent objects
 */

import {
  SalesforceAccount,
  SalesforceContact,
  SalesforceOpportunity,
  SalesforceCase,
  SalesforceLead,
  SalesforceTask,
  SalesforceEvent,
  SalesforceClient,
} from '../salesforceClient.js';

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
  limit?: number;
}

export interface ExtractionResult {
  events: ExtractedEvent[];
  stats: {
    accounts: number;
    contacts: number;
    opportunities: number;
    cases: number;
    leads: number;
    tasks: number;
    events: number;
    total: number;
  };
}

/**
 * Extract account data
 */
export function extractAccount(
  account: SalesforceAccount,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `sf-account-${account.Id}`,
    source: 'salesforce',
    eventType: 'crm.account',
    timestamp: new Date(account.LastModifiedDate),
    data: {
      id: account.Id,
      name: account.Name,
      type: account.Type,
      industry: account.Industry,
      phone: account.Phone,
      fax: account.Fax,
      website: account.Website,
      description: account.Description,
      billingAddress: {
        street: account.BillingStreet,
        city: account.BillingCity,
        state: account.BillingState,
        postalCode: account.BillingPostalCode,
        country: account.BillingCountry,
      },
      shippingAddress: {
        street: account.ShippingStreet,
        city: account.ShippingCity,
        state: account.ShippingState,
        postalCode: account.ShippingPostalCode,
        country: account.ShippingCountry,
      },
      annualRevenue: account.AnnualRevenue,
      numberOfEmployees: account.NumberOfEmployees,
      ownerId: account.OwnerId,
      parentId: account.ParentId,
    },
    metadata: {
      organizationId,
      createdAt: account.CreatedDate,
      modifiedAt: account.LastModifiedDate,
      objectType: 'Account',
    },
  };
}

/**
 * Extract contact data
 */
export function extractContact(
  contact: SalesforceContact,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `sf-contact-${contact.Id}`,
    source: 'salesforce',
    eventType: 'crm.contact',
    timestamp: new Date(contact.LastModifiedDate),
    data: {
      id: contact.Id,
      firstName: contact.FirstName,
      lastName: contact.LastName,
      name: contact.Name,
      accountId: contact.AccountId,
      title: contact.Title,
      department: contact.Department,
      phone: contact.Phone,
      mobilePhone: contact.MobilePhone,
      email: contact.Email,
      mailingAddress: {
        street: contact.MailingStreet,
        city: contact.MailingCity,
        state: contact.MailingState,
        postalCode: contact.MailingPostalCode,
        country: contact.MailingCountry,
      },
      ownerId: contact.OwnerId,
    },
    metadata: {
      organizationId,
      createdAt: contact.CreatedDate,
      modifiedAt: contact.LastModifiedDate,
      objectType: 'Contact',
    },
  };
}

/**
 * Extract opportunity data
 */
export function extractOpportunity(
  opportunity: SalesforceOpportunity,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `sf-opportunity-${opportunity.Id}`,
    source: 'salesforce',
    eventType: 'crm.opportunity',
    timestamp: new Date(opportunity.LastModifiedDate),
    data: {
      id: opportunity.Id,
      name: opportunity.Name,
      accountId: opportunity.AccountId,
      amount: opportunity.Amount,
      closeDate: opportunity.CloseDate,
      stageName: opportunity.StageName,
      probability: opportunity.Probability,
      type: opportunity.Type,
      leadSource: opportunity.LeadSource,
      isClosed: opportunity.IsClosed,
      isWon: opportunity.IsWon,
      description: opportunity.Description,
      ownerId: opportunity.OwnerId,
      forecastCategory: opportunity.ForecastCategory,
      forecastCategoryName: opportunity.ForecastCategoryName,
    },
    metadata: {
      organizationId,
      createdAt: opportunity.CreatedDate,
      modifiedAt: opportunity.LastModifiedDate,
      objectType: 'Opportunity',
    },
  };
}

/**
 * Extract case data
 */
export function extractCase(
  caseRecord: SalesforceCase,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `sf-case-${caseRecord.Id}`,
    source: 'salesforce',
    eventType: 'crm.case',
    timestamp: new Date(caseRecord.LastModifiedDate),
    data: {
      id: caseRecord.Id,
      caseNumber: caseRecord.CaseNumber,
      subject: caseRecord.Subject,
      description: caseRecord.Description,
      status: caseRecord.Status,
      priority: caseRecord.Priority,
      origin: caseRecord.Origin,
      type: caseRecord.Type,
      reason: caseRecord.Reason,
      accountId: caseRecord.AccountId,
      contactId: caseRecord.ContactId,
      ownerId: caseRecord.OwnerId,
      isClosed: caseRecord.IsClosed,
      closedDate: caseRecord.ClosedDate,
    },
    metadata: {
      organizationId,
      createdAt: caseRecord.CreatedDate,
      modifiedAt: caseRecord.LastModifiedDate,
      objectType: 'Case',
    },
  };
}

/**
 * Extract lead data
 */
export function extractLead(
  lead: SalesforceLead,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `sf-lead-${lead.Id}`,
    source: 'salesforce',
    eventType: 'crm.lead',
    timestamp: new Date(lead.LastModifiedDate),
    data: {
      id: lead.Id,
      firstName: lead.FirstName,
      lastName: lead.LastName,
      name: lead.Name,
      company: lead.Company,
      title: lead.Title,
      email: lead.Email,
      phone: lead.Phone,
      mobilePhone: lead.MobilePhone,
      status: lead.Status,
      industry: lead.Industry,
      leadSource: lead.LeadSource,
      rating: lead.Rating,
      address: {
        street: lead.Street,
        city: lead.City,
        state: lead.State,
        postalCode: lead.PostalCode,
        country: lead.Country,
      },
      isConverted: lead.IsConverted,
      convertedAccountId: lead.ConvertedAccountId,
      convertedContactId: lead.ConvertedContactId,
      convertedOpportunityId: lead.ConvertedOpportunityId,
      ownerId: lead.OwnerId,
    },
    metadata: {
      organizationId,
      createdAt: lead.CreatedDate,
      modifiedAt: lead.LastModifiedDate,
      objectType: 'Lead',
    },
  };
}

/**
 * Extract task data
 */
export function extractTask(
  task: SalesforceTask,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `sf-task-${task.Id}`,
    source: 'salesforce',
    eventType: 'crm.task',
    timestamp: new Date(task.LastModifiedDate),
    data: {
      id: task.Id,
      subject: task.Subject,
      description: task.Description,
      status: task.Status,
      priority: task.Priority,
      activityDate: task.ActivityDate,
      whoId: task.WhoId,
      whatId: task.WhatId,
      ownerId: task.OwnerId,
      isClosed: task.IsClosed,
      isHighPriority: task.IsHighPriority,
      taskSubtype: task.TaskSubtype,
    },
    metadata: {
      organizationId,
      createdAt: task.CreatedDate,
      modifiedAt: task.LastModifiedDate,
      objectType: 'Task',
    },
  };
}

/**
 * Extract event data
 */
export function extractEvent(
  event: SalesforceEvent,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `sf-event-${event.Id}`,
    source: 'salesforce',
    eventType: 'crm.event',
    timestamp: new Date(event.LastModifiedDate),
    data: {
      id: event.Id,
      subject: event.Subject,
      description: event.Description,
      startDateTime: event.StartDateTime,
      endDateTime: event.EndDateTime,
      isAllDayEvent: event.IsAllDayEvent,
      durationInMinutes: event.DurationInMinutes,
      location: event.Location,
      whoId: event.WhoId,
      whatId: event.WhatId,
      ownerId: event.OwnerId,
      showAs: event.ShowAs,
      isPrivate: event.IsPrivate,
    },
    metadata: {
      organizationId,
      createdAt: event.CreatedDate,
      modifiedAt: event.LastModifiedDate,
      objectType: 'Event',
    },
  };
}

/**
 * Extract all Salesforce data
 */
export async function extractAllSalesforceData(
  client: SalesforceClient,
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    accounts: 0,
    contacts: 0,
    opportunities: 0,
    cases: 0,
    leads: 0,
    tasks: 0,
    events: 0,
    total: 0,
  };

  // Extract accounts
  const accounts = await client.getAccounts({
    modifiedSince: options.modifiedSince,
    limit: options.limit,
  });
  for (const account of accounts) {
    events.push(extractAccount(account, options.organizationId));
  }
  stats.accounts = accounts.length;

  // Extract contacts
  const contacts = await client.getContacts({
    modifiedSince: options.modifiedSince,
    limit: options.limit,
  });
  for (const contact of contacts) {
    events.push(extractContact(contact, options.organizationId));
  }
  stats.contacts = contacts.length;

  // Extract opportunities
  const opportunities = await client.getOpportunities({
    modifiedSince: options.modifiedSince,
    limit: options.limit,
  });
  for (const opportunity of opportunities) {
    events.push(extractOpportunity(opportunity, options.organizationId));
  }
  stats.opportunities = opportunities.length;

  // Extract cases
  const cases = await client.getCases({
    modifiedSince: options.modifiedSince,
    limit: options.limit,
  });
  for (const caseRecord of cases) {
    events.push(extractCase(caseRecord, options.organizationId));
  }
  stats.cases = cases.length;

  // Extract leads
  const leads = await client.getLeads({
    modifiedSince: options.modifiedSince,
    limit: options.limit,
  });
  for (const lead of leads) {
    events.push(extractLead(lead, options.organizationId));
  }
  stats.leads = leads.length;

  stats.total = events.length;

  return { events, stats };
}
