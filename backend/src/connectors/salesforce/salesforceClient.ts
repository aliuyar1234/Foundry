/**
 * Salesforce OAuth and API Client
 * REST API client for Salesforce CRM
 */

export interface SalesforceAuthConfig {
  clientId: string;
  clientSecret: string;
  instanceUrl?: string;
}

export interface SalesforceTokens {
  accessToken: string;
  refreshToken?: string;
  instanceUrl: string;
  tokenType: string;
  issuedAt: string;
}

export interface SalesforceQueryResult<T> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}

// Common Salesforce objects
export interface SalesforceRecord {
  Id: string;
  attributes: {
    type: string;
    url: string;
  };
  CreatedDate: string;
  LastModifiedDate: string;
  SystemModstamp: string;
}

export interface SalesforceAccount extends SalesforceRecord {
  Name: string;
  Type?: string;
  Industry?: string;
  Phone?: string;
  Fax?: string;
  Website?: string;
  Description?: string;
  BillingStreet?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingPostalCode?: string;
  BillingCountry?: string;
  ShippingStreet?: string;
  ShippingCity?: string;
  ShippingState?: string;
  ShippingPostalCode?: string;
  ShippingCountry?: string;
  AnnualRevenue?: number;
  NumberOfEmployees?: number;
  OwnerId?: string;
  ParentId?: string;
}

export interface SalesforceContact extends SalesforceRecord {
  FirstName?: string;
  LastName: string;
  Name: string;
  AccountId?: string;
  Title?: string;
  Department?: string;
  Phone?: string;
  MobilePhone?: string;
  Email?: string;
  MailingStreet?: string;
  MailingCity?: string;
  MailingState?: string;
  MailingPostalCode?: string;
  MailingCountry?: string;
  OwnerId?: string;
}

export interface SalesforceOpportunity extends SalesforceRecord {
  Name: string;
  AccountId?: string;
  Amount?: number;
  CloseDate: string;
  StageName: string;
  Probability?: number;
  Type?: string;
  LeadSource?: string;
  IsClosed: boolean;
  IsWon: boolean;
  Description?: string;
  OwnerId?: string;
  ForecastCategory?: string;
  ForecastCategoryName?: string;
}

export interface SalesforceCase extends SalesforceRecord {
  CaseNumber: string;
  Subject?: string;
  Description?: string;
  Status: string;
  Priority?: string;
  Origin?: string;
  Type?: string;
  Reason?: string;
  AccountId?: string;
  ContactId?: string;
  OwnerId?: string;
  IsClosed: boolean;
  ClosedDate?: string;
}

export interface SalesforceLead extends SalesforceRecord {
  FirstName?: string;
  LastName: string;
  Name: string;
  Company: string;
  Title?: string;
  Email?: string;
  Phone?: string;
  MobilePhone?: string;
  Status: string;
  Industry?: string;
  LeadSource?: string;
  Rating?: string;
  Street?: string;
  City?: string;
  State?: string;
  PostalCode?: string;
  Country?: string;
  IsConverted: boolean;
  ConvertedAccountId?: string;
  ConvertedContactId?: string;
  ConvertedOpportunityId?: string;
  OwnerId?: string;
}

export interface SalesforceTask extends SalesforceRecord {
  Subject?: string;
  Description?: string;
  Status: string;
  Priority: string;
  ActivityDate?: string;
  WhoId?: string;
  WhatId?: string;
  OwnerId?: string;
  IsClosed: boolean;
  IsHighPriority: boolean;
  TaskSubtype?: string;
}

export interface SalesforceEvent extends SalesforceRecord {
  Subject?: string;
  Description?: string;
  StartDateTime: string;
  EndDateTime: string;
  IsAllDayEvent: boolean;
  DurationInMinutes?: number;
  Location?: string;
  WhoId?: string;
  WhatId?: string;
  OwnerId?: string;
  ShowAs?: string;
  IsPrivate: boolean;
}

// OAuth endpoints
const SALESFORCE_AUTH_URL = 'https://login.salesforce.com/services/oauth2/authorize';
const SALESFORCE_TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token';

// Required scopes
export const SALESFORCE_SCOPES = [
  'api',
  'refresh_token',
  'offline_access',
];

/**
 * Get Salesforce authorization URL
 */
export function getAuthorizationUrl(
  config: SalesforceAuthConfig,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state: state,
    scope: SALESFORCE_SCOPES.join(' '),
  });

  return `${SALESFORCE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: SalesforceAuthConfig,
  code: string,
  redirectUri: string
): Promise<SalesforceTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(SALESFORCE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Salesforce token exchange failed: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    instanceUrl: data.instance_url,
    tokenType: data.token_type,
    issuedAt: data.issued_at,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  config: SalesforceAuthConfig,
  refreshToken: string
): Promise<SalesforceTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(SALESFORCE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Salesforce token refresh failed: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: refreshToken, // Salesforce doesn't return new refresh token
    instanceUrl: data.instance_url,
    tokenType: data.token_type,
    issuedAt: data.issued_at,
  };
}

/**
 * Salesforce REST API client
 */
export class SalesforceClient {
  private accessToken: string;
  private instanceUrl: string;
  private apiVersion = 'v59.0';

  constructor(accessToken: string, instanceUrl: string) {
    this.accessToken = accessToken;
    this.instanceUrl = instanceUrl;
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.instanceUrl}/services/data/${this.apiVersion}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => [{ message: response.statusText }]);
      throw new Error(`Salesforce API error: ${error[0]?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Execute SOQL query
   */
  async query<T extends SalesforceRecord>(soql: string): Promise<SalesforceQueryResult<T>> {
    const encodedQuery = encodeURIComponent(soql);
    return this.request<SalesforceQueryResult<T>>(`/query?q=${encodedQuery}`);
  }

  /**
   * Get next page of query results
   */
  async queryMore<T extends SalesforceRecord>(
    nextRecordsUrl: string
  ): Promise<SalesforceQueryResult<T>> {
    return this.request<SalesforceQueryResult<T>>(nextRecordsUrl);
  }

  /**
   * Get all records from a query (handles pagination)
   */
  async queryAll<T extends SalesforceRecord>(soql: string): Promise<T[]> {
    const allRecords: T[] = [];
    let result = await this.query<T>(soql);

    allRecords.push(...result.records);

    while (!result.done && result.nextRecordsUrl) {
      result = await this.queryMore<T>(result.nextRecordsUrl);
      allRecords.push(...result.records);
    }

    return allRecords;
  }

  /**
   * Get single record by ID
   */
  async getRecord<T extends SalesforceRecord>(
    objectType: string,
    recordId: string,
    fields?: string[]
  ): Promise<T> {
    const fieldsParam = fields?.length ? `?fields=${fields.join(',')}` : '';
    return this.request<T>(`/sobjects/${objectType}/${recordId}${fieldsParam}`);
  }

  /**
   * Describe an object
   */
  async describeObject(objectType: string): Promise<unknown> {
    return this.request(`/sobjects/${objectType}/describe`);
  }

  /**
   * Get accounts
   */
  async getAccounts(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SalesforceAccount[]> {
    let soql = `SELECT Id, Name, Type, Industry, Phone, Fax, Website, Description,
                BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
                ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry,
                AnnualRevenue, NumberOfEmployees, OwnerId, ParentId,
                CreatedDate, LastModifiedDate, SystemModstamp
                FROM Account`;

    if (options.modifiedSince) {
      soql += ` WHERE LastModifiedDate >= ${options.modifiedSince.toISOString()}`;
    }

    soql += ` ORDER BY LastModifiedDate DESC`;

    if (options.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    return this.queryAll<SalesforceAccount>(soql);
  }

  /**
   * Get contacts
   */
  async getContacts(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SalesforceContact[]> {
    let soql = `SELECT Id, FirstName, LastName, Name, AccountId, Title, Department,
                Phone, MobilePhone, Email,
                MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry,
                OwnerId, CreatedDate, LastModifiedDate, SystemModstamp
                FROM Contact`;

    if (options.modifiedSince) {
      soql += ` WHERE LastModifiedDate >= ${options.modifiedSince.toISOString()}`;
    }

    soql += ` ORDER BY LastModifiedDate DESC`;

    if (options.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    return this.queryAll<SalesforceContact>(soql);
  }

  /**
   * Get opportunities
   */
  async getOpportunities(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SalesforceOpportunity[]> {
    let soql = `SELECT Id, Name, AccountId, Amount, CloseDate, StageName, Probability,
                Type, LeadSource, IsClosed, IsWon, Description, OwnerId,
                ForecastCategory, ForecastCategoryName,
                CreatedDate, LastModifiedDate, SystemModstamp
                FROM Opportunity`;

    if (options.modifiedSince) {
      soql += ` WHERE LastModifiedDate >= ${options.modifiedSince.toISOString()}`;
    }

    soql += ` ORDER BY LastModifiedDate DESC`;

    if (options.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    return this.queryAll<SalesforceOpportunity>(soql);
  }

  /**
   * Get cases
   */
  async getCases(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SalesforceCase[]> {
    let soql = `SELECT Id, CaseNumber, Subject, Description, Status, Priority, Origin,
                Type, Reason, AccountId, ContactId, OwnerId, IsClosed, ClosedDate,
                CreatedDate, LastModifiedDate, SystemModstamp
                FROM Case`;

    if (options.modifiedSince) {
      soql += ` WHERE LastModifiedDate >= ${options.modifiedSince.toISOString()}`;
    }

    soql += ` ORDER BY LastModifiedDate DESC`;

    if (options.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    return this.queryAll<SalesforceCase>(soql);
  }

  /**
   * Get leads
   */
  async getLeads(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SalesforceLead[]> {
    let soql = `SELECT Id, FirstName, LastName, Name, Company, Title, Email, Phone, MobilePhone,
                Status, Industry, LeadSource, Rating,
                Street, City, State, PostalCode, Country,
                IsConverted, ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId,
                OwnerId, CreatedDate, LastModifiedDate, SystemModstamp
                FROM Lead`;

    if (options.modifiedSince) {
      soql += ` WHERE LastModifiedDate >= ${options.modifiedSince.toISOString()}`;
    }

    soql += ` ORDER BY LastModifiedDate DESC`;

    if (options.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    return this.queryAll<SalesforceLead>(soql);
  }

  /**
   * Get user info
   */
  async getUserInfo(): Promise<{
    user_id: string;
    username: string;
    email: string;
    organization_id: string;
  }> {
    const response = await fetch(`${this.instanceUrl}/services/oauth2/userinfo`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getUserInfo();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Salesforce client
 */
export function createSalesforceClient(
  accessToken: string,
  instanceUrl: string
): SalesforceClient {
  return new SalesforceClient(accessToken, instanceUrl);
}

/**
 * Validate Salesforce configuration
 */
export function validateSalesforceConfig(config: Partial<SalesforceAuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.clientId) {
    errors.push('Missing clientId');
  }

  if (!config.clientSecret) {
    errors.push('Missing clientSecret');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
