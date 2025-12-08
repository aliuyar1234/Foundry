/**
 * SAP B1 Version Detector
 * Task: T070
 *
 * Detects SAP B1 version and database type (HANA vs SQL Server).
 * Provides version-specific feature detection.
 */

export interface SapB1Version {
  majorVersion: number;
  minorVersion: number;
  patchLevel: number;
  fullVersion: string;
  releaseYear: number;
}

export interface SapB1ServerCapabilities {
  version: SapB1Version;
  dbType: 'HANA' | 'MSSQL';
  features: {
    serviceLayer: boolean;
    diApi: boolean;
    analyticsService: boolean;
    attachmentService: boolean;
    approvalProcess: boolean;
    branches: boolean;
    multiCurrency: boolean;
    batchNumbering: boolean;
    serialNumbering: boolean;
    projectManagement: boolean;
    serviceModule: boolean;
    productionModule: boolean;
    materialRequirementsPlanning: boolean;
    webClient: boolean;
    mobileApp: boolean;
  };
  apiVersion: string;
  supportedODataVersions: string[];
}

// Version to feature mapping
const VERSION_FEATURES: Record<number, Partial<SapB1ServerCapabilities['features']>> = {
  9.0: {
    serviceLayer: false,
    diApi: true,
    analyticsService: false,
  },
  9.1: {
    serviceLayer: true,
    diApi: true,
    analyticsService: false,
  },
  9.2: {
    serviceLayer: true,
    diApi: true,
    analyticsService: true,
    attachmentService: true,
  },
  9.3: {
    serviceLayer: true,
    diApi: true,
    analyticsService: true,
    attachmentService: true,
    approvalProcess: true,
    webClient: true,
  },
  10.0: {
    serviceLayer: true,
    diApi: true,
    analyticsService: true,
    attachmentService: true,
    approvalProcess: true,
    webClient: true,
    mobileApp: true,
  },
};

export class SapB1VersionDetector {
  private serverUrl: string;
  private sslEnabled: boolean;

  constructor(serverUrl: string, sslEnabled = true) {
    this.serverUrl = serverUrl;
    this.sslEnabled = sslEnabled;
  }

  /**
   * Detect server version and capabilities
   */
  async detectCapabilities(sessionId?: string): Promise<SapB1ServerCapabilities | null> {
    try {
      const version = await this.detectVersion(sessionId);
      if (!version) return null;

      const dbType = await this.detectDatabaseType(sessionId);
      const features = this.getFeatures(version);

      return {
        version,
        dbType,
        features,
        apiVersion: this.getApiVersion(version),
        supportedODataVersions: this.getSupportedODataVersions(version),
      };
    } catch (error) {
      console.error('Failed to detect capabilities:', error);
      return null;
    }
  }

  /**
   * Detect SAP B1 version
   */
  async detectVersion(sessionId?: string): Promise<SapB1Version | null> {
    const baseUrl = this.getBaseUrl();

    try {
      // Try to get version from login response or company info
      if (sessionId) {
        const response = await fetch(`${baseUrl}/CompanyService_GetCompanyInfo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `B1SESSION=${sessionId}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return this.parseVersion(data.SystemVersion || data.Version);
        }
      }

      // Try metadata endpoint
      const metaResponse = await fetch(`${baseUrl}/$metadata`);
      if (metaResponse.ok) {
        const text = await metaResponse.text();
        const versionMatch = text.match(/Version="([^"]+)"/);
        if (versionMatch) {
          return this.parseVersion(versionMatch[1]);
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Detect database type (HANA vs MSSQL)
   */
  async detectDatabaseType(sessionId?: string): Promise<'HANA' | 'MSSQL'> {
    const baseUrl = this.getBaseUrl();

    try {
      if (sessionId) {
        const response = await fetch(`${baseUrl}/CompanyService_GetCompanyInfo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `B1SESSION=${sessionId}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.EnableHANA === 'tYES' || data.DbServerType === 'dst_HANADB') {
            return 'HANA';
          }
        }
      }

      // Try to detect from server URL or other indicators
      if (this.serverUrl.toLowerCase().includes('hana')) {
        return 'HANA';
      }

      // Default to MSSQL
      return 'MSSQL';
    } catch {
      return 'MSSQL';
    }
  }

  /**
   * Parse version string
   */
  parseVersion(versionString: string): SapB1Version {
    // Format: "9.3 PL10" or "10.0.1" or "930100"
    const match = versionString.match(/(\d+)\.?(\d+)?\.?(\d+)?/);

    if (!match) {
      return {
        majorVersion: 9,
        minorVersion: 3,
        patchLevel: 0,
        fullVersion: versionString,
        releaseYear: 2019,
      };
    }

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2] || '0', 10);
    const patch = parseInt(match[3] || '0', 10);

    // Extract patch level from "PL" notation
    const plMatch = versionString.match(/PL\s*(\d+)/i);
    const patchLevel = plMatch ? parseInt(plMatch[1], 10) : patch;

    return {
      majorVersion: major,
      minorVersion: minor,
      patchLevel,
      fullVersion: versionString,
      releaseYear: this.getVersionYear(major, minor),
    };
  }

  /**
   * Get features for version
   */
  getFeatures(version: SapB1Version): SapB1ServerCapabilities['features'] {
    const versionKey = parseFloat(`${version.majorVersion}.${version.minorVersion}`);

    // Start with default features
    const features: SapB1ServerCapabilities['features'] = {
      serviceLayer: false,
      diApi: true,
      analyticsService: false,
      attachmentService: false,
      approvalProcess: true,
      branches: true,
      multiCurrency: true,
      batchNumbering: true,
      serialNumbering: true,
      projectManagement: true,
      serviceModule: true,
      productionModule: true,
      materialRequirementsPlanning: true,
      webClient: false,
      mobileApp: false,
    };

    // Apply version-specific features
    for (const [ver, verFeatures] of Object.entries(VERSION_FEATURES)) {
      if (versionKey >= parseFloat(ver)) {
        Object.assign(features, verFeatures);
      }
    }

    return features;
  }

  /**
   * Get API version for SAP B1 version
   */
  getApiVersion(version: SapB1Version): string {
    if (version.majorVersion >= 10) {
      return 'v2';
    }
    return 'v1';
  }

  /**
   * Get supported OData versions
   */
  getSupportedODataVersions(version: SapB1Version): string[] {
    if (version.majorVersion >= 10) {
      return ['4.0', '3.0'];
    }
    if (version.majorVersion === 9 && version.minorVersion >= 3) {
      return ['4.0'];
    }
    return ['3.0'];
  }

  /**
   * Get estimated release year for version
   */
  private getVersionYear(major: number, minor: number): number {
    const versions: Record<string, number> = {
      '9.0': 2014,
      '9.1': 2015,
      '9.2': 2016,
      '9.3': 2017,
      '10.0': 2020,
    };

    return versions[`${major}.${minor}`] || 2019;
  }

  /**
   * Get base URL
   */
  private getBaseUrl(): string {
    const protocol = this.sslEnabled ? 'https' : 'http';
    return `${protocol}://${this.serverUrl}/b1s/v1`;
  }

  /**
   * Check if feature is available
   */
  async isFeatureAvailable(
    feature: keyof SapB1ServerCapabilities['features'],
    sessionId?: string
  ): Promise<boolean> {
    const capabilities = await this.detectCapabilities(sessionId);
    return capabilities?.features[feature] || false;
  }

  /**
   * Get version-specific query hints
   */
  getQueryHints(version: SapB1Version, dbType: 'HANA' | 'MSSQL'): {
    maxBatchSize: number;
    supportsParallelQueries: boolean;
    useHANAOptimizations: boolean;
    dateFormat: string;
  } {
    return {
      maxBatchSize: dbType === 'HANA' ? 1000 : 500,
      supportsParallelQueries: dbType === 'HANA',
      useHANAOptimizations: dbType === 'HANA',
      dateFormat: "yyyy-MM-dd'T'HH:mm:ss",
    };
  }
}

/**
 * Create version detector
 */
export function createSapB1VersionDetector(
  serverUrl: string,
  sslEnabled = true
): SapB1VersionDetector {
  return new SapB1VersionDetector(serverUrl, sslEnabled);
}
