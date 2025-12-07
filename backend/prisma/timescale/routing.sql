-- =============================================================================
-- OPERATE Tier - Routing Decisions Hypertable
-- T014 - Create routing_decisions_ts hypertable
-- =============================================================================

-- Enable TimescaleDB extension if not already enabled
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create routing decisions hypertable
CREATE TABLE IF NOT EXISTS routing_decisions_ts (
    time TIMESTAMPTZ NOT NULL,
    organization_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,

    -- Request info
    request_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    request_category TEXT,
    urgency_score NUMERIC(5,2),

    -- Routing info
    handler_id TEXT NOT NULL,
    handler_type TEXT NOT NULL, -- 'person', 'team', 'queue'
    rule_id TEXT,
    rule_name TEXT,

    -- Decision quality
    confidence NUMERIC(5,2),
    was_escalated BOOLEAN DEFAULT FALSE,
    was_rerouted BOOLEAN DEFAULT FALSE,

    -- Performance
    routing_time_ms INT,
    response_time_ms INT,

    -- Feedback
    feedback_score INT, -- 1-5
    feedback_category TEXT, -- 'correct', 'wrong_person', 'wrong_priority', etc.

    -- Context
    ai_model_used TEXT,
    fallback_used BOOLEAN DEFAULT FALSE
);

-- Convert to hypertable (1 hour chunks for high-volume data)
SELECT create_hypertable('routing_decisions_ts', 'time',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_routing_org_time
    ON routing_decisions_ts (organization_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_routing_handler_time
    ON routing_decisions_ts (handler_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_routing_rule_time
    ON routing_decisions_ts (rule_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_routing_type_time
    ON routing_decisions_ts (organization_id, request_type, time DESC);

CREATE INDEX IF NOT EXISTS idx_routing_feedback
    ON routing_decisions_ts (organization_id, feedback_score, time DESC)
    WHERE feedback_score IS NOT NULL;

-- Enable compression for older data
ALTER TABLE routing_decisions_ts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'organization_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy (compress chunks older than 1 day)
SELECT add_compression_policy('routing_decisions_ts', INTERVAL '1 day', if_not_exists => TRUE);

-- Add retention policy (keep 90 days of detailed data)
SELECT add_retention_policy('routing_decisions_ts', INTERVAL '90 days', if_not_exists => TRUE);
