/**
 * HubSpot OAuth and API Client
 * REST API client for HubSpot CRM
 */

export interface HubSpotAuthConfig {
  clientId: string;
  clientSecret: string;
  appId?: string;
}

export interface HubSpotTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: Date;
}

export interface HubSpotPaginatedResult<T> {
  results: T[];
  paging?: {
    next?: {
      after: string;
      link: string;
    };
  };
}

// Common HubSpot objects
export interface HubSpotObject {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface HubSpotCompany extends HubSpotObject {
  properties: {
    name: string | null;
    domain: string | null;
    industry: string | null;
    phone: string | null;
    website: string | null;
    description: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    zip: string | null;
    address: string | null;
    annualrevenue: string | null;
    numberofemployees: string | null;
    hubspot_owner_id: string | null;
    lifecyclestage: string | null;
    [key: string]: string | null;
  };
}

export interface HubSpotContact extends HubSpotObject {
  properties: {
    firstname: string | null;
    lastname: string | null;
    email: string | null;
    phone: string | null;
    mobilephone: string | null;
    company: string | null;
    jobtitle: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    zip: string | null;
    address: string | null;
    hubspot_owner_id: string | null;
    lifecyclestage: string | null;
    hs_lead_status: string | null;
    [key: string]: string | null;
  };
}

export interface HubSpotDeal extends HubSpotObject {
  properties: {
    dealname: string | null;
    amount: string | null;
    closedate: string | null;
    dealstage: string | null;
    pipeline: string | null;
    hubspot_owner_id: string | null;
    description: string | null;
    dealtype: string | null;
    hs_priority: string | null;
    hs_deal_stage_probability: string | null;
    [key: string]: string | null;
  };
}

export interface HubSpotTicket extends HubSpotObject {
  properties: {
    subject: string | null;
    content: string | null;
    hs_pipeline: string | null;
    hs_pipeline_stage: string | null;
    hs_ticket_priority: string | null;
    hubspot_owner_id: string | null;
    createdate: string | null;
    hs_lastmodifieddate: string | null;
    closed_date: string | null;
    [key: string]: string | null;
  };
}

export interface HubSpotEngagement {
  id: string;
  type: string;
  properties: {
    hs_timestamp: string | null;
    hubspot_owner_id: string | null;
    hs_createdate: string | null;
    hs_lastmodifieddate: string | null;
    [key: string]: string | null;
  };
  associations?: Record<string, unknown>;
}

// OAuth endpoints
const HUBSPOT_AUTH_URL = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';
const HUBSPOT_API_URL = 'https://api.hubapi.com';

// Required scopes
export const HUBSPOT_SCOPES = [
  'crm.objects.companies.read',
  'crm.objects.contacts.read',
  'crm.objects.deals.read',
  'crm.objects.owners.read',
  'tickets',
  'sales-email-read',
];

/**
 * Get HubSpot authorization URL
 */
export function getAuthorizationUrl(
  config: HubSpotAuthConfig,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: HUBSPOT_SCOPES.join(' '),
    state: state,
  });

  return `${HUBSPOT_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: HubSpotAuthConfig,
  code: string,
  redirectUri: string
): Promise<HubSpotTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`HubSpot token exchange failed: ${error.message || error.error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  config: HubSpotAuthConfig,
  refreshToken: string
): Promise<HubSpotTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`HubSpot token refresh failed: ${error.message || error.error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * HubSpot REST API client
 */
export class HubSpotClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
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
      : `${HUBSPOT_API_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`HubSpot API error: ${error.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get companies
   */
  async getCompanies(options: {
    after?: string;
    limit?: number;
    properties?: string[];
  } = {}): Promise<HubSpotPaginatedResult<HubSpotCompany>> {
    const properties = options.properties || [
      'name', 'domain', 'industry', 'phone', 'website', 'description',
      'city', 'state', 'country', 'zip', 'address',
      'annualrevenue', 'numberofemployees', 'hubspot_owner_id', 'lifecyclestage',
    ];

    const params = new URLSearchParams({
      limit: String(options.limit || 100),
      properties: properties.join(','),
    });

    if (options.after) {
      params.set('after', options.after);
    }

    return this.request<HubSpotPaginatedResult<HubSpotCompany>>(
      `/crm/v3/objects/companies?${params.toString()}`
    );
  }

  /**
   * Get all companies (handles pagination)
   */
  async getAllCompanies(): Promise<HubSpotCompany[]> {
    const allCompanies: HubSpotCompany[] = [];
    let after: string | undefined;

    do {
      const result = await this.getCompanies({ after });
      allCompanies.push(...result.results);
      after = result.paging?.next?.after;
    } while (after);

    return allCompanies;
  }

  /**
   * Get contacts
   */
  async getContacts(options: {
    after?: string;
    limit?: number;
    properties?: string[];
  } = {}): Promise<HubSpotPaginatedResult<HubSpotContact>> {
    const properties = options.properties || [
      'firstname', 'lastname', 'email', 'phone', 'mobilephone',
      'company', 'jobtitle', 'city', 'state', 'country', 'zip', 'address',
      'hubspot_owner_id', 'lifecyclestage', 'hs_lead_status',
    ];

    const params = new URLSearchParams({
      limit: String(options.limit || 100),
      properties: properties.join(','),
    });

    if (options.after) {
      params.set('after', options.after);
    }

    return this.request<HubSpotPaginatedResult<HubSpotContact>>(
      `/crm/v3/objects/contacts?${params.toString()}`
    );
  }

  /**
   * Get all contacts (handles pagination)
   */
  async getAllContacts(): Promise<HubSpotContact[]> {
    const allContacts: HubSpotContact[] = [];
    let after: string | undefined;

    do {
      const result = await this.getContacts({ after });
      allContacts.push(...result.results);
      after = result.paging?.next?.after;
    } while (after);

    return allContacts;
  }

  /**
   * Get deals
   */
  async getDeals(options: {
    after?: string;
    limit?: number;
    properties?: string[];
  } = {}): Promise<HubSpotPaginatedResult<HubSpotDeal>> {
    const properties = options.properties || [
      'dealname', 'amount', 'closedate', 'dealstage', 'pipeline',
      'hubspot_owner_id', 'description', 'dealtype', 'hs_priority',
      'hs_deal_stage_probability',
    ];

    const params = new URLSearchParams({
      limit: String(options.limit || 100),
      properties: properties.join(','),
    });

    if (options.after) {
      params.set('after', options.after);
    }

    return this.request<HubSpotPaginatedResult<HubSpotDeal>>(
      `/crm/v3/objects/deals?${params.toString()}`
    );
  }

  /**
   * Get all deals (handles pagination)
   */
  async getAllDeals(): Promise<HubSpotDeal[]> {
    const allDeals: HubSpotDeal[] = [];
    let after: string | undefined;

    do {
      const result = await this.getDeals({ after });
      allDeals.push(...result.results);
      after = result.paging?.next?.after;
    } while (after);

    return allDeals;
  }

  /**
   * Get tickets
   */
  async getTickets(options: {
    after?: string;
    limit?: number;
    properties?: string[];
  } = {}): Promise<HubSpotPaginatedResult<HubSpotTicket>> {
    const properties = options.properties || [
      'subject', 'content', 'hs_pipeline', 'hs_pipeline_stage',
      'hs_ticket_priority', 'hubspot_owner_id', 'createdate',
      'hs_lastmodifieddate', 'closed_date',
    ];

    const params = new URLSearchParams({
      limit: String(options.limit || 100),
      properties: properties.join(','),
    });

    if (options.after) {
      params.set('after', options.after);
    }

    return this.request<HubSpotPaginatedResult<HubSpotTicket>>(
      `/crm/v3/objects/tickets?${params.toString()}`
    );
  }

  /**
   * Get all tickets (handles pagination)
   */
  async getAllTickets(): Promise<HubSpotTicket[]> {
    const allTickets: HubSpotTicket[] = [];
    let after: string | undefined;

    do {
      const result = await this.getTickets({ after });
      allTickets.push(...result.results);
      after = result.paging?.next?.after;
    } while (after);

    return allTickets;
  }

  /**
   * Get account info
   */
  async getAccountInfo(): Promise<{
    portalId: number;
    accountType: string;
    timeZone: string;
    companyCurrency: string;
  }> {
    return this.request('/account-info/v3/details');
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAccountInfo();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create HubSpot client
 */
export function createHubSpotClient(accessToken: string): HubSpotClient {
  return new HubSpotClient(accessToken);
}

/**
 * Validate HubSpot configuration
 */
export function validateHubSpotConfig(config: Partial<HubSpotAuthConfig>): {
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
