/**
 * Base Connector Exports
 *
 * Central export point for all base connector functionality.
 */

// Core connector interfaces and base class
export {
  BaseConnector,
  ConnectorConfig,
  AuthResult,
  SyncResult,
  SyncProgress,
  SyncProgressCallback,
  ExtractedEvent,
  SyncOptions,
  ConnectorCapabilities,
  ConnectorMetadata,
  // New exports from T001
  RateLimitCallbacks,
  ExtendedConnectorConfig,
  HealthCheckResult,
  SyncCheckpoint,
  IDataConnector,
} from './connector';

// OAuth connector base class (T002)
export {
  BaseOAuthConnector,
  OAuthConfig,
  OAuthConnectorOptions,
} from './baseOAuthConnector';

// API Key connector base class (T003)
export {
  BaseAPIKeyConnector,
  BaseSessionConnector,
  APIKeyConfig,
  APIKeyConnectorOptions,
} from './baseAPIKeyConnector';

// Rate limiter (T004)
export {
  RateLimiter,
  RateLimitConfig,
  RateLimitState,
  RateLimitError,
  createConnectorRateLimiter,
  createMultiWindowRateLimiter,
} from './rateLimiter';

// OAuth token manager (T005)
export {
  OAuthTokenManager,
  OAuthStateManager,
  OAuthTokens,
  TokenRefreshResult,
  TokenRefreshCallback,
  getOAuthTokenManager,
} from './oauthTokenManager';
