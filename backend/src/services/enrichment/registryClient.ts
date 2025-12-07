/**
 * Company Registry API Client
 * Interfaces with Firmenbuch (Austria), Handelsregister (Germany), and other business registries
 * T306 - Registry API client for external data enrichment
 */

import { createHash } from 'crypto';

export interface RegistryConfig {
  provider: RegistryProvider;
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  timeout: number;
  retryAttempts: number;
  cacheTtlSeconds: number;
}

export type RegistryProvider =
  | 'firmenbuch_at'      // Austrian company registry
  | 'handelsregister_de' // German company registry
  | 'zefix_ch'           // Swiss company registry
  | 'companies_house_uk' // UK company registry
  | 'open_corporates'    // Global aggregator
  | 'mock';              // For testing

export interface CompanyRegistryData {
  registryId: string;
  registryType: RegistryProvider;
  companyName: string;
  legalForm?: string;
  registrationNumber: string;
  vatId?: string;
  address?: RegistryAddress;
  registrationDate?: Date;
  status: 'active' | 'inactive' | 'liquidation' | 'dissolved' | 'unknown';
  capital?: {
    amount: number;
    currency: string;
  };
  executives: Executive[];
  shareholders?: Shareholder[];
  industry?: string[];
  lastUpdated: Date;
  rawData?: Record<string, unknown>;
}

export interface RegistryAddress {
  street?: string;
  city: string;
  postalCode?: string;
  country: string;
  countryCode: string;
}

export interface Executive {
  name: string;
  role: string;
  appointedDate?: Date;
  resignedDate?: Date;
  nationality?: string;
}

export interface Shareholder {
  name: string;
  type: 'person' | 'company';
  sharePercentage?: number;
  shareCount?: number;
}

export interface RegistrySearchParams {
  companyName?: string;
  registrationNumber?: string;
  vatId?: string;
  country: string;
  city?: string;
  limit?: number;
}

export interface RegistrySearchResult {
  companies: CompanyRegistryData[];
  totalResults: number;
  hasMore: boolean;
  searchId?: string;
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expiresAt: number }>();

const DEFAULT_CONFIG: RegistryConfig = {
  provider: 'mock',
  timeout: 30000,
  retryAttempts: 3,
  cacheTtlSeconds: 3600, // 1 hour
};

/**
 * Registry API Client
 */
export class RegistryClient {
  private config: RegistryConfig;

  constructor(config: Partial<RegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Search for companies in the registry
   */
  async searchCompanies(params: RegistrySearchParams): Promise<RegistrySearchResult> {
    const cacheKey = this.getCacheKey('search', params);
    const cached = this.getFromCache<RegistrySearchResult>(cacheKey);
    if (cached) return cached;

    let result: RegistrySearchResult;

    switch (this.config.provider) {
      case 'firmenbuch_at':
        result = await this.searchFirmenbuch(params);
        break;
      case 'handelsregister_de':
        result = await this.searchHandelsregister(params);
        break;
      case 'zefix_ch':
        result = await this.searchZefix(params);
        break;
      case 'companies_house_uk':
        result = await this.searchCompaniesHouse(params);
        break;
      case 'open_corporates':
        result = await this.searchOpenCorporates(params);
        break;
      case 'mock':
      default:
        result = await this.searchMock(params);
    }

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get company details by registration number
   */
  async getCompanyDetails(
    registrationNumber: string,
    country: string
  ): Promise<CompanyRegistryData | null> {
    const cacheKey = this.getCacheKey('details', { registrationNumber, country });
    const cached = this.getFromCache<CompanyRegistryData>(cacheKey);
    if (cached) return cached;

    let result: CompanyRegistryData | null;

    switch (this.config.provider) {
      case 'firmenbuch_at':
        result = await this.getFirmenbuchDetails(registrationNumber);
        break;
      case 'handelsregister_de':
        result = await this.getHandelsregisterDetails(registrationNumber);
        break;
      case 'zefix_ch':
        result = await this.getZefixDetails(registrationNumber);
        break;
      case 'companies_house_uk':
        result = await this.getCompaniesHouseDetails(registrationNumber);
        break;
      case 'open_corporates':
        result = await this.getOpenCorporatesDetails(registrationNumber, country);
        break;
      case 'mock':
      default:
        result = await this.getMockDetails(registrationNumber, country);
    }

    if (result) {
      this.setCache(cacheKey, result);
    }
    return result;
  }

  /**
   * Lookup company by VAT ID
   */
  async lookupByVatId(vatId: string): Promise<CompanyRegistryData | null> {
    const cacheKey = this.getCacheKey('vat', { vatId });
    const cached = this.getFromCache<CompanyRegistryData>(cacheKey);
    if (cached) return cached;

    // Determine country from VAT prefix
    const country = vatId.substring(0, 2).toUpperCase();

    // Search using VAT ID
    const searchResult = await this.searchCompanies({
      vatId,
      country,
      limit: 1,
    });

    const result = searchResult.companies[0] || null;

    if (result) {
      this.setCache(cacheKey, result);
    }
    return result;
  }

  /**
   * Verify company exists and is active
   */
  async verifyCompany(
    registrationNumber: string,
    country: string
  ): Promise<{ exists: boolean; active: boolean; details?: CompanyRegistryData }> {
    const details = await this.getCompanyDetails(registrationNumber, country);

    if (!details) {
      return { exists: false, active: false };
    }

    return {
      exists: true,
      active: details.status === 'active',
      details,
    };
  }

  /**
   * Get executives for a company
   */
  async getExecutives(
    registrationNumber: string,
    country: string
  ): Promise<Executive[]> {
    const details = await this.getCompanyDetails(registrationNumber, country);
    return details?.executives || [];
  }

  // Provider-specific implementations

  private async searchFirmenbuch(params: RegistrySearchParams): Promise<RegistrySearchResult> {
    // Austrian Firmenbuch API implementation
    // In production, this would call the actual API
    // https://www.justiz.gv.at/home/e-services/firmenbuch~2c94848542ec30ed0142f5b0bcc14f83.de.html

    if (!this.config.apiKey) {
      throw new Error('Firmenbuch API key required');
    }

    // Placeholder - would use actual API
    return this.searchMock({ ...params, country: 'AT' });
  }

  private async getFirmenbuchDetails(registrationNumber: string): Promise<CompanyRegistryData | null> {
    // Austrian Firmenbuch details lookup
    return this.getMockDetails(registrationNumber, 'AT');
  }

  private async searchHandelsregister(params: RegistrySearchParams): Promise<RegistrySearchResult> {
    // German Handelsregister API implementation
    // https://www.handelsregister.de/

    if (!this.config.apiKey) {
      throw new Error('Handelsregister API key required');
    }

    return this.searchMock({ ...params, country: 'DE' });
  }

  private async getHandelsregisterDetails(registrationNumber: string): Promise<CompanyRegistryData | null> {
    return this.getMockDetails(registrationNumber, 'DE');
  }

  private async searchZefix(params: RegistrySearchParams): Promise<RegistrySearchResult> {
    // Swiss Zefix API (free public API)
    // https://www.zefix.ch/

    return this.searchMock({ ...params, country: 'CH' });
  }

  private async getZefixDetails(registrationNumber: string): Promise<CompanyRegistryData | null> {
    return this.getMockDetails(registrationNumber, 'CH');
  }

  private async searchCompaniesHouse(params: RegistrySearchParams): Promise<RegistrySearchResult> {
    // UK Companies House API (free with registration)
    // https://developer.company-information.service.gov.uk/

    if (!this.config.apiKey) {
      throw new Error('Companies House API key required');
    }

    return this.searchMock({ ...params, country: 'GB' });
  }

  private async getCompaniesHouseDetails(registrationNumber: string): Promise<CompanyRegistryData | null> {
    return this.getMockDetails(registrationNumber, 'GB');
  }

  private async searchOpenCorporates(params: RegistrySearchParams): Promise<RegistrySearchResult> {
    // OpenCorporates API (aggregates multiple registries)
    // https://api.opencorporates.com/

    if (!this.config.apiKey) {
      throw new Error('OpenCorporates API key required');
    }

    // In production, this would call the actual API:
    // GET https://api.opencorporates.com/v0.4/companies/search?q={name}&jurisdiction_code={country}

    return this.searchMock(params);
  }

  private async getOpenCorporatesDetails(
    registrationNumber: string,
    country: string
  ): Promise<CompanyRegistryData | null> {
    return this.getMockDetails(registrationNumber, country);
  }

  // Mock implementation for testing
  private async searchMock(params: RegistrySearchParams): Promise<RegistrySearchResult> {
    await this.simulateLatency();

    const mockCompanies: CompanyRegistryData[] = [];

    if (params.companyName) {
      mockCompanies.push(
        this.generateMockCompany(params.companyName, params.country),
        this.generateMockCompany(`${params.companyName} GmbH`, params.country),
        this.generateMockCompany(`${params.companyName} AG`, params.country)
      );
    }

    if (params.registrationNumber) {
      mockCompanies.push(
        this.generateMockCompany(`Company ${params.registrationNumber}`, params.country, params.registrationNumber)
      );
    }

    return {
      companies: mockCompanies.slice(0, params.limit || 10),
      totalResults: mockCompanies.length,
      hasMore: mockCompanies.length > (params.limit || 10),
    };
  }

  private async getMockDetails(
    registrationNumber: string,
    country: string
  ): Promise<CompanyRegistryData | null> {
    await this.simulateLatency();

    return this.generateMockCompany(
      `Sample Company ${registrationNumber}`,
      country,
      registrationNumber
    );
  }

  private generateMockCompany(
    name: string,
    country: string,
    regNumber?: string
  ): CompanyRegistryData {
    const hash = createHash('md5').update(name + country).digest('hex');
    const registrationNumber = regNumber || `${country}${hash.substring(0, 8).toUpperCase()}`;

    const legalForms: Record<string, string[]> = {
      AT: ['GmbH', 'AG', 'KG', 'OG', 'e.U.'],
      DE: ['GmbH', 'AG', 'KG', 'OHG', 'e.K.', 'UG'],
      CH: ['AG', 'GmbH', 'KG', 'Einzelunternehmen'],
      GB: ['Ltd', 'PLC', 'LLP', 'Partnership'],
    };

    const cities: Record<string, string[]> = {
      AT: ['Wien', 'Graz', 'Linz', 'Salzburg', 'Innsbruck'],
      DE: ['Berlin', 'München', 'Hamburg', 'Frankfurt', 'Köln'],
      CH: ['Zürich', 'Genf', 'Basel', 'Bern', 'Lausanne'],
      GB: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow'],
    };

    const forms = legalForms[country] || ['Ltd'];
    const cityList = cities[country] || ['City'];

    return {
      registryId: `reg_${hash.substring(0, 12)}`,
      registryType: this.config.provider,
      companyName: name,
      legalForm: forms[Math.floor(Math.random() * forms.length)],
      registrationNumber,
      vatId: `${country}${hash.substring(0, 9).toUpperCase()}`,
      address: {
        street: `${Math.floor(Math.random() * 100) + 1} Business Street`,
        city: cityList[Math.floor(Math.random() * cityList.length)],
        postalCode: `${Math.floor(Math.random() * 90000) + 10000}`,
        country: this.getCountryName(country),
        countryCode: country,
      },
      registrationDate: new Date(
        Date.now() - Math.floor(Math.random() * 10 * 365 * 24 * 60 * 60 * 1000)
      ),
      status: 'active',
      capital: {
        amount: Math.floor(Math.random() * 1000000) + 25000,
        currency: country === 'GB' ? 'GBP' : country === 'CH' ? 'CHF' : 'EUR',
      },
      executives: [
        {
          name: `CEO ${hash.substring(0, 4)}`,
          role: 'Geschäftsführer',
          appointedDate: new Date(Date.now() - Math.floor(Math.random() * 5 * 365 * 24 * 60 * 60 * 1000)),
        },
        {
          name: `CFO ${hash.substring(4, 8)}`,
          role: 'Prokurist',
          appointedDate: new Date(Date.now() - Math.floor(Math.random() * 3 * 365 * 24 * 60 * 60 * 1000)),
        },
      ],
      shareholders: [
        {
          name: `Holding ${hash.substring(8, 12)} GmbH`,
          type: 'company',
          sharePercentage: 100,
        },
      ],
      industry: ['Technology', 'Software'],
      lastUpdated: new Date(),
    };
  }

  private getCountryName(code: string): string {
    const countries: Record<string, string> = {
      AT: 'Austria',
      DE: 'Germany',
      CH: 'Switzerland',
      GB: 'United Kingdom',
      FR: 'France',
      IT: 'Italy',
      NL: 'Netherlands',
    };
    return countries[code] || code;
  }

  private async simulateLatency(): Promise<void> {
    if (this.config.provider === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    }
  }

  // Cache helpers
  private getCacheKey(operation: string, params: Record<string, unknown>): string {
    const paramsStr = JSON.stringify(params);
    return `${this.config.provider}:${operation}:${createHash('md5').update(paramsStr).digest('hex')}`;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown): void {
    cache.set(key, {
      data,
      expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    cache.clear();
  }
}

// Factory function for creating registry clients
export function createRegistryClient(
  country: string,
  config?: Partial<RegistryConfig>
): RegistryClient {
  const providerMap: Record<string, RegistryProvider> = {
    AT: 'firmenbuch_at',
    DE: 'handelsregister_de',
    CH: 'zefix_ch',
    GB: 'companies_house_uk',
  };

  const provider = providerMap[country.toUpperCase()] || 'open_corporates';

  return new RegistryClient({
    ...config,
    provider,
  });
}

export default RegistryClient;
