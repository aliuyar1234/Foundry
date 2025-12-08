/**
 * SAP B1 Company Database Selector
 * Task: T060
 *
 * Handles company database selection and multi-company support.
 * Provides database discovery and validation.
 */

export interface CompanyDatabase {
  name: string;
  displayName?: string;
  version?: string;
  dbType: 'HANA' | 'MSSQL';
  isActive: boolean;
  lastAccessed?: Date;
}

export interface DatabaseSelectorConfig {
  serverUrl: string;
  sslEnabled?: boolean;
  adminUsername?: string;
  adminPassword?: string;
}

export interface DatabaseValidationResult {
  valid: boolean;
  companyName?: string;
  version?: string;
  dbType?: string;
  error?: string;
}

export class SapB1DatabaseSelector {
  private config: DatabaseSelectorConfig;
  private baseUrl: string;

  constructor(config: DatabaseSelectorConfig) {
    this.config = config;
    const protocol = config.sslEnabled !== false ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.serverUrl}`;
  }

  /**
   * List available company databases
   */
  async listDatabases(): Promise<CompanyDatabase[]> {
    try {
      // Try Service Layer endpoint
      const response = await fetch(`${this.baseUrl}/b1s/v1/SQLQueries('getCompanyList')/List`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        return this.parseDatabaseList(result.value || []);
      }

      // Fall back to checking known patterns
      return this.discoverDatabasesFromPattern();
    } catch (error) {
      console.warn('Failed to list databases:', error);
      return [];
    }
  }

  /**
   * Validate database access
   */
  async validateDatabase(
    companyDb: string,
    username: string,
    password: string
  ): Promise<DatabaseValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/b1s/v1/Login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          CompanyDB: companyDb,
          UserName: username,
          Password: password,
        }),
      });

      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          valid: false,
          error,
        };
      }

      const result = await response.json();

      // Extract session to logout
      const setCookie = response.headers.get('set-cookie');
      const sessionMatch = setCookie?.match(/B1SESSION=([^;]+)/);

      if (sessionMatch) {
        // Logout
        await fetch(`${this.baseUrl}/b1s/v1/Logout`, {
          method: 'POST',
          headers: {
            Cookie: `B1SESSION=${sessionMatch[1]}`,
          },
        });
      }

      return {
        valid: true,
        companyName: companyDb,
        version: result.Version,
        dbType: result.Version?.includes('HANA') ? 'HANA' : 'MSSQL',
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Get database info
   */
  async getDatabaseInfo(
    companyDb: string,
    sessionId: string
  ): Promise<CompanyDatabase | null> {
    try {
      const response = await fetch(`${this.baseUrl}/b1s/v1/CompanyService_GetCompanyInfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `B1SESSION=${sessionId}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();

      return {
        name: companyDb,
        displayName: result.CompanyName,
        version: result.SystemVersion,
        dbType: result.EnableHANA === 'tYES' ? 'HANA' : 'MSSQL',
        isActive: true,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get company details
   */
  async getCompanyDetails(
    sessionId: string
  ): Promise<{
    companyName: string;
    localCurrency: string;
    systemCurrency: string;
    countryCode: string;
    chartOfAccountsTemplate: string;
    enableBranches: boolean;
  } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/b1s/v1/CompanyService_GetCompanyInfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `B1SESSION=${sessionId}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();

      return {
        companyName: result.CompanyName || '',
        localCurrency: result.LocalCurrency || '',
        systemCurrency: result.SystemCurrency || '',
        countryCode: result.Country || '',
        chartOfAccountsTemplate: result.ChartOfAccountsTemplate || '',
        enableBranches: result.EnableBranches === 'tYES',
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if database supports HANA
   */
  async isHANADatabase(companyDb: string, sessionId: string): Promise<boolean> {
    const info = await this.getDatabaseInfo(companyDb, sessionId);
    return info?.dbType === 'HANA';
  }

  /**
   * Get available periods/fiscal years
   */
  async getAvailablePeriods(
    sessionId: string
  ): Promise<Array<{ code: number; name: string; startDate: string; endDate: string }>> {
    try {
      const response = await fetch(
        `${this.baseUrl}/b1s/v1/FinancialYears?$orderby=Code desc`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `B1SESSION=${sessionId}`,
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const result = await response.json();
      return (result.value || []).map((p: any) => ({
        code: p.AbsEntry,
        name: p.Description || `FY ${p.AbsEntry}`,
        startDate: p.StartDate,
        endDate: p.EndDate,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Parse database list from API response
   */
  private parseDatabaseList(data: any[]): CompanyDatabase[] {
    return data.map((item) => ({
      name: item.CompanyDB || item.DatabaseName || item.Name,
      displayName: item.CompanyName || item.DisplayName,
      version: item.Version,
      dbType: item.DatabaseType?.includes('HANA') ? 'HANA' : 'MSSQL',
      isActive: item.Status !== 'Inactive',
    }));
  }

  /**
   * Discover databases from common naming patterns
   */
  private async discoverDatabasesFromPattern(): Promise<CompanyDatabase[]> {
    // Common SAP B1 database naming patterns
    const patterns = ['SBODemo', 'SBODEM', 'SBO'];
    const discovered: CompanyDatabase[] = [];

    for (const pattern of patterns) {
      try {
        // Try to reach the login endpoint with the database name
        const response = await fetch(`${this.baseUrl}/b1s/v1/Login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            CompanyDB: pattern,
            UserName: 'test',
            Password: 'test',
          }),
        });

        // If we get a 401 or authentication error, the database exists
        if (response.status === 401 || response.status === 400) {
          discovered.push({
            name: pattern,
            dbType: 'MSSQL',
            isActive: true,
          });
        }
      } catch {
        // Ignore errors
      }
    }

    return discovered;
  }

  /**
   * Get headers for requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.adminUsername && this.config.adminPassword) {
      const auth = Buffer.from(
        `${this.config.adminUsername}:${this.config.adminPassword}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    return headers;
  }

  /**
   * Parse error from response
   */
  private async parseError(response: Response): Promise<string> {
    try {
      const data = await response.json();
      return data.error?.message?.value || data.error?.message || response.statusText;
    } catch {
      return response.statusText;
    }
  }
}

/**
 * Create database selector
 */
export function createSapB1DatabaseSelector(
  config: DatabaseSelectorConfig
): SapB1DatabaseSelector {
  return new SapB1DatabaseSelector(config);
}
