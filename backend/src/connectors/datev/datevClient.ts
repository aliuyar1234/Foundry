/**
 * DATEV API Client
 * REST API client for DATEV accounting software (German standard)
 */

export interface DatevAuthConfig {
  clientId: string;
  clientSecret: string;
  environment?: 'sandbox' | 'production';
}

export interface DatevTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: Date;
  tokenType: string;
}

// DATEV specific data structures
export interface DatevDocument {
  id: string;
  type: string;
  number: string;
  date: string;
  dueDate?: string;
  amount: number;
  currency: string;
  taxAmount?: number;
  description?: string;
  status: string;
  accountNumber?: string;
  contraAccountNumber?: string;
  costCenter?: string;
  costObject?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface DatevAccount {
  number: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
  currency: string;
  isActive: boolean;
  parentNumber?: string;
}

export interface DatevJournalEntry {
  id: string;
  documentId?: string;
  date: string;
  accountNumber: string;
  contraAccountNumber: string;
  amount: number;
  currency: string;
  description: string;
  taxCode?: string;
  costCenter?: string;
  costObject?: string;
  documentNumber?: string;
  createdAt: string;
}

export interface DatevBusinessPartner {
  id: string;
  number: string;
  name: string;
  type: 'customer' | 'vendor' | 'both';
  taxId?: string;
  vatId?: string;
  email?: string;
  phone?: string;
  address: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  accountNumber?: string;
  paymentTerms?: string;
  isActive: boolean;
  createdAt: string;
  modifiedAt: string;
}

export interface DatevPaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

// OAuth endpoints
const DATEV_AUTH_URL_SANDBOX = 'https://sandbox-api.datev.de/oauth/v2/authorize';
const DATEV_AUTH_URL_PROD = 'https://api.datev.de/oauth/v2/authorize';
const DATEV_TOKEN_URL_SANDBOX = 'https://sandbox-api.datev.de/oauth/v2/token';
const DATEV_TOKEN_URL_PROD = 'https://api.datev.de/oauth/v2/token';
const DATEV_API_URL_SANDBOX = 'https://sandbox-api.datev.de';
const DATEV_API_URL_PROD = 'https://api.datev.de';

// Required scopes
export const DATEV_SCOPES = [
  'accounting:read',
  'documents:read',
  'masterdata:read',
];

/**
 * Get DATEV authorization URL
 */
export function getAuthorizationUrl(
  config: DatevAuthConfig,
  redirectUri: string,
  state: string
): string {
  const baseUrl = config.environment === 'production'
    ? DATEV_AUTH_URL_PROD
    : DATEV_AUTH_URL_SANDBOX;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: DATEV_SCOPES.join(' '),
    state: state,
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: DatevAuthConfig,
  code: string,
  redirectUri: string
): Promise<DatevTokens> {
  const tokenUrl = config.environment === 'production'
    ? DATEV_TOKEN_URL_PROD
    : DATEV_TOKEN_URL_SANDBOX;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`DATEV token exchange failed: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    tokenType: data.token_type,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  config: DatevAuthConfig,
  refreshToken: string
): Promise<DatevTokens> {
  const tokenUrl = config.environment === 'production'
    ? DATEV_TOKEN_URL_PROD
    : DATEV_TOKEN_URL_SANDBOX;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`DATEV token refresh failed: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    tokenType: data.token_type,
  };
}

/**
 * DATEV REST API client
 */
export class DatevClient {
  private accessToken: string;
  private apiUrl: string;

  constructor(accessToken: string, environment: 'sandbox' | 'production' = 'sandbox') {
    this.accessToken = accessToken;
    this.apiUrl = environment === 'production' ? DATEV_API_URL_PROD : DATEV_API_URL_SANDBOX;
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`DATEV API error: ${error.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get documents (invoices, credit notes, etc.)
   */
  async getDocuments(options: {
    page?: number;
    pageSize?: number;
    modifiedSince?: Date;
    type?: string;
  } = {}): Promise<DatevPaginatedResult<DatevDocument>> {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      pageSize: String(options.pageSize || 100),
    });

    if (options.modifiedSince) {
      params.set('modifiedSince', options.modifiedSince.toISOString());
    }

    if (options.type) {
      params.set('type', options.type);
    }

    return this.request<DatevPaginatedResult<DatevDocument>>(
      `/accounting/v1/documents?${params.toString()}`
    );
  }

  /**
   * Get all documents (handles pagination)
   */
  async getAllDocuments(options: {
    modifiedSince?: Date;
    type?: string;
  } = {}): Promise<DatevDocument[]> {
    const allDocuments: DatevDocument[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getDocuments({ ...options, page, pageSize: 100 });
      allDocuments.push(...result.data);
      hasMore = page < result.pagination.totalPages;
      page++;
    }

    return allDocuments;
  }

  /**
   * Get accounts (chart of accounts)
   */
  async getAccounts(): Promise<DatevAccount[]> {
    const result = await this.request<{ accounts: DatevAccount[] }>(
      '/accounting/v1/accounts'
    );
    return result.accounts;
  }

  /**
   * Get journal entries
   */
  async getJournalEntries(options: {
    page?: number;
    pageSize?: number;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<DatevPaginatedResult<DatevJournalEntry>> {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      pageSize: String(options.pageSize || 100),
    });

    if (options.dateFrom) {
      params.set('dateFrom', options.dateFrom.toISOString().split('T')[0]);
    }

    if (options.dateTo) {
      params.set('dateTo', options.dateTo.toISOString().split('T')[0]);
    }

    return this.request<DatevPaginatedResult<DatevJournalEntry>>(
      `/accounting/v1/journal-entries?${params.toString()}`
    );
  }

  /**
   * Get all journal entries (handles pagination)
   */
  async getAllJournalEntries(options: {
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<DatevJournalEntry[]> {
    const allEntries: DatevJournalEntry[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getJournalEntries({ ...options, page, pageSize: 100 });
      allEntries.push(...result.data);
      hasMore = page < result.pagination.totalPages;
      page++;
    }

    return allEntries;
  }

  /**
   * Get business partners (customers and vendors)
   */
  async getBusinessPartners(options: {
    page?: number;
    pageSize?: number;
    type?: 'customer' | 'vendor' | 'both';
  } = {}): Promise<DatevPaginatedResult<DatevBusinessPartner>> {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      pageSize: String(options.pageSize || 100),
    });

    if (options.type) {
      params.set('type', options.type);
    }

    return this.request<DatevPaginatedResult<DatevBusinessPartner>>(
      `/masterdata/v1/business-partners?${params.toString()}`
    );
  }

  /**
   * Get all business partners (handles pagination)
   */
  async getAllBusinessPartners(options: {
    type?: 'customer' | 'vendor' | 'both';
  } = {}): Promise<DatevBusinessPartner[]> {
    const allPartners: DatevBusinessPartner[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getBusinessPartners({ ...options, page, pageSize: 100 });
      allPartners.push(...result.data);
      hasMore = page < result.pagination.totalPages;
      page++;
    }

    return allPartners;
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/accounting/v1/info');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create DATEV client
 */
export function createDatevClient(
  accessToken: string,
  environment: 'sandbox' | 'production' = 'sandbox'
): DatevClient {
  return new DatevClient(accessToken, environment);
}

/**
 * Validate DATEV configuration
 */
export function validateDatevConfig(config: Partial<DatevAuthConfig>): {
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
