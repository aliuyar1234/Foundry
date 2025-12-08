/**
 * Connector Services Exports
 *
 * Central export point for all connector services.
 */

// Health check service (T007)
export {
  HealthCheckService,
  ConnectorHealth,
  HealthCheckConfig,
  HealthCheckEvent,
  HealthCheckEventHandler,
  getHealthCheckService,
} from './healthCheckService';

// Event ingestion service (T013)
export {
  EventIngestionService,
  ConnectorEvent,
  RateLimitEvent,
  HealthCheckEvent as HealthEvent,
  IngestionConfig,
  ConnectorEventQueries,
  getEventIngestionService,
} from './eventIngestionService';

// Configuration validator (T014)
export {
  ConfigValidatorService,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ConnectorSchema,
  CustomValidator,
  getConfigValidatorService,
} from './configValidator';

// Sync coordinator (T015)
export {
  SyncCoordinator,
  SyncJobConfig,
  SyncJobResult,
  SyncCoordinatorConfig,
  getSyncCoordinator,
} from './syncCoordinator';
