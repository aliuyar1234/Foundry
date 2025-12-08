/**
 * Test Fixtures for Connector Tests
 * Reusable mock data for connector testing
 */

export interface MockConnectorRecord {
  id: string;
  type: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

// Google Workspace Mock Data
export const mockGoogleWorkspaceData = {
  contacts: [
    {
      id: 'goog-contact-001',
      resourceName: 'people/c123456',
      names: [
        {
          givenName: 'John',
          familyName: 'Doe',
          displayName: 'John Doe',
        },
      ],
      emailAddresses: [
        {
          value: 'john.doe@example.com',
          type: 'work',
        },
      ],
      phoneNumbers: [
        {
          value: '+1-555-0100',
          type: 'work',
        },
      ],
    },
  ],
  emails: [
    {
      id: 'msg-001',
      threadId: 'thread-001',
      labelIds: ['INBOX'],
      snippet: 'Test email message',
      payload: {
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'To', value: 'recipient@example.com' },
          { name: 'Subject', value: 'Test Subject' },
          { name: 'Date', value: 'Mon, 8 Dec 2025 10:00:00 +0000' },
        ],
      },
    },
  ],
  calendarEvents: [
    {
      id: 'event-001',
      summary: 'Team Meeting',
      start: { dateTime: '2025-12-08T14:00:00Z' },
      end: { dateTime: '2025-12-08T15:00:00Z' },
      attendees: [
        { email: 'attendee1@example.com', responseStatus: 'accepted' },
        { email: 'attendee2@example.com', responseStatus: 'tentative' },
      ],
    },
  ],
};

// Salesforce Mock Data
export const mockSalesforceData = {
  accounts: [
    {
      Id: '001000000001ABC',
      Name: 'Acme Corporation',
      Industry: 'Technology',
      Type: 'Customer',
      NumberOfEmployees: 500,
      AnnualRevenue: 50000000,
      BillingAddress: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'USA',
      },
    },
  ],
  opportunities: [
    {
      Id: '006000000001XYZ',
      Name: 'Enterprise Deal',
      Amount: 250000,
      StageName: 'Negotiation',
      CloseDate: '2025-03-31',
      Probability: 75,
      AccountId: '001000000001ABC',
    },
  ],
  activities: [
    {
      Id: '00T000000001MNO',
      Type: 'Call',
      Subject: 'Discovery Call',
      ActivityDate: '2025-12-08',
      WhoId: '003000000001PQR',
      WhatId: '006000000001XYZ',
    },
  ],
};

// HubSpot Mock Data
export const mockHubSpotData = {
  contacts: [
    {
      id: '12345',
      properties: {
        email: 'contact@example.com',
        firstname: 'Jane',
        lastname: 'Smith',
        company: 'Tech Inc',
        phone: '+1-555-0200',
        lifecyclestage: 'customer',
      },
    },
  ],
  deals: [
    {
      id: '67890',
      properties: {
        dealname: 'Enterprise Contract',
        amount: '250000',
        dealstage: 'presentationscheduled',
        closedate: '2025-03-15T00:00:00Z',
        pipeline: 'default',
      },
    },
  ],
  engagements: [
    {
      id: '11111',
      engagement: {
        type: 'EMAIL',
        timestamp: 1733655600000,
      },
      associations: {
        contactIds: ['12345'],
        dealIds: ['67890'],
      },
      metadata: {
        subject: 'Follow-up Email',
        body: 'Thanks for the meeting...',
      },
    },
  ],
};

// Slack Mock Data
export const mockSlackData = {
  messages: [
    {
      type: 'message',
      ts: '1733655600.000100',
      user: 'U123ABC',
      text: 'Hello team!',
      channel: 'C456DEF',
      thread_ts: null,
      reactions: [
        {
          name: 'thumbsup',
          users: ['U789GHI', 'U012JKL'],
          count: 2,
        },
      ],
    },
  ],
  channels: [
    {
      id: 'C456DEF',
      name: 'general',
      is_channel: true,
      is_private: false,
      created: 1609459200,
      num_members: 25,
    },
  ],
  users: [
    {
      id: 'U123ABC',
      name: 'john.doe',
      real_name: 'John Doe',
      profile: {
        email: 'john.doe@company.com',
        title: 'Software Engineer',
      },
    },
  ],
};

// Microsoft 365 Mock Data
export const mockM365Data = {
  emails: [
    {
      id: 'm365-msg-001',
      subject: 'Project Update',
      from: {
        emailAddress: {
          name: 'Alice Brown',
          address: 'alice@company.com',
        },
      },
      toRecipients: [
        {
          emailAddress: {
            name: 'Bob Smith',
            address: 'bob@company.com',
          },
        },
      ],
      receivedDateTime: '2025-12-08T10:00:00Z',
      hasAttachments: true,
    },
  ],
  calendarEvents: [
    {
      id: 'm365-event-001',
      subject: 'Project Review',
      start: {
        dateTime: '2025-12-09T14:00:00',
        timeZone: 'UTC',
      },
      end: {
        dateTime: '2025-12-09T15:00:00',
        timeZone: 'UTC',
      },
      attendees: [
        {
          emailAddress: {
            name: 'Alice Brown',
            address: 'alice@company.com',
          },
          status: {
            response: 'accepted',
          },
        },
      ],
    },
  ],
};

// SAP Business One Mock Data
export const mockSAPB1Data = {
  businessPartners: [
    {
      CardCode: 'C00001',
      CardName: 'Customer ABC',
      CardType: 'C',
      EmailAddress: 'contact@customerabc.com',
      Phone1: '+1-555-0300',
      Address: '789 Business Blvd, Chicago, IL 60601',
    },
  ],
  documents: [
    {
      DocEntry: 1001,
      DocNum: 'SO-2025-001',
      DocType: 'dDocument_Items',
      DocDate: '2025-12-01',
      CardCode: 'C00001',
      DocTotal: 15000,
      DocumentLines: [
        {
          ItemCode: 'ITEM-001',
          Quantity: 10,
          UnitPrice: 1500,
          LineTotal: 15000,
        },
      ],
    },
  ],
};

// DATEV Mock Data
export const mockDATEVData = {
  documents: [
    {
      id: 'datev-doc-001',
      documentNumber: 'RE-2025-0001',
      documentType: 'Invoice',
      date: '2025-12-01',
      amount: 1190,
      currency: 'EUR',
      taxAmount: 190,
      netAmount: 1000,
      businessPartner: 'C00001',
    },
  ],
  costCenters: [
    {
      id: 'cc-001',
      number: '1000',
      name: 'Sales Department',
      description: 'Main sales department cost center',
    },
  ],
};

// Odoo Mock Data
export const mockOdooData = {
  partners: [
    {
      id: 1,
      name: 'Partner Company',
      email: 'info@partner.com',
      phone: '+1-555-0400',
      is_company: true,
      customer_rank: 1,
    },
  ],
  saleOrders: [
    {
      id: 101,
      name: 'SO0001',
      partner_id: 1,
      date_order: '2025-12-01',
      amount_total: 5000,
      state: 'sale',
      order_line: [
        {
          product_id: 10,
          product_uom_qty: 5,
          price_unit: 1000,
          price_subtotal: 5000,
        },
      ],
    },
  ],
};

// Generic test data generator
export function generateMockRecords(
  count: number,
  type: string
): MockConnectorRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${type}-${String(i).padStart(6, '0')}`,
    type,
    timestamp: new Date(Date.now() - Math.random() * 86400000 * 365),
    data: {
      index: i,
      name: `${type} Record ${i}`,
      value: Math.random() * 1000,
      status: ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)],
      tags: ['tag1', 'tag2', 'tag3'].slice(0, Math.floor(Math.random() * 3) + 1),
    },
  }));
}

// Test credentials (for testing only, never use in production)
export const testCredentials = {
  oauth: {
    accessToken: 'test_access_token_12345',
    refreshToken: 'test_refresh_token_67890',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    scope: 'read write',
  },
  apiKey: {
    apiKey: 'test_api_key_abcdef123456',
    apiSecret: 'test_api_secret_xyz789',
  },
  basic: {
    username: 'test_user',
    password: 'test_password_123!',
  },
};
