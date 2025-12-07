-- =============================================================================
-- OPERATE Tier - Workload Metrics Hypertable
-- T013 - Create workload_metrics_ts hypertable
-- =============================================================================

-- Enable TimescaleDB extension if not already enabled
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create workload metrics hypertable
CREATE TABLE IF NOT EXISTS workload_metrics_ts (
    time TIMESTAMPTZ NOT NULL,
    organization_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    person_name TEXT,

    -- Workload metrics
    active_tasks INT DEFAULT 0,
    pending_tasks INT DEFAULT 0,
    completed_tasks_today INT DEFAULT 0,

    -- Communication metrics
    emails_received INT DEFAULT 0,
    emails_sent INT DEFAULT 0,
    messages_received INT DEFAULT 0,
    messages_sent INT DEFAULT 0,
    meetings_attended INT DEFAULT 0,
    meeting_hours NUMERIC(5,2) DEFAULT 0,

    -- Response metrics
    avg_response_time_ms INT,
    median_response_time_ms INT,

    -- Capacity metrics
    workload_score NUMERIC(5,2), -- 0-100 scale
    capacity_remaining NUMERIC(5,2), -- percentage
    burnout_risk_score NUMERIC(5,2), -- 0-100 scale

    -- Context
    department TEXT,
    team TEXT,
    role TEXT
);

-- Convert to hypertable (1 day chunks)
SELECT create_hypertable('workload_metrics_ts', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workload_org_time
    ON workload_metrics_ts (organization_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_workload_person_time
    ON workload_metrics_ts (person_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_workload_burnout_risk
    ON workload_metrics_ts (organization_id, burnout_risk_score DESC, time DESC);

CREATE INDEX IF NOT EXISTS idx_workload_team_time
    ON workload_metrics_ts (organization_id, team, time DESC);

-- Enable compression for older data
ALTER TABLE workload_metrics_ts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'organization_id,person_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy (compress chunks older than 7 days)
SELECT add_compression_policy('workload_metrics_ts', INTERVAL '7 days', if_not_exists => TRUE);

-- Add retention policy (keep 1 year of data)
SELECT add_retention_policy('workload_metrics_ts', INTERVAL '1 year', if_not_exists => TRUE);
