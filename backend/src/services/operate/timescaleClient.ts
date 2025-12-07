/**
 * TimescaleDB Client for OPERATE Tier
 * T027 - Create TimescaleDB query helpers
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../../lib/logger.js';

// Singleton pool instance
let pool: Pool | null = null;

/**
 * Get TimescaleDB pool instance
 */
export function getTimescalePool(): Pool {
  if (!pool) {
    const connectionString = process.env.TIMESCALE_URL || process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('TIMESCALE_URL or DATABASE_URL environment variable is required');
    }

    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      logger.error({ error: err }, 'TimescaleDB pool error');
    });

    logger.info('TimescaleDB pool initialized');
  }

  return pool;
}

/**
 * Execute a query
 */
export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getTimescalePool();
  const start = Date.now();

  try {
    const result = await pool.query<T>(sql, params);
    const duration = Date.now() - start;

    logger.debug({ sql: sql.slice(0, 100), duration, rowCount: result.rowCount }, 'TimescaleDB query executed');

    return result;
  } catch (error) {
    logger.error({ error, sql: sql.slice(0, 200) }, 'TimescaleDB query failed');
    throw error;
  }
}

/**
 * Execute a query with a dedicated client (for transactions)
 */
export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getTimescalePool();
  const client = await pool.connect();

  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

// =============================================================================
// Workload Metrics Helpers
// =============================================================================

export interface WorkloadMetricRow {
  time: Date;
  organization_id: string;
  person_id: string;
  person_name: string | null;
  active_tasks: number;
  pending_tasks: number;
  completed_tasks_today: number;
  emails_received: number;
  emails_sent: number;
  messages_received: number;
  messages_sent: number;
  meetings_attended: number;
  meeting_hours: number;
  avg_response_time_ms: number | null;
  median_response_time_ms: number | null;
  workload_score: number | null;
  capacity_remaining: number | null;
  burnout_risk_score: number | null;
  department: string | null;
  team: string | null;
  role: string | null;
}

/**
 * Insert workload metrics
 */
export async function insertWorkloadMetrics(metrics: WorkloadMetricRow[]): Promise<void> {
  if (metrics.length === 0) return;

  const sql = `
    INSERT INTO workload_metrics_ts (
      time, organization_id, person_id, person_name,
      active_tasks, pending_tasks, completed_tasks_today,
      emails_received, emails_sent, messages_received, messages_sent,
      meetings_attended, meeting_hours,
      avg_response_time_ms, median_response_time_ms,
      workload_score, capacity_remaining, burnout_risk_score,
      department, team, role
    ) VALUES ${metrics.map((_, i) => {
      const offset = i * 21;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21})`;
    }).join(', ')}
  `;

  const params = metrics.flatMap(m => [
    m.time, m.organization_id, m.person_id, m.person_name,
    m.active_tasks, m.pending_tasks, m.completed_tasks_today,
    m.emails_received, m.emails_sent, m.messages_received, m.messages_sent,
    m.meetings_attended, m.meeting_hours,
    m.avg_response_time_ms, m.median_response_time_ms,
    m.workload_score, m.capacity_remaining, m.burnout_risk_score,
    m.department, m.team, m.role,
  ]);

  await query(sql, params);
}

/**
 * Get workload metrics for a person over time
 */
export async function getWorkloadMetrics(
  organizationId: string,
  personId: string,
  startTime: Date,
  endTime: Date
): Promise<WorkloadMetricRow[]> {
  const result = await query<WorkloadMetricRow>(`
    SELECT * FROM workload_metrics_ts
    WHERE organization_id = $1
      AND person_id = $2
      AND time >= $3
      AND time <= $4
    ORDER BY time DESC
  `, [organizationId, personId, startTime, endTime]);

  return result.rows;
}

/**
 * Get daily workload summary for a team
 */
export async function getTeamWorkloadDaily(
  organizationId: string,
  team: string,
  startDate: Date,
  endDate: Date
): Promise<unknown[]> {
  const result = await query(`
    SELECT
      day,
      COUNT(DISTINCT person_id) as team_size,
      AVG(avg_workload_score) as avg_workload,
      MAX(peak_workload_score) as peak_workload,
      AVG(avg_burnout_risk) as avg_burnout_risk,
      COUNT(DISTINCT person_id) FILTER (WHERE peak_burnout_risk > 70) as high_risk_count
    FROM workload_daily
    WHERE organization_id = $1
      AND team = $2
      AND day >= $3
      AND day <= $4
    GROUP BY day
    ORDER BY day DESC
  `, [organizationId, team, startDate, endDate]);

  return result.rows;
}

// =============================================================================
// Routing Decision Helpers
// =============================================================================

export interface RoutingDecisionRow {
  time: Date;
  organization_id: string;
  decision_id: string;
  request_id?: string;
  request_type: string;
  request_category?: string | null;
  urgency_score?: number | null;
  handler_id: string;
  handler_type: string;
  rule_id?: string | null;
  rule_name?: string | null;
  confidence_score?: number | null;
  was_escalated: boolean;
  was_rerouted?: boolean;
  processing_time_ms?: number | null;
  routing_time_ms?: number | null;
  response_time_ms?: number | null;
  feedback_score?: number | null;
  feedback_category?: string | null;
  ai_model_used?: string | null;
  fallback_used?: boolean;
  was_successful?: boolean;
}

/**
 * Insert routing decision
 */
export async function insertRoutingDecision(decision: RoutingDecisionRow): Promise<void> {
  await query(`
    INSERT INTO routing_decisions_ts (
      time, organization_id, decision_id,
      request_id, request_type, request_category, urgency_score,
      handler_id, handler_type, rule_id, rule_name,
      confidence, was_escalated, was_rerouted,
      routing_time_ms, response_time_ms,
      feedback_score, feedback_category,
      ai_model_used, fallback_used
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
  `, [
    decision.time, decision.organization_id, decision.decision_id,
    decision.request_id || decision.decision_id, decision.request_type,
    decision.request_category, decision.urgency_score,
    decision.handler_id, decision.handler_type, decision.rule_id, decision.rule_name,
    decision.confidence_score, decision.was_escalated, decision.was_rerouted || false,
    decision.processing_time_ms || decision.routing_time_ms, decision.response_time_ms,
    decision.feedback_score, decision.feedback_category,
    decision.ai_model_used, decision.fallback_used || false,
  ]);
}

/**
 * Get routing volume over time
 */
export async function getRoutingVolume(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  interval: 'hour' | 'day' | 'week' = 'day'
): Promise<unknown[]> {
  const bucketSize = interval === 'hour' ? '1 hour' : interval === 'day' ? '1 day' : '1 week';

  const result = await query(`
    SELECT
      time_bucket('${bucketSize}', time) as bucket,
      COUNT(*) as count
    FROM routing_decisions_ts
    WHERE organization_id = $1
      AND time >= $2
      AND time <= $3
    GROUP BY time_bucket('${bucketSize}', time)
    ORDER BY bucket ASC
  `, [organizationId, startTime, endTime]);

  return result.rows;
}

/**
 * Get routing accuracy metrics
 */
export async function getRoutingAccuracy(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  groupBy: 'hour' | 'day' = 'hour'
): Promise<unknown[]> {
  const bucket = groupBy === 'hour' ? '1 hour' : '1 day';

  const result = await query(`
    SELECT
      time_bucket('${bucket}', time) as period,
      COUNT(*) as total_decisions,
      AVG(confidence) as avg_confidence,
      COUNT(*) FILTER (WHERE was_escalated) as escalations,
      COUNT(*) FILTER (WHERE was_rerouted) as reroutes,
      AVG(feedback_score) as avg_feedback,
      COUNT(*) FILTER (WHERE feedback_score >= 4) * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE feedback_score IS NOT NULL), 0) as accuracy_pct
    FROM routing_decisions_ts
    WHERE organization_id = $1
      AND time >= $2
      AND time <= $3
    GROUP BY time_bucket('${bucket}', time)
    ORDER BY period DESC
  `, [organizationId, startTime, endTime]);

  return result.rows;
}

/**
 * Get routing metrics by handler
 */
export async function getRoutingByHandler(
  organizationId: string,
  startTime: Date,
  endTime: Date
): Promise<unknown[]> {
  const result = await query(`
    SELECT
      handler_id,
      handler_type,
      COUNT(*) as total_received,
      AVG(confidence) as avg_confidence,
      AVG(response_time_ms) as avg_response_time,
      AVG(feedback_score) as avg_feedback
    FROM routing_decisions_ts
    WHERE organization_id = $1
      AND time >= $2
      AND time <= $3
    GROUP BY handler_id, handler_type
    ORDER BY total_received DESC
  `, [organizationId, startTime, endTime]);

  return result.rows;
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Check TimescaleDB connection health
 */
export async function checkTimescaleHealth(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as test');
    return result.rows[0]?.test === 1;
  } catch (error) {
    logger.error({ error }, 'TimescaleDB health check failed');
    return false;
  }
}

/**
 * Close the pool
 */
export async function closeTimescalePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('TimescaleDB pool closed');
  }
}

export default {
  getTimescalePool,
  query,
  withClient,
  transaction,
  insertWorkloadMetrics,
  getWorkloadMetrics,
  getTeamWorkloadDaily,
  insertRoutingDecision,
  getRoutingVolume,
  getRoutingAccuracy,
  getRoutingByHandler,
  checkTimescaleHealth,
  closeTimescalePool,
};
