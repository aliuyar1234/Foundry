/**
 * Entity Types for Multi-Tenant Support
 * SCALE Tier - Tasks T018-T020
 */

// =============================================================================
// T018: Entity (Tenant) Types
// =============================================================================

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

/**
 * Entity represents a tenant (company/business unit) in the multi-tenant system
 */
export interface Entity {
  id: string;
  name: string;
  slug: string;
  parentEntityId: string | null;
  configuration: EntityConfiguration;
  status: TenantStatus;
  dataRetentionDays: number;
  resellerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entity creation input
 */
export interface CreateEntityInput {
  name: string;
  slug?: string;
  parentEntityId?: string;
  configuration?: Partial<EntityConfiguration>;
  dataRetentionDays?: number;
  resellerId?: string;
}

/**
 * Entity update input
 */
export interface UpdateEntityInput {
  name?: string;
  configuration?: Partial<EntityConfiguration>;
  status?: TenantStatus;
  dataRetentionDays?: number;
}

// =============================================================================
// T019: EntityConfig Interface
// =============================================================================

/**
 * Entity-specific configuration settings
 */
export interface EntityConfiguration {
  // Branding
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    favicon?: string;
  };

  // Feature flags
  features?: {
    routingEnabled?: boolean;
    assistantEnabled?: boolean;
    commandCenterEnabled?: boolean;
    selfHealingEnabled?: boolean;
    complianceEnabled?: boolean;
    workloadEnabled?: boolean;
    benchmarkingEnabled?: boolean;
  };

  // Integration settings
  integrations?: {
    ssoEnabled?: boolean;
    scimEnabled?: boolean;
    webhooksEnabled?: boolean;
    apiAccessEnabled?: boolean;
  };

  // Limits
  limits?: {
    maxUsers?: number;
    maxDataSources?: number;
    maxStorageGb?: number;
    maxApiCallsPerHour?: number;
  };

  // Localization
  localization?: {
    defaultLanguage?: string;
    timezone?: string;
    dateFormat?: string;
    numberFormat?: string;
  };

  // Security settings
  security?: {
    mfaRequired?: boolean;
    sessionTimeoutMinutes?: number;
    ipAllowlist?: string[];
    passwordPolicy?: {
      minLength?: number;
      requireUppercase?: boolean;
      requireNumbers?: boolean;
      requireSpecialChars?: boolean;
    };
  };
}

// =============================================================================
// T020: EntityHierarchy Types
// =============================================================================

/**
 * Entity with hierarchy information (children)
 */
export interface EntityWithHierarchy extends Entity {
  children: EntityWithHierarchy[];
  childCount: number;
  depth: number;
}

/**
 * Entity hierarchy tree node (simplified for UI)
 */
export interface EntityTreeNode {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  children: EntityTreeNode[];
  isExpanded?: boolean;
}

/**
 * Entity path from root to current entity
 */
export interface EntityPath {
  entityId: string;
  path: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}

/**
 * Cross-entity permission for a user
 */
export interface UserEntityPermission {
  id: string;
  userId: string;
  entityId: string;
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  grantedBy: string;
  grantedAt: Date;
}

/**
 * Input for granting entity permissions
 */
export interface GrantEntityPermissionInput {
  userId: string;
  entityId: string;
  canRead?: boolean;
  canWrite?: boolean;
  canAdmin?: boolean;
}

/**
 * Entity context for current request
 */
export interface EntityContext {
  entityId: string;
  entity: Entity;
  userId: string;
  isSuperAdmin: boolean;
  authorizedEntityIds: string[];
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canAdmin: boolean;
  };
}

/**
 * Entity analytics for cross-entity reporting
 */
export interface EntityAnalytics {
  entityId: string;
  entityName: string;
  metrics: {
    userCount: number;
    dataSourceCount: number;
    processCount: number;
    activeAlertCount: number;
    complianceScore: number;
  };
  trends: {
    userGrowth: number;
    dataSourceGrowth: number;
    processGrowth: number;
  };
  lastActivityAt: Date;
}

/**
 * Cross-entity aggregation result
 */
export interface CrossEntityAggregation {
  totalEntities: number;
  activeEntities: number;
  metrics: {
    totalUsers: number;
    totalDataSources: number;
    totalProcesses: number;
    averageComplianceScore: number;
  };
  byEntity: EntityAnalytics[];
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface ListEntitiesRequest {
  parentEntityId?: string;
  status?: TenantStatus;
  search?: string;
  includeChildren?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListEntitiesResponse {
  entities: Entity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetEntityHierarchyResponse {
  entity: EntityWithHierarchy;
  path: EntityPath;
}

export interface SwitchEntityRequest {
  targetEntityId: string;
}

export interface SwitchEntityResponse {
  success: boolean;
  entity: Entity;
  context: EntityContext;
}
