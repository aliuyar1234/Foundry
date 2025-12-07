/**
 * TimescaleDB Event Writer
 * Handles batch inserts and queries for the events hypertable
 */

import { Pool, PoolClient } from 'pg';
import { ExtractedEvent } from '../../connectors/base/connector.js';

export interface WriteResult {
  written: number;
  errors: string[];
}

export interface EventStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsPerDay: Array<{ date: string; count: number }>;
}

// Connection pool for TimescaleDB
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.TIMESCALE_URL;

    if (!connectionString) {
      throw new Error('TIMESCALE_URL environment variable not set');
    }

    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on TimescaleDB pool:', err);
    });
  }

  return pool;
}

export class EventWriter {
  /**
   * Write a batch of events to TimescaleDB
   */
  async writeBatch(
    events: ExtractedEvent[],
    organizationId: string,
    sourceId: string
  ): Promise<WriteResult> {
    if (events.length === 0) {
      return { written: 0, errors: [] };
    }

    const client = await getPool().connect();
    const errors: string[] = [];
    let written = 0;

    try {
      await client.query('BEGIN');

      // Prepare batch insert
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const event of events) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );

        values.push(
          organizationId,
          sourceId,
          event.type,
          event.timestamp,
          event.actorId || null,
          event.targetId || null,
          JSON.stringify(event.metadata || {}),
          event.rawData ? JSON.stringify(event.rawData) : null
        );
      }

      const query = `
        INSERT INTO events (
          organization_id,
          source_id,
          event_type,
          timestamp,
          actor_id,
          target_id,
          metadata,
          raw_data
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT DO NOTHING
      `;

      const result = await client.query(query, values);
      written = result.rowCount || 0;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      client.release();
    }

    return { written, errors };
  }

  /**
   * Write a single event
   */
  async writeEvent(
    event: ExtractedEvent,
    organizationId: string,
    sourceId: string
  ): Promise<void> {
    const client = await getPool().connect();

    try {
      await client.query(
        `
        INSERT INTO events (
          organization_id,
          source_id,
          event_type,
          timestamp,
          actor_id,
          target_id,
          metadata,
          raw_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          organizationId,
          sourceId,
          event.type,
          event.timestamp,
          event.actorId || null,
          event.targetId || null,
          JSON.stringify(event.metadata || {}),
          event.rawData ? JSON.stringify(event.rawData) : null,
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get event statistics for an organization
   */
  async getStats(organizationId: string, days = 30): Promise<EventStats> {
    const client = await getPool().connect();

    try {
      // Total events
      const totalResult = await client.query(
        `
        SELECT COUNT(*) as count
        FROM events
        WHERE organization_id = $1
          AND timestamp > NOW() - INTERVAL '${days} days'
      `,
        [organizationId]
      );

      // Events by type
      const byTypeResult = await client.query(
        `
        SELECT event_type, COUNT(*) as count
        FROM events
        WHERE organization_id = $1
          AND timestamp > NOW() - INTERVAL '${days} days'
        GROUP BY event_type
        ORDER BY count DESC
      `,
        [organizationId]
      );

      // Events per day
      const perDayResult = await client.query(
        `
        SELECT DATE(timestamp) as date, COUNT(*) as count
        FROM events
        WHERE organization_id = $1
          AND timestamp > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `,
        [organizationId]
      );

      const eventsByType: Record<string, number> = {};
      for (const row of byTypeResult.rows) {
        eventsByType[row.event_type] = parseInt(row.count, 10);
      }

      const eventsPerDay = perDayResult.rows.map((row) => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count, 10),
      }));

      return {
        totalEvents: parseInt(totalResult.rows[0]?.count || '0', 10),
        eventsByType,
        eventsPerDay,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Delete events for a specific source
   */
  async deleteBySource(organizationId: string, sourceId: string): Promise<number> {
    const client = await getPool().connect();

    try {
      const result = await client.query(
        `
        DELETE FROM events
        WHERE organization_id = $1 AND source_id = $2
      `,
        [organizationId, sourceId]
      );

      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  /**
   * Query events with filters
   */
  async queryEvents(
    organizationId: string,
    filters: {
      eventType?: string;
      actorId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    const client = await getPool().connect();

    try {
      const conditions = ['organization_id = $1'];
      const values: unknown[] = [organizationId];
      let paramIndex = 2;

      if (filters.eventType) {
        conditions.push(`event_type = $${paramIndex++}`);
        values.push(filters.eventType);
      }

      if (filters.actorId) {
        conditions.push(`actor_id = $${paramIndex++}`);
        values.push(filters.actorId);
      }

      if (filters.from) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        values.push(filters.from);
      }

      if (filters.to) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        values.push(filters.to);
      }

      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      const result = await client.query(
        `
        SELECT *
        FROM events
        WHERE ${conditions.join(' AND ')}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
        values
      );

      return result.rows;
    } finally {
      client.release();
    }
  }
}

// Factory function
let eventWriterInstance: EventWriter | null = null;

export function createEventWriter(): EventWriter {
  if (!eventWriterInstance) {
    eventWriterInstance = new EventWriter();
  }
  return eventWriterInstance;
}

/**
 * Close the connection pool
 */
export async function closeEventWriterPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
