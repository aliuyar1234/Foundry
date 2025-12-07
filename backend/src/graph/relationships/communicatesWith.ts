/**
 * COMMUNICATES_WITH Relationship
 * Represents communication between persons (emails, messages, calls)
 */

import { runQuery, runWriteTransaction } from '../connection.js';

export interface CommunicatesWithRelation {
  fromEmail: string;
  toEmail: string;
  organizationId: string;
  totalCount: number;
  emailCount: number;
  messageCount: number;
  callCount: number;
  lastCommunication: Date;
  firstCommunication: Date;
  strength: number;
}

export interface CreateCommunicationInput {
  fromEmail: string;
  toEmail: string;
  organizationId: string;
  type: 'email' | 'message' | 'call';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Record a communication between two persons
 * Creates or updates the COMMUNICATES_WITH relationship
 */
export async function recordCommunication(
  input: CreateCommunicationInput
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    const typeCountField = `${input.type}Count`;

    const query = `
      MATCH (from:Person {organizationId: $organizationId, email: $fromEmail})
      MATCH (to:Person {organizationId: $organizationId, email: $toEmail})
      MERGE (from)-[r:COMMUNICATES_WITH]->(to)
      ON CREATE SET
        r.totalCount = 1,
        r.emailCount = CASE WHEN $type = 'email' THEN 1 ELSE 0 END,
        r.messageCount = CASE WHEN $type = 'message' THEN 1 ELSE 0 END,
        r.callCount = CASE WHEN $type = 'call' THEN 1 ELSE 0 END,
        r.firstCommunication = $timestamp,
        r.lastCommunication = $timestamp,
        r.organizationId = $organizationId
      ON MATCH SET
        r.totalCount = r.totalCount + 1,
        r.emailCount = CASE WHEN $type = 'email' THEN r.emailCount + 1 ELSE r.emailCount END,
        r.messageCount = CASE WHEN $type = 'message' THEN r.messageCount + 1 ELSE r.messageCount END,
        r.callCount = CASE WHEN $type = 'call' THEN r.callCount + 1 ELSE r.callCount END,
        r.lastCommunication = CASE WHEN $timestamp > r.lastCommunication THEN $timestamp ELSE r.lastCommunication END,
        r.firstCommunication = CASE WHEN $timestamp < r.firstCommunication THEN $timestamp ELSE r.firstCommunication END
    `;

    await tx.run(query, {
      organizationId: input.organizationId,
      fromEmail: input.fromEmail.toLowerCase(),
      toEmail: input.toEmail.toLowerCase(),
      type: input.type,
      timestamp: input.timestamp.toISOString(),
    });
  });
}

/**
 * Bulk record communications
 */
export async function bulkRecordCommunications(
  inputs: CreateCommunicationInput[]
): Promise<number> {
  if (inputs.length === 0) return 0;

  const result = await runWriteTransaction(async (tx) => {
    // Group by from-to pair to avoid multiple updates
    const aggregated = new Map<string, {
      fromEmail: string;
      toEmail: string;
      organizationId: string;
      emailCount: number;
      messageCount: number;
      callCount: number;
      firstTimestamp: Date;
      lastTimestamp: Date;
    }>();

    for (const input of inputs) {
      const key = `${input.fromEmail}-${input.toEmail}`;
      const existing = aggregated.get(key);

      if (existing) {
        if (input.type === 'email') existing.emailCount++;
        if (input.type === 'message') existing.messageCount++;
        if (input.type === 'call') existing.callCount++;
        if (input.timestamp < existing.firstTimestamp) existing.firstTimestamp = input.timestamp;
        if (input.timestamp > existing.lastTimestamp) existing.lastTimestamp = input.timestamp;
      } else {
        aggregated.set(key, {
          fromEmail: input.fromEmail.toLowerCase(),
          toEmail: input.toEmail.toLowerCase(),
          organizationId: input.organizationId,
          emailCount: input.type === 'email' ? 1 : 0,
          messageCount: input.type === 'message' ? 1 : 0,
          callCount: input.type === 'call' ? 1 : 0,
          firstTimestamp: input.timestamp,
          lastTimestamp: input.timestamp,
        });
      }
    }

    const query = `
      UNWIND $communications as comm
      MATCH (from:Person {organizationId: comm.organizationId, email: comm.fromEmail})
      MATCH (to:Person {organizationId: comm.organizationId, email: comm.toEmail})
      MERGE (from)-[r:COMMUNICATES_WITH]->(to)
      ON CREATE SET
        r.totalCount = comm.emailCount + comm.messageCount + comm.callCount,
        r.emailCount = comm.emailCount,
        r.messageCount = comm.messageCount,
        r.callCount = comm.callCount,
        r.firstCommunication = comm.firstTimestamp,
        r.lastCommunication = comm.lastTimestamp,
        r.organizationId = comm.organizationId
      ON MATCH SET
        r.totalCount = r.totalCount + comm.emailCount + comm.messageCount + comm.callCount,
        r.emailCount = r.emailCount + comm.emailCount,
        r.messageCount = r.messageCount + comm.messageCount,
        r.callCount = r.callCount + comm.callCount,
        r.lastCommunication = CASE WHEN comm.lastTimestamp > r.lastCommunication THEN comm.lastTimestamp ELSE r.lastCommunication END,
        r.firstCommunication = CASE WHEN comm.firstTimestamp < r.firstCommunication THEN comm.firstTimestamp ELSE r.firstCommunication END
      RETURN count(r) as count
    `;

    const communications = Array.from(aggregated.values()).map(c => ({
      ...c,
      firstTimestamp: c.firstTimestamp.toISOString(),
      lastTimestamp: c.lastTimestamp.toISOString(),
    }));

    const result = await tx.run(query, { communications });
    return result.records[0]?.get('count').toNumber() || 0;
  });

  return result;
}

/**
 * Get communication relationships for a person
 */
export async function getCommunicationsForPerson(
  organizationId: string,
  email: string,
  options?: { direction?: 'outgoing' | 'incoming' | 'both'; limit?: number }
): Promise<CommunicatesWithRelation[]> {
  const direction = options?.direction || 'both';
  const limit = options?.limit || 50;

  let query: string;
  if (direction === 'outgoing') {
    query = `
      MATCH (from:Person {organizationId: $organizationId, email: $email})-[r:COMMUNICATES_WITH]->(to:Person)
      RETURN from.email as fromEmail, to.email as toEmail, r
      ORDER BY r.totalCount DESC
      LIMIT $limit
    `;
  } else if (direction === 'incoming') {
    query = `
      MATCH (from:Person)-[r:COMMUNICATES_WITH]->(to:Person {organizationId: $organizationId, email: $email})
      RETURN from.email as fromEmail, to.email as toEmail, r
      ORDER BY r.totalCount DESC
      LIMIT $limit
    `;
  } else {
    query = `
      MATCH (p:Person {organizationId: $organizationId, email: $email})-[r:COMMUNICATES_WITH]-(other:Person)
      RETURN
        CASE WHEN startNode(r) = p THEN p.email ELSE other.email END as fromEmail,
        CASE WHEN endNode(r) = p THEN p.email ELSE other.email END as toEmail,
        r
      ORDER BY r.totalCount DESC
      LIMIT $limit
    `;
  }

  const results = await runQuery<{
    fromEmail: string;
    toEmail: string;
    r: { properties: Record<string, unknown> };
  }>(query, { organizationId, email: email.toLowerCase(), limit });

  return results.map(r => mapToCommunicatesWithRelation(
    r.fromEmail,
    r.toEmail,
    organizationId,
    r.r.properties
  ));
}

/**
 * Get top communication pairs in organization
 */
export async function getTopCommunicationPairs(
  organizationId: string,
  limit = 20
): Promise<CommunicatesWithRelation[]> {
  const results = await runQuery<{
    fromEmail: string;
    toEmail: string;
    r: { properties: Record<string, unknown> };
  }>(
    `
    MATCH (from:Person {organizationId: $organizationId})-[r:COMMUNICATES_WITH]->(to:Person)
    RETURN from.email as fromEmail, to.email as toEmail, r
    ORDER BY r.totalCount DESC
    LIMIT $limit
    `,
    { organizationId, limit }
  );

  return results.map(r => mapToCommunicatesWithRelation(
    r.fromEmail,
    r.toEmail,
    organizationId,
    r.r.properties
  ));
}

/**
 * Calculate communication strength between two persons
 * Strength is based on frequency and recency
 */
export async function calculateCommunicationStrength(
  organizationId: string,
  email1: string,
  email2: string
): Promise<number> {
  const results = await runQuery<{
    totalCount: { low: number };
    daysSinceLastComm: { low: number };
  }>(
    `
    MATCH (p1:Person {organizationId: $organizationId, email: $email1})-[r:COMMUNICATES_WITH]-(p2:Person {email: $email2})
    WITH r, duration.inDays(datetime(r.lastCommunication), datetime()).days as daysSince
    RETURN r.totalCount as totalCount, daysSince as daysSinceLastComm
    `,
    { organizationId, email1: email1.toLowerCase(), email2: email2.toLowerCase() }
  );

  if (results.length === 0) return 0;

  const { totalCount, daysSinceLastComm } = results[0];
  const count = totalCount?.low || 0;
  const days = daysSinceLastComm?.low || 365;

  // Decay factor based on recency (halves every 30 days)
  const recencyFactor = Math.pow(0.5, days / 30);

  // Logarithmic scaling for count
  const countFactor = Math.log10(count + 1);

  return countFactor * recencyFactor;
}

/**
 * Map Neo4j record to CommunicatesWithRelation
 */
function mapToCommunicatesWithRelation(
  fromEmail: string,
  toEmail: string,
  organizationId: string,
  properties: Record<string, unknown>
): CommunicatesWithRelation {
  const totalCount = (properties.totalCount as { low: number })?.low || properties.totalCount as number || 0;
  const emailCount = (properties.emailCount as { low: number })?.low || properties.emailCount as number || 0;
  const messageCount = (properties.messageCount as { low: number })?.low || properties.messageCount as number || 0;
  const callCount = (properties.callCount as { low: number })?.low || properties.callCount as number || 0;

  return {
    fromEmail,
    toEmail,
    organizationId,
    totalCount,
    emailCount,
    messageCount,
    callCount,
    lastCommunication: new Date(properties.lastCommunication as string),
    firstCommunication: new Date(properties.firstCommunication as string),
    strength: totalCount, // Can be replaced with calculated strength
  };
}
