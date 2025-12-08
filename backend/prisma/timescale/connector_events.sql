-- =============================================================================
-- Connector Events TimescaleDB Hypertable
-- Task: T012
--
-- Stores high-volume connector sync events for time-series analysis.
-- Uses TimescaleDB for efficient time-based queries and automatic compression.
-- =============================================================================

-- Create the connector_events_ts hypertable
CREATE TABLE IF NOT EXISTS connector_events_ts (
    id              UUID DEFAULT gen_random_uuid() NOT NULL,
    instance_id     TEXT NOT NULL,
    connector_type  TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    event_type      TEXT NOT NULL,           -- 'sync_started', 'item_synced', 'error', 'rate_limited', etc.
    resource_type   TEXT,                     -- 'email', 'calendar_event', 'file', 'contact', etc.
    resource_id     TEXT,                     -- External ID of the synced item
    action          TEXT,                     -- 'created', 'updated', 'deleted'
    status          TEXT DEFAULT 'success',   -- 'success', 'failed', 'skipped'
    error_code      TEXT,
    error_message   TEXT,
    duration_ms     INTEGER,
    batch_id        TEXT,                     -- Group events by sync batch
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, created_at)
);

-- Convert to hypertable with 1-day chunks
SELECT create_hypertable(
    'connector_events_ts',
    'created_at',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_connector_events_instance
    ON connector_events_ts (instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_events_org
    ON connector_events_ts (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_events_type
    ON connector_events_ts (connector_type, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_events_batch
    ON connector_events_ts (batch_id, created_at DESC)
    WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_connector_events_errors
    ON connector_events_ts (instance_id, created_at DESC)
    WHERE status = 'failed';

-- Enable compression for chunks older than 7 days
SELECT add_compression_policy(
    'connector_events_ts',
    compress_after => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Set compression settings
ALTER TABLE connector_events_ts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'instance_id, connector_type',
    timescaledb.compress_orderby = 'created_at DESC'
);

-- Create retention policy (keep 90 days of detailed data)
SELECT add_retention_policy(
    'connector_events_ts',
    drop_after => INTERVAL '90 days',
    if_not_exists => TRUE
);

-- =============================================================================
-- Connector Sync Metrics Continuous Aggregate
-- Pre-aggregated metrics for dashboards and reporting
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS connector_sync_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', created_at) AS bucket,
    instance_id,
    connector_type,
    organization_id,
    event_type,
    resource_type,
    COUNT(*) AS event_count,
    COUNT(*) FILTER (WHERE status = 'success') AS success_count,
    COUNT(*) FILTER (WHERE status = 'failed') AS failure_count,
    COUNT(*) FILTER (WHERE status = 'skipped') AS skipped_count,
    AVG(duration_ms) AS avg_duration_ms,
    MAX(duration_ms) AS max_duration_ms,
    MIN(duration_ms) AS min_duration_ms,
    SUM(duration_ms) AS total_duration_ms
FROM connector_events_ts
GROUP BY
    time_bucket('1 hour', created_at),
    instance_id,
    connector_type,
    organization_id,
    event_type,
    resource_type;

-- Refresh policy for hourly metrics (refresh every 30 minutes)
SELECT add_continuous_aggregate_policy(
    'connector_sync_metrics_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes',
    if_not_exists => TRUE
);

-- Daily rollup for long-term storage
CREATE MATERIALIZED VIEW IF NOT EXISTS connector_sync_metrics_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', created_at) AS bucket,
    instance_id,
    connector_type,
    organization_id,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE status = 'success') AS success_count,
    COUNT(*) FILTER (WHERE status = 'failed') AS failure_count,
    COUNT(DISTINCT resource_id) AS unique_resources,
    COUNT(DISTINCT batch_id) AS sync_batches,
    AVG(duration_ms) AS avg_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_duration_ms
FROM connector_events_ts
GROUP BY
    time_bucket('1 day', created_at),
    instance_id,
    connector_type,
    organization_id;

-- Refresh policy for daily metrics
SELECT add_continuous_aggregate_policy(
    'connector_sync_metrics_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- =============================================================================
-- Rate Limit Tracking Hypertable
-- Tracks rate limit events for analysis and optimization
-- =============================================================================

CREATE TABLE IF NOT EXISTS connector_rate_limits_ts (
    id              UUID DEFAULT gen_random_uuid() NOT NULL,
    instance_id     TEXT NOT NULL,
    connector_type  TEXT NOT NULL,
    endpoint        TEXT,
    window_type     TEXT NOT NULL,           -- 'second', 'minute', 'hour', 'day'
    limit_value     INTEGER NOT NULL,
    consumed        INTEGER NOT NULL,
    remaining       INTEGER NOT NULL,
    reset_at        TIMESTAMPTZ NOT NULL,
    was_limited     BOOLEAN DEFAULT FALSE,
    wait_duration_ms INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, created_at)
);

-- Convert to hypertable
SELECT create_hypertable(
    'connector_rate_limits_ts',
    'created_at',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Index for querying rate limit events
CREATE INDEX IF NOT EXISTS idx_rate_limits_instance
    ON connector_rate_limits_ts (instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limits_limited
    ON connector_rate_limits_ts (instance_id, created_at DESC)
    WHERE was_limited = TRUE;

-- Compression and retention for rate limits
SELECT add_compression_policy(
    'connector_rate_limits_ts',
    compress_after => INTERVAL '3 days',
    if_not_exists => TRUE
);

ALTER TABLE connector_rate_limits_ts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'instance_id, connector_type',
    timescaledb.compress_orderby = 'created_at DESC'
);

SELECT add_retention_policy(
    'connector_rate_limits_ts',
    drop_after => INTERVAL '30 days',
    if_not_exists => TRUE
);

-- =============================================================================
-- Health Check History Hypertable
-- Tracks connector health over time
-- =============================================================================

CREATE TABLE IF NOT EXISTS connector_health_ts (
    id              UUID DEFAULT gen_random_uuid() NOT NULL,
    instance_id     TEXT NOT NULL,
    connector_type  TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    status          TEXT NOT NULL,           -- 'connected', 'degraded', 'disconnected', 'error'
    is_healthy      BOOLEAN NOT NULL,
    latency_ms      INTEGER,
    error_message   TEXT,
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, created_at)
);

-- Convert to hypertable
SELECT create_hypertable(
    'connector_health_ts',
    'created_at',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_health_instance
    ON connector_health_ts (instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_unhealthy
    ON connector_health_ts (organization_id, created_at DESC)
    WHERE is_healthy = FALSE;

-- Compression and retention
SELECT add_compression_policy(
    'connector_health_ts',
    compress_after => INTERVAL '7 days',
    if_not_exists => TRUE
);

ALTER TABLE connector_health_ts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'instance_id, connector_type',
    timescaledb.compress_orderby = 'created_at DESC'
);

SELECT add_retention_policy(
    'connector_health_ts',
    drop_after => INTERVAL '90 days',
    if_not_exists => TRUE
);

-- Uptime calculation view
CREATE MATERIALIZED VIEW IF NOT EXISTS connector_uptime_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', created_at) AS bucket,
    instance_id,
    connector_type,
    organization_id,
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE is_healthy = TRUE) AS healthy_checks,
    (COUNT(*) FILTER (WHERE is_healthy = TRUE)::FLOAT / COUNT(*)::FLOAT * 100) AS uptime_percent,
    AVG(latency_ms) AS avg_latency_ms,
    MAX(latency_ms) AS max_latency_ms
FROM connector_health_ts
GROUP BY
    time_bucket('1 day', created_at),
    instance_id,
    connector_type,
    organization_id;

SELECT add_continuous_aggregate_policy(
    'connector_uptime_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- =============================================================================
-- Helpful Query Functions
-- =============================================================================

-- Function to get sync summary for a connector instance
CREATE OR REPLACE FUNCTION get_connector_sync_summary(
    p_instance_id TEXT,
    p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
    p_end_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    total_events BIGINT,
    success_count BIGINT,
    failure_count BIGINT,
    unique_resources BIGINT,
    avg_duration_ms NUMERIC,
    error_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) AS total_events,
        COUNT(*) FILTER (WHERE status = 'success') AS success_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failure_count,
        COUNT(DISTINCT resource_id) AS unique_resources,
        AVG(duration_ms)::NUMERIC AS avg_duration_ms,
        (COUNT(*) FILTER (WHERE status = 'failed')::NUMERIC / NULLIF(COUNT(*), 0) * 100) AS error_rate
    FROM connector_events_ts
    WHERE instance_id = p_instance_id
      AND created_at >= p_start_time
      AND created_at <= p_end_time;
END;
$$ LANGUAGE plpgsql;

-- Function to get rate limit events for analysis
CREATE OR REPLACE FUNCTION get_rate_limit_analysis(
    p_instance_id TEXT,
    p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
    hour TIMESTAMPTZ,
    total_requests BIGINT,
    limited_requests BIGINT,
    avg_utilization NUMERIC,
    total_wait_time_ms BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        time_bucket('1 hour', created_at) AS hour,
        COUNT(*) AS total_requests,
        COUNT(*) FILTER (WHERE was_limited = TRUE) AS limited_requests,
        AVG(consumed::NUMERIC / NULLIF(limit_value, 0) * 100) AS avg_utilization,
        SUM(wait_duration_ms) AS total_wait_time_ms
    FROM connector_rate_limits_ts
    WHERE instance_id = p_instance_id
      AND created_at >= NOW() - make_interval(hours => p_hours)
    GROUP BY time_bucket('1 hour', created_at)
    ORDER BY hour DESC;
END;
$$ LANGUAGE plpgsql;
