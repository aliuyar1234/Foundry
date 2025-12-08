// =============================================================================
// SSO Services Index
// SCALE Tier - Enterprise SSO
//
// Export all SSO-related services
// =============================================================================

export { SamlService } from './samlService';
export type {
  SamlConfiguration,
  SamlAttributeMapping,
  SamlAssertion,
  SamlAuthRequest,
  SamlAuthResponse,
} from './samlService';

export { OidcService } from './oidcService';
export type {
  OidcConfiguration,
  OidcClaimMapping,
  OidcTokenResponse,
  OidcUserInfo,
  OidcAuthResult,
  AuthorizationState,
} from './oidcService';

export { ScimService } from './scimService';
export type {
  ScimUser,
  ScimGroup,
  ScimListResponse,
  ScimPatchOperation,
  ScimSyncLog,
} from './scimService';

export { RoleMappingService, DEFAULT_ROLES } from './roleMappingService';
export type {
  RoleMapping,
  RoleMappingRule,
  UserRoleAssignment,
  RoleMappingResult,
} from './roleMappingService';

export { DirectorySyncService } from './directorySyncService';
export type {
  DirectorySyncConfig,
  SyncJob,
  SyncStats,
  SyncError,
  SyncDelta,
} from './directorySyncService';
