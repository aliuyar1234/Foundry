/**
 * Network Builder Service
 * Builds communication network from email/message metadata
 * T231 - Communication network builder from email/message metadata
 */

import { runQuery, runWriteTransaction } from '../../../graph/connection.js';

export interface NetworkNode {
  id: string;
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  degree: number;
  inDegree: number;
  outDegree: number;
  totalCommunications: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  emailCount: number;
  messageCount: number;
  callCount: number;
  lastCommunication: Date;
  direction: 'outgoing' | 'incoming' | 'bidirectional';
}

export interface CommunicationNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  stats: NetworkStats;
}

export interface NetworkStats {
  nodeCount: number;
  edgeCount: number;
  density: number;
  avgDegree: number;
  maxDegree: number;
  isolatedNodes: number;
  bidirectionalEdges: number;
}

export interface BuildNetworkOptions {
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
  minCommunications?: number;
  includeDepartments?: string[];
  excludeExternal?: boolean;
}

/**
 * Build communication network from stored relationship data
 */
export async function buildCommunicationNetwork(
  options: BuildNetworkOptions
): Promise<CommunicationNetwork> {
  const { organizationId, minCommunications = 1 } = options;

  // Get all nodes with their degrees
  const nodesResult = await runQuery<{
    p: { properties: Record<string, unknown> };
    outDegree: { low: number };
    inDegree: { low: number };
    totalComm: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[out:COMMUNICATES_WITH]->(:Person)
    OPTIONAL MATCH (:Person)-[inc:COMMUNICATES_WITH]->(p)
    WITH p,
         count(DISTINCT out) as outDegree,
         count(DISTINCT inc) as inDegree,
         sum(COALESCE(out.totalCount, 0)) + sum(COALESCE(inc.totalCount, 0)) as totalComm
    WHERE outDegree > 0 OR inDegree > 0
    RETURN p, outDegree, inDegree, totalComm
    ORDER BY totalComm DESC
    `,
    { organizationId }
  );

  const nodes: NetworkNode[] = nodesResult.map((r) => ({
    id: r.p.properties.id as string,
    email: r.p.properties.email as string,
    displayName: r.p.properties.displayName as string | undefined,
    department: r.p.properties.department as string | undefined,
    jobTitle: r.p.properties.jobTitle as string | undefined,
    outDegree: r.outDegree?.low || 0,
    inDegree: r.inDegree?.low || 0,
    degree: (r.outDegree?.low || 0) + (r.inDegree?.low || 0),
    totalCommunications: r.totalComm?.low || 0,
  }));

  // Get all edges
  const edgesResult = await runQuery<{
    fromEmail: string;
    toEmail: string;
    r: { properties: Record<string, unknown> };
    isBidirectional: boolean;
  }>(
    `
    MATCH (from:Person {organizationId: $organizationId})-[r:COMMUNICATES_WITH]->(to:Person)
    WHERE r.totalCount >= $minCommunications
    OPTIONAL MATCH (to)-[reverse:COMMUNICATES_WITH]->(from)
    RETURN from.email as fromEmail, to.email as toEmail, r,
           reverse IS NOT NULL as isBidirectional
    ORDER BY r.totalCount DESC
    `,
    { organizationId, minCommunications }
  );

  const edges: NetworkEdge[] = edgesResult.map((r) => ({
    source: r.fromEmail,
    target: r.toEmail,
    weight: (r.r.properties.totalCount as { low: number })?.low || r.r.properties.totalCount as number || 0,
    emailCount: (r.r.properties.emailCount as { low: number })?.low || r.r.properties.emailCount as number || 0,
    messageCount: (r.r.properties.messageCount as { low: number })?.low || r.r.properties.messageCount as number || 0,
    callCount: (r.r.properties.callCount as { low: number })?.low || r.r.properties.callCount as number || 0,
    lastCommunication: new Date(r.r.properties.lastCommunication as string),
    direction: r.isBidirectional ? 'bidirectional' : 'outgoing',
  }));

  // Calculate network stats
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const maxPossibleEdges = nodeCount * (nodeCount - 1);
  const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
  const avgDegree = nodeCount > 0 ? nodes.reduce((sum, n) => sum + n.degree, 0) / nodeCount : 0;
  const maxDegree = nodes.length > 0 ? Math.max(...nodes.map((n) => n.degree)) : 0;
  const isolatedNodes = nodes.filter((n) => n.degree === 0).length;
  const bidirectionalEdges = edges.filter((e) => e.direction === 'bidirectional').length;

  return {
    nodes,
    edges,
    stats: {
      nodeCount,
      edgeCount,
      density,
      avgDegree,
      maxDegree,
      isolatedNodes,
      bidirectionalEdges,
    },
  };
}

/**
 * Get network for a specific person (ego network)
 */
export async function buildEgoNetwork(
  organizationId: string,
  email: string,
  depth: number = 1
): Promise<CommunicationNetwork> {
  // Get the ego node and its connections up to specified depth
  const nodesResult = await runQuery<{
    p: { properties: Record<string, unknown> };
    distance: { low: number };
  }>(
    `
    MATCH (ego:Person {organizationId: $organizationId, email: $email})
    CALL apoc.path.subgraphNodes(ego, {
      relationshipFilter: 'COMMUNICATES_WITH',
      maxLevel: $depth
    }) YIELD node
    WITH node as p
    OPTIONAL MATCH (p)-[out:COMMUNICATES_WITH]->(:Person)
    OPTIONAL MATCH (:Person)-[inc:COMMUNICATES_WITH]->(p)
    RETURN p,
           count(DISTINCT out) as outDegree,
           count(DISTINCT inc) as inDegree
    `,
    { organizationId, email: email.toLowerCase(), depth }
  ).catch(async () => {
    // Fallback if APOC is not available
    return runQuery<{
      p: { properties: Record<string, unknown> };
      outDegree: { low: number };
      inDegree: { low: number };
    }>(
      `
      MATCH (ego:Person {organizationId: $organizationId, email: $email})
      MATCH path = (ego)-[:COMMUNICATES_WITH*1..${depth}]-(p:Person)
      WITH DISTINCT p
      OPTIONAL MATCH (p)-[out:COMMUNICATES_WITH]->(:Person)
      OPTIONAL MATCH (:Person)-[inc:COMMUNICATES_WITH]->(p)
      RETURN p,
             count(DISTINCT out) as outDegree,
             count(DISTINCT inc) as inDegree
      `,
      { organizationId, email: email.toLowerCase() }
    );
  });

  const nodes: NetworkNode[] = nodesResult.map((r: { p: { properties: Record<string, unknown> }; outDegree?: { low: number }; inDegree?: { low: number } }) => ({
    id: r.p.properties.id as string,
    email: r.p.properties.email as string,
    displayName: r.p.properties.displayName as string | undefined,
    department: r.p.properties.department as string | undefined,
    jobTitle: r.p.properties.jobTitle as string | undefined,
    outDegree: r.outDegree?.low || 0,
    inDegree: r.inDegree?.low || 0,
    degree: (r.outDegree?.low || 0) + (r.inDegree?.low || 0),
    totalCommunications: 0,
  }));

  const nodeEmails = new Set(nodes.map((n) => n.email));

  // Get edges between these nodes
  const edgesResult = await runQuery<{
    fromEmail: string;
    toEmail: string;
    r: { properties: Record<string, unknown> };
  }>(
    `
    MATCH (from:Person {organizationId: $organizationId})-[r:COMMUNICATES_WITH]->(to:Person)
    WHERE from.email IN $emails AND to.email IN $emails
    RETURN from.email as fromEmail, to.email as toEmail, r
    `,
    { organizationId, emails: Array.from(nodeEmails) }
  );

  const edges: NetworkEdge[] = edgesResult.map((r) => ({
    source: r.fromEmail,
    target: r.toEmail,
    weight: (r.r.properties.totalCount as { low: number })?.low || r.r.properties.totalCount as number || 0,
    emailCount: (r.r.properties.emailCount as { low: number })?.low || 0,
    messageCount: (r.r.properties.messageCount as { low: number })?.low || 0,
    callCount: (r.r.properties.callCount as { low: number })?.low || 0,
    lastCommunication: new Date(r.r.properties.lastCommunication as string),
    direction: 'outgoing',
  }));

  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  return {
    nodes,
    edges,
    stats: {
      nodeCount,
      edgeCount,
      density: nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0,
      avgDegree: nodeCount > 0 ? nodes.reduce((sum, n) => sum + n.degree, 0) / nodeCount : 0,
      maxDegree: nodes.length > 0 ? Math.max(...nodes.map((n) => n.degree)) : 0,
      isolatedNodes: 0,
      bidirectionalEdges: 0,
    },
  };
}

/**
 * Get communication summary between departments
 */
export async function getDepartmentNetwork(
  organizationId: string
): Promise<{
  departments: Array<{ name: string; memberCount: number; totalCommunications: number }>;
  interdepartmental: Array<{ from: string; to: string; count: number }>;
}> {
  const deptStats = await runQuery<{
    department: string;
    memberCount: { low: number };
    totalComm: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    WHERE p.department IS NOT NULL
    OPTIONAL MATCH (p)-[r:COMMUNICATES_WITH]-(:Person)
    WITH p.department as department, count(DISTINCT p) as memberCount, sum(r.totalCount) as totalComm
    RETURN department, memberCount, totalComm
    ORDER BY memberCount DESC
    `,
    { organizationId }
  );

  const interdeptResult = await runQuery<{
    fromDept: string;
    toDept: string;
    commCount: { low: number };
  }>(
    `
    MATCH (from:Person {organizationId: $organizationId})-[r:COMMUNICATES_WITH]->(to:Person)
    WHERE from.department IS NOT NULL AND to.department IS NOT NULL
      AND from.department <> to.department
    WITH from.department as fromDept, to.department as toDept, sum(r.totalCount) as commCount
    RETURN fromDept, toDept, commCount
    ORDER BY commCount DESC
    LIMIT 50
    `,
    { organizationId }
  );

  return {
    departments: deptStats.map((d) => ({
      name: d.department,
      memberCount: d.memberCount?.low || 0,
      totalCommunications: d.totalComm?.low || 0,
    })),
    interdepartmental: interdeptResult.map((r) => ({
      from: r.fromDept,
      to: r.toDept,
      count: r.commCount?.low || 0,
    })),
  };
}

/**
 * Calculate network metrics for caching
 */
export async function calculateAndStoreNetworkMetrics(
  organizationId: string
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    // Calculate and store degree centrality on nodes
    await tx.run(
      `
      MATCH (p:Person {organizationId: $organizationId})
      OPTIONAL MATCH (p)-[out:COMMUNICATES_WITH]->(:Person)
      OPTIONAL MATCH (:Person)-[inc:COMMUNICATES_WITH]->(p)
      WITH p, count(DISTINCT out) as outDegree, count(DISTINCT inc) as inDegree
      SET p.outDegree = outDegree,
          p.inDegree = inDegree,
          p.degree = outDegree + inDegree,
          p.metricsUpdatedAt = datetime()
      `,
      { organizationId }
    );
  });
}

export default {
  buildCommunicationNetwork,
  buildEgoNetwork,
  getDepartmentNetwork,
  calculateAndStoreNetworkMetrics,
};
