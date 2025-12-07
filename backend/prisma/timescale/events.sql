-- =============================================================================
-- Enterprise AI Foundation Platform - TimescaleDB Events Schema
-- =============================================================================
-- This schema is for the TimescaleDB instance (separate from main PostgreSQL)
-- Run against TIMESCALE_URL connection

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- -----------------------------------------------------------------------------
-- Events Hypertable
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  metadata JSONB DEFAULT '{}',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable partitioned by timestamp
SELECT create_hypertable('events', 'timestamp', if_not_exists => TRUE);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_events_org_time
  ON events (organization_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_actor
  ON events (actor_id, timestamp DESC)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_type
  ON events (event_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_source
  ON events (source_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_target
  ON events (target_id, timestamp DESC)
  WHERE target_id IS NOT NULL;

-- GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_events_metadata
  ON events USING GIN (metadata);

-- -----------------------------------------------------------------------------
-- Continuous Aggregates
-- -----------------------------------------------------------------------------

-- Daily communication summary per person
CREATE MATERIALIZED VIEW IF NOT EXISTS person_daily_activity
WITH (timescaledb.continuous) AS
SELECT
  organization_id,
  actor_id,
  time_bucket('1 day', timestamp) AS bucket,
  COUNT(*) FILTER (WHERE event_type = 'email_sent') AS emails_sent,
  COUNT(*) FILTER (WHERE event_type = 'email_received') AS emails_received,
  COUNT(*) FILTER (WHERE event_type = 'meeting_attended') AS meetings,
  COUNT(*) FILTER (WHERE event_type LIKE 'document_%') AS document_actions,
  COUNT(*) AS total_events
FROM events
WHERE actor_id IS NOT NULL
GROUP BY organization_id, actor_id, bucket
WITH NO DATA;

-- Hourly activity patterns (for burnout detection)
CREATE MATERIALIZED VIEW IF NOT EXISTS activity_by_hour
WITH (timescaledb.continuous) AS
SELECT
  organization_id,
  actor_id,
  EXTRACT(HOUR FROM timestamp) AS hour_of_day,
  EXTRACT(DOW FROM timestamp) AS day_of_week,
  time_bucket('1 week', timestamp) AS week_bucket,
  COUNT(*) AS event_count
FROM events
WHERE actor_id IS NOT NULL
GROUP BY organization_id, actor_id, hour_of_day, day_of_week, week_bucket
WITH NO DATA;

-- Process flow aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS process_flow_daily
WITH (timescaledb.continuous) AS
SELECT
  organization_id,
  event_type,
  time_bucket('1 day', timestamp) AS bucket,
  COUNT(*) AS event_count,
  COUNT(DISTINCT actor_id) AS unique_actors,
  AVG(EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (
    PARTITION BY organization_id, actor_id
    ORDER BY timestamp
  )))) AS avg_time_since_prev_secs
FROM events
GROUP BY organization_id, event_type, bucket
WITH NO DATA;

-- -----------------------------------------------------------------------------
-- Refresh Policies for Continuous Aggregates
-- -----------------------------------------------------------------------------

SELECT add_continuous_aggregate_policy('person_daily_activity',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('activity_by_hour',
  start_offset => INTERVAL '1 week',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('process_flow_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

-- -----------------------------------------------------------------------------
-- Data Retention Policy
-- -----------------------------------------------------------------------------

-- Retain raw events for 12 months by default
SELECT add_retention_policy('events', INTERVAL '12 months', if_not_exists => TRUE);

-- -----------------------------------------------------------------------------
-- Helper Functions
-- -----------------------------------------------------------------------------

-- Function to get communication patterns between two people
CREATE OR REPLACE FUNCTION get_communication_pattern(
  p_org_id TEXT,
  p_actor_id TEXT,
  p_target_id TEXT,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  day DATE,
  emails_sent BIGINT,
  emails_received BIGINT,
  meetings BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(timestamp) as day,
    COUNT(*) FILTER (WHERE event_type = 'email_sent' AND target_id = p_target_id) AS emails_sent,
    COUNT(*) FILTER (WHERE event_type = 'email_received' AND metadata->>'from' = p_target_id) AS emails_received,
    COUNT(*) FILTER (WHERE event_type = 'meeting_attended' AND metadata->'attendees' ? p_target_id) AS meetings
  FROM events
  WHERE organization_id = p_org_id
    AND actor_id = p_actor_id
    AND timestamp BETWEEN p_start_date AND p_end_date
  GROUP BY DATE(timestamp)
  ORDER BY day;
END;
$$ LANGUAGE plpgsql;
