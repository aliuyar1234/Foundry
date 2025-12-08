-- =============================================================================
-- Licensing & Offline Mode Schema
-- SCALE Tier - Task T191-T195
--
-- Database schema for license management and offline capabilities
-- =============================================================================

-- -----------------------------------------------------------------------------
-- System Configuration Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "SystemConfig_key_idx" ON "SystemConfig"("key");

-- -----------------------------------------------------------------------------
-- AI Cache Table (for offline mode)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AiCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promptHash" TEXT NOT NULL UNIQUE,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "AiCache_promptHash_idx" ON "AiCache"("promptHash");
CREATE INDEX "AiCache_expiresAt_idx" ON "AiCache"("expiresAt");

-- -----------------------------------------------------------------------------
-- Sync Queue Table (for offline mode data sync)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "SyncQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX "SyncQueue_syncedAt_idx" ON "SyncQueue"("syncedAt");
CREATE INDEX "SyncQueue_entityType_entityId_idx" ON "SyncQueue"("entityType", "entityId");
CREATE INDEX "SyncQueue_priority_createdAt_idx" ON "SyncQueue"("priority" DESC, "createdAt" ASC);

-- -----------------------------------------------------------------------------
-- License Audit Log
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "LicenseAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "licenseId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "LicenseAudit_licenseId_idx" ON "LicenseAudit"("licenseId");
CREATE INDEX "LicenseAudit_createdAt_idx" ON "LicenseAudit"("createdAt");

-- -----------------------------------------------------------------------------
-- Usage Metrics Table (for license enforcement)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "UsageMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricType" TEXT NOT NULL,
    "entityId" TEXT,
    "value" BIGINT NOT NULL,
    "period" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB
);

CREATE INDEX "UsageMetrics_metricType_period_idx" ON "UsageMetrics"("metricType", "period");
CREATE INDEX "UsageMetrics_timestamp_idx" ON "UsageMetrics"("timestamp");

-- Add unique constraint for daily aggregates
CREATE UNIQUE INDEX "UsageMetrics_metricType_entityId_period_key"
    ON "UsageMetrics"("metricType", "entityId", "period")
    WHERE "entityId" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Feature Flags Table (dynamic feature control)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FeatureFlag_name_idx" ON "FeatureFlag"("name");

-- -----------------------------------------------------------------------------
-- Insert default system configurations
-- -----------------------------------------------------------------------------

INSERT INTO "SystemConfig" ("id", "key", "value", "description")
VALUES
    (gen_random_uuid()::text, 'offline_mode_enabled', 'true', 'Enable offline mode capabilities'),
    (gen_random_uuid()::text, 'ai_cache_ttl_hours', '720', 'Default TTL for AI cache entries (30 days)'),
    (gen_random_uuid()::text, 'sync_batch_size', '100', 'Number of items to sync per batch'),
    (gen_random_uuid()::text, 'license_check_interval_hours', '24', 'Hours between license validation checks')
ON CONFLICT ("key") DO NOTHING;

-- -----------------------------------------------------------------------------
-- Insert default feature flags
-- -----------------------------------------------------------------------------

INSERT INTO "FeatureFlag" ("id", "name", "enabled", "description")
VALUES
    (gen_random_uuid()::text, 'offline_ai', true, 'Enable offline AI capabilities using local models'),
    (gen_random_uuid()::text, 'data_sync', true, 'Enable data synchronization for offline mode'),
    (gen_random_uuid()::text, 'license_enforcement', true, 'Enforce license limits')
ON CONFLICT ("name") DO NOTHING;
