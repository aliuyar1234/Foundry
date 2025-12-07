/**
 * REPORTS_TO Relationship
 * Represents organizational hierarchy between persons
 */

import { runQuery, runWriteTransaction } from '../connection.js';

export interface ReportsToRelation {
  employeeEmail: string;
  managerEmail: string;
  organizationId: string;
  source: 'inferred' | 'explicit' | 'directory';
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InferredReportingInput {
  employeeEmail: string;
  managerEmail: string;
  organizationId: string;
  confidence: number;
  evidence: string[];
}

/**
 * Set explicit reporting relationship from directory
 */
export async function setReportingRelationship(
  organizationId: string,
  employeeEmail: string,
  managerEmail: string,
  source: 'explicit' | 'directory' = 'directory'
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (employee:Person {organizationId: $organizationId, email: $employeeEmail})
      MATCH (manager:Person {organizationId: $organizationId, email: $managerEmail})
      MERGE (employee)-[r:REPORTS_TO]->(manager)
      SET r.source = $source,
          r.confidence = 1.0,
          r.organizationId = $organizationId,
          r.updatedAt = datetime()
      ON CREATE SET r.createdAt = datetime()
    `;

    await tx.run(query, {
      organizationId,
      employeeEmail: employeeEmail.toLowerCase(),
      managerEmail: managerEmail.toLowerCase(),
      source,
    });
  });
}

/**
 * Set inferred reporting relationship based on communication patterns
 */
export async function setInferredReporting(
  input: InferredReportingInput
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (employee:Person {organizationId: $organizationId, email: $employeeEmail})
      MATCH (manager:Person {organizationId: $organizationId, email: $managerEmail})
      MERGE (employee)-[r:REPORTS_TO]->(manager)
      ON CREATE SET
        r.source = 'inferred',
        r.confidence = $confidence,
        r.evidence = $evidence,
        r.organizationId = $organizationId,
        r.createdAt = datetime(),
        r.updatedAt = datetime()
      ON MATCH SET
        r.confidence = CASE WHEN r.source = 'inferred' THEN $confidence ELSE r.confidence END,
        r.evidence = CASE WHEN r.source = 'inferred' THEN $evidence ELSE r.evidence END,
        r.updatedAt = datetime()
    `;

    await tx.run(query, {
      organizationId: input.organizationId,
      employeeEmail: input.employeeEmail.toLowerCase(),
      managerEmail: input.managerEmail.toLowerCase(),
      confidence: input.confidence,
      evidence: input.evidence,
    });
  });
}

/**
 * Bulk set reporting relationships from directory
 */
export async function bulkSetReportingRelationships(
  inputs: Array<{
    organizationId: string;
    employeeEmail: string;
    managerEmail: string;
  }>
): Promise<number> {
  if (inputs.length === 0) return 0;

  const result = await runWriteTransaction(async (tx) => {
    const query = `
      UNWIND $relationships as rel
      MATCH (employee:Person {organizationId: rel.organizationId, email: rel.employeeEmail})
      MATCH (manager:Person {organizationId: rel.organizationId, email: rel.managerEmail})
      MERGE (employee)-[r:REPORTS_TO]->(manager)
      SET r.source = 'directory',
          r.confidence = 1.0,
          r.organizationId = rel.organizationId,
          r.updatedAt = datetime()
      ON CREATE SET r.createdAt = datetime()
      RETURN count(r) as count
    `;

    const relationships = inputs.map(i => ({
      organizationId: i.organizationId,
      employeeEmail: i.employeeEmail.toLowerCase(),
      managerEmail: i.managerEmail.toLowerCase(),
    }));

    const result = await tx.run(query, { relationships });
    return result.records[0]?.get('count').toNumber() || 0;
  });

  return result;
}

/**
 * Get manager for a person
 */
export async function getManager(
  organizationId: string,
  employeeEmail: string
): Promise<{ email: string; displayName?: string; confidence: number } | null> {
  const results = await runQuery<{
    email: string;
    displayName: string;
    confidence: number;
  }>(
    `
    MATCH (employee:Person {organizationId: $organizationId, email: $employeeEmail})
          -[r:REPORTS_TO]->(manager:Person)
    RETURN manager.email as email, manager.displayName as displayName, r.confidence as confidence
    `,
    { organizationId, employeeEmail: employeeEmail.toLowerCase() }
  );

  if (results.length === 0) return null;
  return results[0];
}

/**
 * Get direct reports for a person
 */
export async function getDirectReports(
  organizationId: string,
  managerEmail: string
): Promise<Array<{ email: string; displayName?: string }>> {
  const results = await runQuery<{
    email: string;
    displayName: string;
  }>(
    `
    MATCH (employee:Person)-[r:REPORTS_TO]->(manager:Person {organizationId: $organizationId, email: $managerEmail})
    RETURN employee.email as email, employee.displayName as displayName
    ORDER BY employee.displayName, employee.email
    `,
    { organizationId, managerEmail: managerEmail.toLowerCase() }
  );

  return results;
}

/**
 * Get full reporting chain (all ancestors)
 */
export async function getReportingChain(
  organizationId: string,
  employeeEmail: string
): Promise<Array<{ email: string; displayName?: string; level: number }>> {
  const results = await runQuery<{
    email: string;
    displayName: string;
    level: { low: number };
  }>(
    `
    MATCH path = (employee:Person {organizationId: $organizationId, email: $employeeEmail})
                 -[:REPORTS_TO*1..10]->(manager:Person)
    WITH manager, length(path) as level
    RETURN manager.email as email, manager.displayName as displayName, level
    ORDER BY level
    `,
    { organizationId, employeeEmail: employeeEmail.toLowerCase() }
  );

  return results.map(r => ({
    email: r.email,
    displayName: r.displayName,
    level: r.level?.low || 0,
  }));
}

/**
 * Get organizational hierarchy tree
 */
export async function getOrganizationHierarchy(
  organizationId: string,
  rootEmail?: string
): Promise<Array<{
  email: string;
  displayName?: string;
  managerEmail?: string;
  level: number;
}>> {
  let query: string;
  let params: Record<string, unknown>;

  if (rootEmail) {
    query = `
      MATCH path = (root:Person {organizationId: $organizationId, email: $rootEmail})
                   <-[:REPORTS_TO*0..10]-(p:Person)
      WITH p, length(path) as level
      OPTIONAL MATCH (p)-[:REPORTS_TO]->(manager:Person)
      RETURN p.email as email, p.displayName as displayName, manager.email as managerEmail, level
      ORDER BY level, p.displayName
    `;
    params = { organizationId, rootEmail: rootEmail.toLowerCase() };
  } else {
    // Find top-level (no manager) and build tree
    query = `
      MATCH (p:Person {organizationId: $organizationId})
      WHERE NOT (p)-[:REPORTS_TO]->(:Person)
      WITH p, 0 as level
      OPTIONAL MATCH path = (p)<-[:REPORTS_TO*0..10]-(descendant:Person)
      WITH descendant, length(path) as level
      OPTIONAL MATCH (descendant)-[:REPORTS_TO]->(manager:Person)
      RETURN descendant.email as email, descendant.displayName as displayName,
             manager.email as managerEmail, level
      ORDER BY level, descendant.displayName
    `;
    params = { organizationId };
  }

  const results = await runQuery<{
    email: string;
    displayName: string;
    managerEmail: string;
    level: { low: number } | number;
  }>(query, params);

  return results.map(r => ({
    email: r.email,
    displayName: r.displayName,
    managerEmail: r.managerEmail,
    level: typeof r.level === 'number' ? r.level : r.level?.low || 0,
  }));
}

/**
 * Remove reporting relationship
 */
export async function removeReportingRelationship(
  organizationId: string,
  employeeEmail: string,
  managerEmail: string
): Promise<boolean> {
  const result = await runWriteTransaction(async (tx) => {
    const query = `
      MATCH (employee:Person {organizationId: $organizationId, email: $employeeEmail})
            -[r:REPORTS_TO]->(manager:Person {email: $managerEmail})
      DELETE r
      RETURN count(r) as deleted
    `;

    const result = await tx.run(query, {
      organizationId,
      employeeEmail: employeeEmail.toLowerCase(),
      managerEmail: managerEmail.toLowerCase(),
    });
    return result.records[0]?.get('deleted').toNumber() || 0;
  });

  return result > 0;
}

/**
 * Infer reporting relationships based on communication patterns
 * Uses heuristics like communication frequency and meeting patterns
 */
export async function inferReportingRelationships(
  organizationId: string
): Promise<InferredReportingInput[]> {
  // Find potential manager-report pairs based on communication patterns
  const results = await runQuery<{
    employeeEmail: string;
    potentialManagerEmail: string;
    commCount: { low: number };
    meetingCount: { low: number };
  }>(
    `
    // Find persons with high communication frequency
    MATCH (p1:Person {organizationId: $organizationId})-[c:COMMUNICATES_WITH]->(p2:Person)
    WHERE c.totalCount > 10
    AND NOT (p1)-[:REPORTS_TO]->(p2)
    AND NOT (p2)-[:REPORTS_TO]->(p1)

    // Check meeting co-attendance
    OPTIONAL MATCH (p1)-[:ATTENDS]->(m:Meeting)<-[:ATTENDS]-(p2)

    WITH p1, p2, c.totalCount as commCount, count(m) as meetingCount
    WHERE commCount > 20 OR meetingCount > 5

    // Check if p2 has more total communications (likely more senior)
    MATCH (p2)-[c2:COMMUNICATES_WITH]-()
    WITH p1, p2, commCount, meetingCount, sum(c2.totalCount) as p2TotalComms
    MATCH (p1)-[c1:COMMUNICATES_WITH]-()
    WITH p1, p2, commCount, meetingCount, p2TotalComms, sum(c1.totalCount) as p1TotalComms
    WHERE p2TotalComms > p1TotalComms * 1.5

    RETURN p1.email as employeeEmail, p2.email as potentialManagerEmail,
           commCount, meetingCount
    ORDER BY commCount DESC
    LIMIT 100
    `,
    { organizationId }
  );

  return results.map(r => {
    const commCount = r.commCount?.low || 0;
    const meetingCount = r.meetingCount?.low || 0;

    // Calculate confidence based on evidence strength
    const commScore = Math.min(commCount / 100, 1) * 0.5;
    const meetingScore = Math.min(meetingCount / 20, 1) * 0.5;
    const confidence = commScore + meetingScore;

    const evidence: string[] = [];
    if (commCount > 50) evidence.push(`High communication frequency: ${commCount} messages`);
    if (meetingCount > 10) evidence.push(`Frequent meeting co-attendance: ${meetingCount} meetings`);

    return {
      employeeEmail: r.employeeEmail,
      managerEmail: r.potentialManagerEmail,
      organizationId,
      confidence,
      evidence,
    };
  }).filter(r => r.confidence > 0.3);
}
