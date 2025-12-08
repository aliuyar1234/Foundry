/**
 * Selective Sync Configuration
 * Task: T177
 *
 * Manages selective folder/cabinet sync configuration
 * - Include/exclude patterns
 * - Sync scope management
 * - Pattern matching for DMS systems
 */

export interface SelectiveSyncPattern {
  type: 'include' | 'exclude';
  pattern: string;
  matchType: 'exact' | 'prefix' | 'suffix' | 'contains' | 'regex';
}

export interface SelectiveSyncConfig {
  // Docuware-specific
  cabinets?: {
    include?: string[];
    exclude?: string[];
    patterns?: SelectiveSyncPattern[];
  };
  documentTypes?: {
    include?: string[];
    exclude?: string[];
  };

  // M-Files-specific
  vaults?: {
    include?: string[];
    exclude?: string[];
    patterns?: SelectiveSyncPattern[];
  };
  objectTypes?: {
    include?: number[];
    exclude?: number[];
  };
  classes?: {
    include?: number[];
    exclude?: number[];
  };

  // Common filters
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  fileSizeLimit?: {
    min?: number;
    max?: number;
  };
  fileExtensions?: {
    include?: string[];
    exclude?: string[];
  };

  // Advanced filters
  properties?: Record<string, unknown>;
  customFilters?: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan';
    value: unknown;
  }>;
}

export interface SyncScope {
  isIncluded: boolean;
  reason?: string;
  appliedRules?: string[];
}

/**
 * Selective Sync Manager
 */
export class SelectiveSyncManager {
  constructor(private config: SelectiveSyncConfig) {}

  /**
   * Check if a Docuware cabinet should be synced
   */
  shouldSyncCabinet(cabinetId: string, cabinetName?: string): SyncScope {
    const appliedRules: string[] = [];

    // Check explicit includes
    if (this.config.cabinets?.include && this.config.cabinets.include.length > 0) {
      const isIncluded = this.config.cabinets.include.includes(cabinetId);
      appliedRules.push(`include_list`);

      if (!isIncluded) {
        return {
          isIncluded: false,
          reason: 'Cabinet not in include list',
          appliedRules,
        };
      }
    }

    // Check explicit excludes
    if (this.config.cabinets?.exclude && this.config.cabinets.exclude.includes(cabinetId)) {
      appliedRules.push(`exclude_list`);
      return {
        isIncluded: false,
        reason: 'Cabinet in exclude list',
        appliedRules,
      };
    }

    // Check patterns
    if (this.config.cabinets?.patterns && cabinetName) {
      for (const pattern of this.config.cabinets.patterns) {
        const matches = this.matchesPattern(cabinetName, pattern);

        if (matches) {
          appliedRules.push(`pattern_${pattern.type}`);

          if (pattern.type === 'exclude') {
            return {
              isIncluded: false,
              reason: `Cabinet name matches exclude pattern: ${pattern.pattern}`,
              appliedRules,
            };
          }
        }
      }
    }

    return {
      isIncluded: true,
      appliedRules,
    };
  }

  /**
   * Check if a Docuware document type should be synced
   */
  shouldSyncDocumentType(documentType: string): SyncScope {
    const appliedRules: string[] = [];

    // Check explicit includes
    if (this.config.documentTypes?.include && this.config.documentTypes.include.length > 0) {
      const isIncluded = this.config.documentTypes.include.includes(documentType);
      appliedRules.push(`document_type_include`);

      if (!isIncluded) {
        return {
          isIncluded: false,
          reason: 'Document type not in include list',
          appliedRules,
        };
      }
    }

    // Check explicit excludes
    if (this.config.documentTypes?.exclude && this.config.documentTypes.exclude.includes(documentType)) {
      appliedRules.push(`document_type_exclude`);
      return {
        isIncluded: false,
        reason: 'Document type in exclude list',
        appliedRules,
      };
    }

    return {
      isIncluded: true,
      appliedRules,
    };
  }

  /**
   * Check if an M-Files vault should be synced
   */
  shouldSyncVault(vaultGuid: string, vaultName?: string): SyncScope {
    const appliedRules: string[] = [];

    // Check explicit includes
    if (this.config.vaults?.include && this.config.vaults.include.length > 0) {
      const isIncluded = this.config.vaults.include.includes(vaultGuid);
      appliedRules.push(`include_list`);

      if (!isIncluded) {
        return {
          isIncluded: false,
          reason: 'Vault not in include list',
          appliedRules,
        };
      }
    }

    // Check explicit excludes
    if (this.config.vaults?.exclude && this.config.vaults.exclude.includes(vaultGuid)) {
      appliedRules.push(`exclude_list`);
      return {
        isIncluded: false,
        reason: 'Vault in exclude list',
        appliedRules,
      };
    }

    // Check patterns
    if (this.config.vaults?.patterns && vaultName) {
      for (const pattern of this.config.vaults.patterns) {
        const matches = this.matchesPattern(vaultName, pattern);

        if (matches) {
          appliedRules.push(`pattern_${pattern.type}`);

          if (pattern.type === 'exclude') {
            return {
              isIncluded: false,
              reason: `Vault name matches exclude pattern: ${pattern.pattern}`,
              appliedRules,
            };
          }
        }
      }
    }

    return {
      isIncluded: true,
      appliedRules,
    };
  }

  /**
   * Check if an M-Files object type should be synced
   */
  shouldSyncObjectType(objectTypeId: number): SyncScope {
    const appliedRules: string[] = [];

    // Check explicit includes
    if (this.config.objectTypes?.include && this.config.objectTypes.include.length > 0) {
      const isIncluded = this.config.objectTypes.include.includes(objectTypeId);
      appliedRules.push(`object_type_include`);

      if (!isIncluded) {
        return {
          isIncluded: false,
          reason: 'Object type not in include list',
          appliedRules,
        };
      }
    }

    // Check explicit excludes
    if (this.config.objectTypes?.exclude && this.config.objectTypes.exclude.includes(objectTypeId)) {
      appliedRules.push(`object_type_exclude`);
      return {
        isIncluded: false,
        reason: 'Object type in exclude list',
        appliedRules,
      };
    }

    return {
      isIncluded: true,
      appliedRules,
    };
  }

  /**
   * Check if an M-Files class should be synced
   */
  shouldSyncClass(classId: number): SyncScope {
    const appliedRules: string[] = [];

    // Check explicit includes
    if (this.config.classes?.include && this.config.classes.include.length > 0) {
      const isIncluded = this.config.classes.include.includes(classId);
      appliedRules.push(`class_include`);

      if (!isIncluded) {
        return {
          isIncluded: false,
          reason: 'Class not in include list',
          appliedRules,
        };
      }
    }

    // Check explicit excludes
    if (this.config.classes?.exclude && this.config.classes.exclude.includes(classId)) {
      appliedRules.push(`class_exclude`);
      return {
        isIncluded: false,
        reason: 'Class in exclude list',
        appliedRules,
      };
    }

    return {
      isIncluded: true,
      appliedRules,
    };
  }

  /**
   * Check if a document should be synced based on common filters
   */
  shouldSyncDocument(document: {
    date?: Date;
    fileSize?: number;
    fileExtension?: string;
    properties?: Record<string, unknown>;
  }): SyncScope {
    const appliedRules: string[] = [];

    // Check date range
    if (this.config.dateRange) {
      if (document.date) {
        if (this.config.dateRange.from && document.date < this.config.dateRange.from) {
          appliedRules.push(`date_range_from`);
          return {
            isIncluded: false,
            reason: 'Document date is before date range',
            appliedRules,
          };
        }
        if (this.config.dateRange.to && document.date > this.config.dateRange.to) {
          appliedRules.push(`date_range_to`);
          return {
            isIncluded: false,
            reason: 'Document date is after date range',
            appliedRules,
          };
        }
      }
    }

    // Check file size
    if (this.config.fileSizeLimit && document.fileSize !== undefined) {
      if (this.config.fileSizeLimit.min && document.fileSize < this.config.fileSizeLimit.min) {
        appliedRules.push(`file_size_min`);
        return {
          isIncluded: false,
          reason: 'File size below minimum',
          appliedRules,
        };
      }
      if (this.config.fileSizeLimit.max && document.fileSize > this.config.fileSizeLimit.max) {
        appliedRules.push(`file_size_max`);
        return {
          isIncluded: false,
          reason: 'File size above maximum',
          appliedRules,
        };
      }
    }

    // Check file extensions
    if (this.config.fileExtensions && document.fileExtension) {
      const extension = document.fileExtension.toLowerCase();

      if (this.config.fileExtensions.include && this.config.fileExtensions.include.length > 0) {
        const isIncluded = this.config.fileExtensions.include
          .map(ext => ext.toLowerCase())
          .includes(extension);
        appliedRules.push(`extension_include`);

        if (!isIncluded) {
          return {
            isIncluded: false,
            reason: 'File extension not in include list',
            appliedRules,
          };
        }
      }

      if (this.config.fileExtensions.exclude &&
          this.config.fileExtensions.exclude.map(ext => ext.toLowerCase()).includes(extension)) {
        appliedRules.push(`extension_exclude`);
        return {
          isIncluded: false,
          reason: 'File extension in exclude list',
          appliedRules,
        };
      }
    }

    // Check custom filters
    if (this.config.customFilters && document.properties) {
      for (const filter of this.config.customFilters) {
        const propValue = document.properties[filter.field];

        if (!this.evaluateFilter(propValue, filter.operator, filter.value)) {
          appliedRules.push(`custom_filter_${filter.field}`);
          return {
            isIncluded: false,
            reason: `Custom filter failed: ${filter.field} ${filter.operator} ${filter.value}`,
            appliedRules,
          };
        }
      }
    }

    return {
      isIncluded: true,
      appliedRules,
    };
  }

  /**
   * Match a value against a pattern
   */
  private matchesPattern(value: string, pattern: SelectiveSyncPattern): boolean {
    switch (pattern.matchType) {
      case 'exact':
        return value === pattern.pattern;

      case 'prefix':
        return value.startsWith(pattern.pattern);

      case 'suffix':
        return value.endsWith(pattern.pattern);

      case 'contains':
        return value.includes(pattern.pattern);

      case 'regex':
        try {
          const regex = new RegExp(pattern.pattern);
          return regex.test(value);
        } catch {
          console.warn(`Invalid regex pattern: ${pattern.pattern}`);
          return false;
        }

      default:
        return false;
    }
  }

  /**
   * Evaluate a custom filter
   */
  private evaluateFilter(
    value: unknown,
    operator: string,
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return value === expected;

      case 'contains':
        return typeof value === 'string' && typeof expected === 'string' &&
               value.includes(expected);

      case 'startsWith':
        return typeof value === 'string' && typeof expected === 'string' &&
               value.startsWith(expected);

      case 'endsWith':
        return typeof value === 'string' && typeof expected === 'string' &&
               value.endsWith(expected);

      case 'greaterThan':
        return typeof value === 'number' && typeof expected === 'number' &&
               value > expected;

      case 'lessThan':
        return typeof value === 'number' && typeof expected === 'number' &&
               value < expected;

      default:
        return true;
    }
  }

  /**
   * Get configuration summary
   */
  getSummary(): {
    hasFilters: boolean;
    filterCount: number;
    filters: string[];
  } {
    const filters: string[] = [];

    if (this.config.cabinets?.include?.length) {
      filters.push(`${this.config.cabinets.include.length} cabinets included`);
    }
    if (this.config.cabinets?.exclude?.length) {
      filters.push(`${this.config.cabinets.exclude.length} cabinets excluded`);
    }
    if (this.config.vaults?.include?.length) {
      filters.push(`${this.config.vaults.include.length} vaults included`);
    }
    if (this.config.vaults?.exclude?.length) {
      filters.push(`${this.config.vaults.exclude.length} vaults excluded`);
    }
    if (this.config.dateRange) {
      filters.push('Date range filter');
    }
    if (this.config.fileSizeLimit) {
      filters.push('File size filter');
    }
    if (this.config.fileExtensions?.include?.length || this.config.fileExtensions?.exclude?.length) {
      filters.push('File extension filter');
    }
    if (this.config.customFilters?.length) {
      filters.push(`${this.config.customFilters.length} custom filters`);
    }

    return {
      hasFilters: filters.length > 0,
      filterCount: filters.length,
      filters,
    };
  }
}

/**
 * Create selective sync manager
 */
export function createSelectiveSyncManager(config: SelectiveSyncConfig): SelectiveSyncManager {
  return new SelectiveSyncManager(config);
}

/**
 * Parse selective sync config from data source config
 */
export function parseSelectiveSyncConfig(config: Record<string, unknown>): SelectiveSyncConfig {
  return {
    cabinets: config.cabinets as SelectiveSyncConfig['cabinets'],
    documentTypes: config.documentTypes as SelectiveSyncConfig['documentTypes'],
    vaults: config.vaults as SelectiveSyncConfig['vaults'],
    objectTypes: config.objectTypes as SelectiveSyncConfig['objectTypes'],
    classes: config.classes as SelectiveSyncConfig['classes'],
    dateRange: config.dateRange as SelectiveSyncConfig['dateRange'],
    fileSizeLimit: config.fileSizeLimit as SelectiveSyncConfig['fileSizeLimit'],
    fileExtensions: config.fileExtensions as SelectiveSyncConfig['fileExtensions'],
    properties: config.properties as SelectiveSyncConfig['properties'],
    customFilters: config.customFilters as SelectiveSyncConfig['customFilters'],
  };
}
