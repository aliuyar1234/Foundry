/**
 * SAP Business One Service Layer Client
 * REST API client for SAP B1 9.3+
 */

export interface SapB1ClientConfig {
  serverUrl: string;
  companyDb: string;
  username: string;
  password: string;
  sslEnabled?: boolean;
}

export interface SapB1Session {
  sessionId: string;
  version: string;
  sessionTimeout: number;
}

export interface SapB1Entity {
  [key: string]: unknown;
}

export interface SapB1QueryOptions {
  $filter?: string;
  $select?: string;
  $orderby?: string;
  $top?: number;
  $skip?: number;
  $expand?: string;
}

export interface SapB1QueryResponse<T> {
  value: T[];
  'odata.nextLink'?: string;
}

// Common SAP B1 entities
export interface SapBusinessPartner extends SapB1Entity {
  CardCode: string;
  CardName: string;
  CardType: 'cCustomer' | 'cSupplier' | 'cLead';
  GroupCode: number;
  Phone1?: string;
  Phone2?: string;
  Fax?: string;
  EmailAddress?: string;
  ContactPerson?: string;
  Currency?: string;
  FederalTaxID?: string;
  VatStatus?: string;
  Address?: string;
  City?: string;
  ZipCode?: string;
  Country?: string;
  BPAddresses?: SapBPAddress[];
  ContactEmployees?: SapContactEmployee[];
  CreateDate: string;
  UpdateDate: string;
}

export interface SapBPAddress {
  AddressType: 'bo_ShipTo' | 'bo_BillTo';
  AddressName: string;
  Street?: string;
  Block?: string;
  ZipCode?: string;
  City?: string;
  County?: string;
  Country?: string;
  State?: string;
}

export interface SapContactEmployee {
  CardCode: string;
  Name: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
  Title?: string;
  Position?: string;
  Phone1?: string;
  Phone2?: string;
  MobilePhone?: string;
  Fax?: string;
  E_Mail?: string;
  Active: 'tYES' | 'tNO';
}

export interface SapItem extends SapB1Entity {
  ItemCode: string;
  ItemName: string;
  ItemType: 'itItems' | 'itLabor' | 'itTravel' | 'itFixedAssets';
  ItemsGroupCode: number;
  BarCode?: string;
  VatLiable: 'tYES' | 'tNO';
  PurchaseItem: 'tYES' | 'tNO';
  SalesItem: 'tYES' | 'tNO';
  InventoryItem: 'tYES' | 'tNO';
  AvgStdPrice?: number;
  DefaultWarehouse?: string;
  ManageSerialNumbers: 'tYES' | 'tNO';
  ManageBatchNumbers: 'tYES' | 'tNO';
  CreateDate: string;
  UpdateDate: string;
}

export interface SapOrder extends SapB1Entity {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName: string;
  DocType: 'dDocument_Items' | 'dDocument_Service';
  DocDate: string;
  DocDueDate: string;
  DocTotal: number;
  DocTotalFC?: number;
  VatSum: number;
  DocCurrency: string;
  DocRate?: number;
  NumAtCard?: string;
  Comments?: string;
  DocumentStatus: 'bost_Open' | 'bost_Close' | 'bost_Delivered' | 'bost_Paid';
  Cancelled: 'tYES' | 'tNO';
  DocumentLines: SapDocumentLine[];
  CreateDate: string;
  UpdateDate: string;
}

export interface SapDocumentLine {
  LineNum: number;
  ItemCode: string;
  ItemDescription: string;
  Quantity: number;
  Price: number;
  PriceAfterVAT: number;
  Currency?: string;
  DiscountPercent?: number;
  LineTotal: number;
  GrossBuyPrice?: number;
  WarehouseCode?: string;
}

export interface SapInvoice extends SapOrder {
  // Inherits all SapOrder fields
  // Additional invoice-specific fields
  PaymentMethod?: string;
  CashDiscount?: number;
  CashDiscountDateOffset?: number;
}

/**
 * SAP Business One Service Layer client
 */
export class SapB1Client {
  private config: SapB1ClientConfig;
  private sessionId: string | null = null;
  private baseUrl: string;

  constructor(config: SapB1ClientConfig) {
    this.config = config;
    const protocol = config.sslEnabled !== false ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.serverUrl}/b1s/v1`;
  }

  /**
   * Login to SAP B1 Service Layer
   */
  async login(): Promise<SapB1Session> {
    const response = await fetch(`${this.baseUrl}/Login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        CompanyDB: this.config.companyDb,
        UserName: this.config.username,
        Password: this.config.password,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: { value: response.statusText } } }));
      throw new Error(`SAP B1 login failed: ${error.error?.message?.value || response.statusText}`);
    }

    const result = await response.json();

    // Extract session ID from cookie
    const setCookie = response.headers.get('set-cookie');
    const sessionMatch = setCookie?.match(/B1SESSION=([^;]+)/);

    if (!sessionMatch) {
      throw new Error('SAP B1 login failed: No session cookie returned');
    }

    this.sessionId = sessionMatch[1];

    return {
      sessionId: this.sessionId,
      version: result.Version || 'unknown',
      sessionTimeout: result.SessionTimeout || 30,
    };
  }

  /**
   * Logout from SAP B1 Service Layer
   */
  async logout(): Promise<void> {
    if (!this.sessionId) return;

    try {
      await fetch(`${this.baseUrl}/Logout`, {
        method: 'POST',
        headers: {
          Cookie: `B1SESSION=${this.sessionId}`,
        },
      });
    } finally {
      this.sessionId = null;
    }
  }

  /**
   * Ensure authenticated
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.sessionId) {
      await this.login();
    }
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.ensureAuthenticated();

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        Cookie: `B1SESSION=${this.sessionId}`,
      },
    });

    // Handle session timeout - re-login and retry
    if (response.status === 401) {
      this.sessionId = null;
      await this.login();
      return this.request(endpoint, options);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: { value: response.statusText } } }));
      throw new Error(`SAP B1 API error: ${error.error?.message?.value || response.statusText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Query entity collection
   */
  async query<T extends SapB1Entity>(
    entity: string,
    options: SapB1QueryOptions = {}
  ): Promise<SapB1QueryResponse<T>> {
    const params = new URLSearchParams();

    if (options.$filter) params.set('$filter', options.$filter);
    if (options.$select) params.set('$select', options.$select);
    if (options.$orderby) params.set('$orderby', options.$orderby);
    if (options.$top !== undefined) params.set('$top', options.$top.toString());
    if (options.$skip !== undefined) params.set('$skip', options.$skip.toString());
    if (options.$expand) params.set('$expand', options.$expand);

    const queryString = params.toString();
    const endpoint = `/${entity}${queryString ? `?${queryString}` : ''}`;

    return this.request<SapB1QueryResponse<T>>(endpoint);
  }

  /**
   * Get single entity by key
   */
  async get<T extends SapB1Entity>(entity: string, key: string | number): Promise<T> {
    const encodedKey = typeof key === 'string' ? `'${encodeURIComponent(key)}'` : key;
    return this.request<T>(`/${entity}(${encodedKey})`);
  }

  /**
   * Get all entities with pagination
   */
  async getAll<T extends SapB1Entity>(
    entity: string,
    options: SapB1QueryOptions = {},
    maxRecords = 10000
  ): Promise<T[]> {
    const allRecords: T[] = [];
    const pageSize = options.$top || 100;
    let skip = options.$skip || 0;

    while (allRecords.length < maxRecords) {
      const response = await this.query<T>(entity, {
        ...options,
        $top: Math.min(pageSize, maxRecords - allRecords.length),
        $skip: skip,
      });

      allRecords.push(...response.value);

      if (response.value.length < pageSize || !response['odata.nextLink']) {
        break;
      }

      skip += pageSize;
    }

    return allRecords;
  }

  /**
   * Get business partners (customers/suppliers)
   */
  async getBusinessPartners(options: {
    cardType?: 'cCustomer' | 'cSupplier' | 'cLead';
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SapBusinessPartner[]> {
    const filters: string[] = [];

    if (options.cardType) {
      filters.push(`CardType eq '${options.cardType}'`);
    }

    if (options.modifiedSince) {
      filters.push(`UpdateDate ge '${options.modifiedSince.toISOString().split('T')[0]}'`);
    }

    return this.getAll<SapBusinessPartner>('BusinessPartners', {
      $filter: filters.length > 0 ? filters.join(' and ') : undefined,
      $orderby: 'UpdateDate desc',
      $top: options.limit || 100,
      $expand: 'BPAddresses,ContactEmployees',
    });
  }

  /**
   * Get items (products)
   */
  async getItems(options: {
    itemType?: 'itItems' | 'itLabor' | 'itTravel' | 'itFixedAssets';
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SapItem[]> {
    const filters: string[] = [];

    if (options.itemType) {
      filters.push(`ItemType eq '${options.itemType}'`);
    }

    if (options.modifiedSince) {
      filters.push(`UpdateDate ge '${options.modifiedSince.toISOString().split('T')[0]}'`);
    }

    return this.getAll<SapItem>('Items', {
      $filter: filters.length > 0 ? filters.join(' and ') : undefined,
      $orderby: 'UpdateDate desc',
      $top: options.limit || 100,
    });
  }

  /**
   * Get orders (sales orders)
   */
  async getOrders(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SapOrder[]> {
    const filters: string[] = [];

    if (options.modifiedSince) {
      filters.push(`UpdateDate ge '${options.modifiedSince.toISOString().split('T')[0]}'`);
    }

    return this.getAll<SapOrder>('Orders', {
      $filter: filters.length > 0 ? filters.join(' and ') : undefined,
      $orderby: 'UpdateDate desc',
      $top: options.limit || 100,
      $expand: 'DocumentLines',
    });
  }

  /**
   * Get purchase orders
   */
  async getPurchaseOrders(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SapOrder[]> {
    const filters: string[] = [];

    if (options.modifiedSince) {
      filters.push(`UpdateDate ge '${options.modifiedSince.toISOString().split('T')[0]}'`);
    }

    return this.getAll<SapOrder>('PurchaseOrders', {
      $filter: filters.length > 0 ? filters.join(' and ') : undefined,
      $orderby: 'UpdateDate desc',
      $top: options.limit || 100,
      $expand: 'DocumentLines',
    });
  }

  /**
   * Get invoices (A/R invoices)
   */
  async getInvoices(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SapInvoice[]> {
    const filters: string[] = [];

    if (options.modifiedSince) {
      filters.push(`UpdateDate ge '${options.modifiedSince.toISOString().split('T')[0]}'`);
    }

    return this.getAll<SapInvoice>('Invoices', {
      $filter: filters.length > 0 ? filters.join(' and ') : undefined,
      $orderby: 'UpdateDate desc',
      $top: options.limit || 100,
      $expand: 'DocumentLines',
    });
  }

  /**
   * Get purchase invoices (A/P invoices)
   */
  async getPurchaseInvoices(options: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<SapInvoice[]> {
    const filters: string[] = [];

    if (options.modifiedSince) {
      filters.push(`UpdateDate ge '${options.modifiedSince.toISOString().split('T')[0]}'`);
    }

    return this.getAll<SapInvoice>('PurchaseInvoices', {
      $filter: filters.length > 0 ? filters.join(' and ') : undefined,
      $orderby: 'UpdateDate desc',
      $top: options.limit || 100,
      $expand: 'DocumentLines',
    });
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.login();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create SAP B1 client instance
 */
export function createSapB1Client(config: SapB1ClientConfig): SapB1Client {
  return new SapB1Client(config);
}
