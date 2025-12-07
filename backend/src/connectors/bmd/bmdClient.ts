/**
 * BMD API Client
 * REST API client for BMD NTCS accounting software (Austrian standard)
 */

export interface BmdAuthConfig {
  apiUrl: string;
  apiKey: string;
  companyId: string;
  username?: string;
  password?: string;
}

export interface BmdTokens {
  accessToken: string;
  expiresAt: Date;
}

// BMD specific data structures
export interface BmdDocument {
  id: string;
  documentNumber: string;
  documentType: string;
  documentDate: string;
  postingDate: string;
  dueDate?: string;
  amount: number;
  netAmount: number;
  taxAmount: number;
  currency: string;
  description?: string;
  status: string;
  accountNumber: string;
  contraAccountNumber?: string;
  costCenter?: string;
  costObject?: string;
  partnerId?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface BmdAccount {
  number: string;
  name: string;
  accountClass: string;
  accountType: string;
  balance: number;
  currency: string;
  isActive: boolean;
  parentNumber?: string;
  taxCode?: string;
}

export interface BmdJournalEntry {
  id: string;
  documentId?: string;
  documentNumber?: string;
  postingDate: string;
  accountNumber: string;
  contraAccountNumber: string;
  debitAmount: number;
  creditAmount: number;
  currency: string;
  description: string;
  taxCode?: string;
  costCenter?: string;
  costObject?: string;
  createdAt: string;
}

export interface BmdBusinessPartner {
  id: string;
  number: string;
  name: string;
  shortName?: string;
  type: 'customer' | 'vendor' | 'both';
  taxNumber?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  fax?: string;
  website?: string;
  address: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  accountNumber?: string;
  paymentTermsDays?: number;
  creditLimit?: number;
  isActive: boolean;
  createdAt: string;
  modifiedAt: string;
}

export interface BmdCostCenter {
  id: string;
  number: string;
  name: string;
  description?: string;
  isActive: boolean;
  parentId?: string;
}

export interface BmdPaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    totalPages: number;
    totalCount: number;
  };
}

// API endpoints
const BMD_API_VERSION = 'v1';

/**
 * BMD REST API client
 */
export class BmdClient {
  private apiUrl: string;
  private apiKey: string;
  private companyId: string;
  private accessToken?: string;

  constructor(config: BmdAuthConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.companyId = config.companyId;
  }

  /**
   * Authenticate with BMD
   */
  async authenticate(): Promise<BmdTokens> {
    const response = await fetch(`${this.apiUrl}/api/${BMD_API_VERSION}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        companyId: this.companyId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`BMD authentication failed: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.accessToken;

    return {
      accessToken: data.accessToken,
      expiresAt: new Date(Date.now() + (data.expiresIn || 3600) * 1000),
    };
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const url = `${this.apiUrl}/api/${BMD_API_VERSION}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        'X-API-Key': this.apiKey,
        'X-Company-ID': this.companyId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      // Token expired, re-authenticate
      await this.authenticate();
      return this.request<T>(endpoint, options);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`BMD API error: ${error.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get documents
   */
  async getDocuments(options: {
    page?: number;
    perPage?: number;
    modifiedSince?: Date;
    documentType?: string;
  } = {}): Promise<BmdPaginatedResult<BmdDocument>> {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      perPage: String(options.perPage || 100),
    });

    if (options.modifiedSince) {
      params.set('modifiedSince', options.modifiedSince.toISOString());
    }

    if (options.documentType) {
      params.set('documentType', options.documentType);
    }

    return this.request<BmdPaginatedResult<BmdDocument>>(
      `/documents?${params.toString()}`
    );
  }

  /**
   * Get all documents (handles pagination)
   */
  async getAllDocuments(options: {
    modifiedSince?: Date;
    documentType?: string;
  } = {}): Promise<BmdDocument[]> {
    const allDocuments: BmdDocument[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getDocuments({ ...options, page, perPage: 100 });
      allDocuments.push(...result.data);
      hasMore = page < result.meta.totalPages;
      page++;
    }

    return allDocuments;
  }

  /**
   * Get accounts
   */
  async getAccounts(options: {
    page?: number;
    perPage?: number;
    accountClass?: string;
  } = {}): Promise<BmdPaginatedResult<BmdAccount>> {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      perPage: String(options.perPage || 100),
    });

    if (options.accountClass) {
      params.set('accountClass', options.accountClass);
    }

    return this.request<BmdPaginatedResult<BmdAccount>>(
      `/accounts?${params.toString()}`
    );
  }

  /**
   * Get all accounts (handles pagination)
   */
  async getAllAccounts(): Promise<BmdAccount[]> {
    const allAccounts: BmdAccount[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getAccounts({ page, perPage: 100 });
      allAccounts.push(...result.data);
      hasMore = page < result.meta.totalPages;
      page++;
    }

    return allAccounts;
  }

  /**
   * Get journal entries
   */
  async getJournalEntries(options: {
    page?: number;
    perPage?: number;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<BmdPaginatedResult<BmdJournalEntry>> {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      perPage: String(options.perPage || 100),
    });

    if (options.dateFrom) {
      params.set('dateFrom', options.dateFrom.toISOString().split('T')[0]);
    }

    if (options.dateTo) {
      params.set('dateTo', options.dateTo.toISOString().split('T')[0]);
    }

    return this.request<BmdPaginatedResult<BmdJournalEntry>>(
      `/journal-entries?${params.toString()}`
    );
  }

  /**
   * Get all journal entries (handles pagination)
   */
  async getAllJournalEntries(options: {
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<BmdJournalEntry[]> {
    const allEntries: BmdJournalEntry[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getJournalEntries({ ...options, page, perPage: 100 });
      allEntries.push(...result.data);
      hasMore = page < result.meta.totalPages;
      page++;
    }

    return allEntries;
  }

  /**
   * Get business partners
   */
  async getBusinessPartners(options: {
    page?: number;
    perPage?: number;
    type?: 'customer' | 'vendor' | 'both';
  } = {}): Promise<BmdPaginatedResult<BmdBusinessPartner>> {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      perPage: String(options.perPage || 100),
    });

    if (options.type) {
      params.set('type', options.type);
    }

    return this.request<BmdPaginatedResult<BmdBusinessPartner>>(
      `/business-partners?${params.toString()}`
    );
  }

  /**
   * Get all business partners (handles pagination)
   */
  async getAllBusinessPartners(options: {
    type?: 'customer' | 'vendor' | 'both';
  } = {}): Promise<BmdBusinessPartner[]> {
    const allPartners: BmdBusinessPartner[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getBusinessPartners({ ...options, page, perPage: 100 });
      allPartners.push(...result.data);
      hasMore = page < result.meta.totalPages;
      page++;
    }

    return allPartners;
  }

  /**
   * Get cost centers
   */
  async getCostCenters(): Promise<BmdCostCenter[]> {
    const result = await this.request<{ costCenters: BmdCostCenter[] }>(
      '/cost-centers'
    );
    return result.costCenters;
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create BMD client
 */
export function createBmdClient(config: BmdAuthConfig): BmdClient {
  return new BmdClient(config);
}

/**
 * Validate BMD configuration
 */
export function validateBmdConfig(config: Partial<BmdAuthConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.apiUrl) {
    errors.push('Missing apiUrl');
  }

  if (!config.apiKey) {
    errors.push('Missing apiKey');
  }

  if (!config.companyId) {
    errors.push('Missing companyId');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
