-- =============================================================================
-- OPERATE Tier - Continuous Aggregates
-- T015 - Create workload_daily continuous aggregate
-- T016 - Create routing_success_hourly continuous aggregate
-- =============================================================================

-- =============================================================================
-- T015: Workload Daily Aggregate
-- =============================================================================

-- Daily workload summary per person
CREATE MATERIALIZED VIEW IF NOT EXISTS workload_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS day,
    organization_id,
    person_id,
    MAX(person_name) AS person_name,
    MAX(department) AS department,
    MAX(team) AS team,

    -- Daily task metrics
    MAX(active_tasks) AS max_active_tasks,
    AVG(active_tasks)::NUMERIC(5,2) AS avg_active_tasks,
    SUM(completed_tasks_today) AS total_completed_tasks,

    -- Daily communication metrics
    SUM(emails_received) AS total_emails_received,
    SUM(emails_sent) AS total_emails_sent,
    SUM(messages_received) AS total_messages_received,
    SUM(messages_sent) AS total_messages_sent,
    SUM(meetings_attended) AS total_meetings,
    SUM(meeting_hours)::NUMERIC(5,2) AS total_meeting_hours,

    -- Daily response metrics
    AVG(avg_response_time_ms)::INT AS avg_response_time_ms,

    -- Daily capacity metrics
    AVG(workload_score)::NUMERIC(5,2) AS avg_workload_score,
    MAX(workload_score)::NUMERIC(5,2) AS peak_workload_score,
    AVG(burnout_risk_score)::NUMERIC(5,2) AS avg_burnout_risk,
    MAX(burnout_risk_score)::NUMERIC(5,2) AS peak_burnout_risk,

    -- Sample count
    COUNT(*) AS sample_count
FROM workload_metrics_ts
GROUP BY time_bucket('1 day', time), organization_id, person_id
WITH NO DATA;

-- Refresh policy: refresh every hour, with 1 day lag
SELECT add_continuous_aggregate_policy('workload_daily',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Create indexes on the aggregate
CREATE INDEX IF NOT EXISTS idx_workload_daily_org
    ON workload_daily (organization_id, day DESC);

CREATE INDEX IF NOT EXISTS idx_workload_daily_person
    ON workload_daily (person_id, day DESC);

CREATE INDEX IF NOT EXISTS idx_workload_daily_burnout
    ON workload_daily (organization_id, peak_burnout_risk DESC, day DESC);


-- =============================================================================
-- T016: Routing Success Hourly Aggregate
-- =============================================================================

-- Hourly routing analytics summary
CREATE MATERIALIZED VIEW IF NOT EXISTS routing_success_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    organization_id,
    request_type,

    -- Volume metrics
    COUNT(*) AS total_decisions,
    COUNT(DISTINCT request_id) AS unique_requests,
    COUNT(DISTINCT handler_id) AS unique_handlers,

    -- Quality metrics
    AVG(confidence)::NUMERIC(5,2) AS avg_confidence,
    COUNT(*) FILTER (WHERE confidence >= 0.9) AS high_confidence_count,
    COUNT(*) FILTER (WHERE confidence < 0.7) AS low_confidence_count,

    -- Escalation/reroute metrics
    COUNT(*) FILTER (WHERE was_escalated) AS escalation_count,
    COUNT(*) FILTER (WHERE was_rerouted) AS reroute_count,
    COUNT(*) FILTER (WHERE fallback_used) AS fallback_count,

    -- Performance metrics
    AVG(routing_time_ms)::INT AS avg_routing_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY routing_time_ms)::INT AS p95_routing_time_ms,
    AVG(response_time_ms)::INT AS avg_response_time_ms,

    -- Feedback metrics (only where feedback exists)
    AVG(feedback_score)::NUMERIC(5,2) AS avg_feedback_score,
    COUNT(*) FILTER (WHERE feedback_score IS NOT NULL) AS feedback_count,
    COUNT(*) FILTER (WHERE feedback_score >= 4) AS positive_feedback_count,
    COUNT(*) FILTER (WHERE feedback_score <= 2) AS negative_feedback_count,

    -- Accuracy calculation
    (COUNT(*) FILTER (WHERE feedback_score >= 4) * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE feedback_score IS NOT NULL), 0))::NUMERIC(5,2) AS accuracy_percent
FROM routing_decisions_ts
GROUP BY time_bucket('1 hour', time), organization_id, request_type
WITH NO DATA;

-- Refresh policy: refresh every 15 minutes
SELECT add_continuous_aggregate_policy('routing_success_hourly',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '15 minutes',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists => TRUE
);

-- Create indexes on the aggregate
CREATE INDEX IF NOT EXISTS idx_routing_hourly_org
    ON routing_success_hourly (organization_id, hour DESC);

CREATE INDEX IF NOT EXISTS idx_routing_hourly_type
    ON routing_success_hourly (organization_id, request_type, hour DESC);

CREATE INDEX IF NOT EXISTS idx_routing_hourly_accuracy
    ON routing_success_hourly (organization_id, accuracy_percent DESC, hour DESC);


-- =============================================================================
-- Team Workload Weekly Aggregate (bonus for team-level insights)
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS team_workload_weekly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 week', time) AS week,
    organization_id,
    team,
    department,

    -- Team size
    COUNT(DISTINCT person_id) AS team_size,

    -- Aggregate metrics
    AVG(workload_score)::NUMERIC(5,2) AS avg_team_workload,
    MAX(workload_score)::NUMERIC(5,2) AS max_team_workload,

    -- Burnout risk
    AVG(burnout_risk_score)::NUMERIC(5,2) AS avg_burnout_risk,
    COUNT(DISTINCT person_id) FILTER (WHERE burnout_risk_score > 70) AS high_risk_members,

    -- Communication volume
    SUM(emails_sent + emails_received)::BIGINT AS total_email_volume,
    SUM(messages_sent + messages_received)::BIGINT AS total_message_volume,
    SUM(meeting_hours)::NUMERIC(8,2) AS total_meeting_hours,

    -- Productivity
    SUM(completed_tasks_today)::BIGINT AS total_completed_tasks
FROM workload_metrics_ts
WHERE team IS NOT NULL
GROUP BY time_bucket('1 week', time), organization_id, team, department
WITH NO DATA;

-- Refresh policy: refresh daily
SELECT add_continuous_aggregate_policy('team_workload_weekly',
    start_offset => INTERVAL '4 weeks',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_team_weekly_org
    ON team_workload_weekly (organization_id, week DESC);
