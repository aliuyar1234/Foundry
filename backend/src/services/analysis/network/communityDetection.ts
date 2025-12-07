/**
 * Community Detection Service
 * Implements Louvain algorithm for detecting communities in the network
 * T234 - Community detection (Louvain algorithm)
 */

import { runQuery, runWriteTransaction } from '../../../graph/connection.js';

export interface Community {
  id: string;
  name?: string;
  members: CommunityMember[];
  size: number;
  density: number;
  avgCommunications: number;
  departments: Array<{ name: string; count: number }>;
  keyMembers: string[];
}

export interface CommunityMember {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  internalConnections: number;
  externalConnections: number;
  communityRole: 'hub' | 'bridge' | 'peripheral' | 'member';
}

export interface CommunityDetectionResult {
  communities: Community[];
  modularity: number;
  stats: {
    totalCommunities: number;
    avgCommunitySize: number;
    largestCommunity: number;
    smallestCommunity: number;
    isolatedNodes: number;
  };
}

/**
 * Detect communities using Louvain algorithm (via Neo4j GDS or fallback)
 */
export async function detectCommunities(
  organizationId: string,
  options: {
    minCommunitySize?: number;
    maxIterations?: number;
  } = {}
): Promise<CommunityDetectionResult> {
  const minCommunitySize = options.minCommunitySize || 2;

  try {
    // Try using Neo4j GDS Louvain
    return await detectCommunitiesWithGDS(organizationId, options);
  } catch {
    // Fallback to label propagation approximation
    return await detectCommunitiesWithLabelPropagation(organizationId, minCommunitySize);
  }
}

/**
 * Detect communities using Neo4j GDS Louvain algorithm
 */
async function detectCommunitiesWithGDS(
  organizationId: string,
  options: { maxIterations?: number } = {}
): Promise<CommunityDetectionResult> {
  const maxIterations = options.maxIterations || 10;

  // Run Louvain and write community IDs to nodes
  await runWriteTransaction(async (tx) => {
    await tx.run(
      `
      CALL gds.louvain.write({
        nodeQuery: 'MATCH (p:Person {organizationId: "${organizationId}"}) RETURN id(p) AS id',
        relationshipQuery: 'MATCH (p1:Person {organizationId: "${organizationId}"})-[r:COMMUNICATES_WITH]->(p2:Person) RETURN id(p1) AS source, id(p2) AS target, r.totalCount AS weight',
        writeProperty: 'communityId',
        maxIterations: ${maxIterations}
      })
      YIELD modularity
      RETURN modularity
      `,
      {}
    );
  });

  // Read back communities
  return await readCommunities(organizationId);
}

/**
 * Fallback: Label Propagation algorithm for community detection
 */
async function detectCommunitiesWithLabelPropagation(
  organizationId: string,
  minCommunitySize: number
): Promise<CommunityDetectionResult> {
  // Get all nodes and edges
  const nodes = await runQuery<{ email: string; id: string }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    RETURN p.email as email, p.id as id
    `,
    { organizationId }
  );

  const edges = await runQuery<{
    source: string;
    target: string;
    weight: { low: number };
  }>(
    `
    MATCH (from:Person {organizationId: $organizationId})-[r:COMMUNICATES_WITH]->(to:Person)
    RETURN from.email as source, to.email as target, r.totalCount as weight
    `,
    { organizationId }
  );

  // Build adjacency list
  const neighbors = new Map<string, Map<string, number>>();
  nodes.forEach((n) => neighbors.set(n.email, new Map()));

  edges.forEach((e) => {
    neighbors.get(e.source)?.set(e.target, e.weight?.low || 1);
    // Make undirected
    if (!neighbors.has(e.target)) neighbors.set(e.target, new Map());
    neighbors.get(e.target)?.set(e.source, e.weight?.low || 1);
  });

  // Initialize labels (each node is its own community)
  const labels = new Map<string, string>();
  nodes.forEach((n) => labels.set(n.email, n.email));

  // Label propagation iterations
  const maxIterations = 20;
  let changed = true;
  let iteration = 0;

  while (changed && iteration < maxIterations) {
    changed = false;
    iteration++;

    // Shuffle nodes for random order
    const shuffledNodes = [...nodes].sort(() => Math.random() - 0.5);

    for (const node of shuffledNodes) {
      const nodeNeighbors = neighbors.get(node.email);
      if (!nodeNeighbors || nodeNeighbors.size === 0) continue;

      // Count weighted labels of neighbors
      const labelWeights = new Map<string, number>();
      nodeNeighbors.forEach((weight, neighborEmail) => {
        const neighborLabel = labels.get(neighborEmail);
        if (neighborLabel) {
          labelWeights.set(
            neighborLabel,
            (labelWeights.get(neighborLabel) || 0) + weight
          );
        }
      });

      // Find most common label
      let maxWeight = 0;
      let newLabel = labels.get(node.email)!;
      labelWeights.forEach((weight, label) => {
        if (weight > maxWeight) {
          maxWeight = weight;
          newLabel = label;
        }
      });

      if (newLabel !== labels.get(node.email)) {
        labels.set(node.email, newLabel);
        changed = true;
      }
    }
  }

  // Group nodes by label
  const communities = new Map<string, string[]>();
  labels.forEach((label, email) => {
    if (!communities.has(label)) communities.set(label, []);
    communities.get(label)!.push(email);
  });

  // Store community IDs on nodes
  await runWriteTransaction(async (tx) => {
    let communityIndex = 0;
    for (const [label, members] of communities.entries()) {
      if (members.length >= minCommunitySize) {
        for (const email of members) {
          await tx.run(
            `
            MATCH (p:Person {organizationId: $organizationId, email: $email})
            SET p.communityId = $communityId
            `,
            { organizationId, email, communityId: communityIndex }
          );
        }
        communityIndex++;
      }
    }
  });

  return await readCommunities(organizationId);
}

/**
 * Read communities from stored community IDs
 */
async function readCommunities(
  organizationId: string
): Promise<CommunityDetectionResult> {
  // Get community assignments
  const communityData = await runQuery<{
    communityId: { low: number } | number;
    email: string;
    displayName: string;
    department: string;
    jobTitle: string;
    internalConns: { low: number };
    externalConns: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    WHERE p.communityId IS NOT NULL
    OPTIONAL MATCH (p)-[internal:COMMUNICATES_WITH]-(other:Person {communityId: p.communityId})
    OPTIONAL MATCH (p)-[external:COMMUNICATES_WITH]-(ext:Person)
    WHERE ext.communityId <> p.communityId OR ext.communityId IS NULL
    RETURN p.communityId as communityId, p.email as email, p.displayName as displayName,
           p.department as department, p.jobTitle as jobTitle,
           count(DISTINCT internal) as internalConns, count(DISTINCT external) as externalConns
    ORDER BY communityId, internalConns DESC
    `,
    { organizationId }
  );

  // Group by community
  const communitiesMap = new Map<number, CommunityMember[]>();
  communityData.forEach((row) => {
    const communityId = typeof row.communityId === 'object'
      ? row.communityId.low
      : row.communityId;

    if (!communitiesMap.has(communityId)) {
      communitiesMap.set(communityId, []);
    }

    const internalConns = row.internalConns?.low || row.internalConns as number || 0;
    const externalConns = row.externalConns?.low || row.externalConns as number || 0;

    // Determine member role
    let role: CommunityMember['communityRole'] = 'member';
    if (internalConns > 5 && externalConns > 3) role = 'bridge';
    else if (internalConns > 5) role = 'hub';
    else if (internalConns <= 1) role = 'peripheral';

    communitiesMap.get(communityId)!.push({
      email: row.email,
      displayName: row.displayName,
      department: row.department,
      jobTitle: row.jobTitle,
      internalConnections: internalConns,
      externalConnections: externalConns,
      communityRole: role,
    });
  });

  // Build community objects
  const communities: Community[] = [];
  communitiesMap.forEach((members, communityId) => {
    // Calculate density
    const n = members.length;
    const totalInternalEdges = members.reduce((sum, m) => sum + m.internalConnections, 0) / 2;
    const maxEdges = (n * (n - 1)) / 2;
    const density = maxEdges > 0 ? totalInternalEdges / maxEdges : 0;

    // Get department distribution
    const deptCounts = new Map<string, number>();
    members.forEach((m) => {
      if (m.department) {
        deptCounts.set(m.department, (deptCounts.get(m.department) || 0) + 1);
      }
    });
    const departments = Array.from(deptCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Identify key members (hubs and bridges)
    const keyMembers = members
      .filter((m) => m.communityRole === 'hub' || m.communityRole === 'bridge')
      .slice(0, 5)
      .map((m) => m.email);

    // Generate community name from dominant department
    const dominantDept = departments[0]?.name || 'Mixed';
    const name = `${dominantDept} Group ${communityId + 1}`;

    communities.push({
      id: String(communityId),
      name,
      members,
      size: n,
      density,
      avgCommunications: members.reduce((sum, m) => sum + m.internalConnections, 0) / n,
      departments,
      keyMembers,
    });
  });

  // Sort by size
  communities.sort((a, b) => b.size - a.size);

  // Calculate modularity (approximation)
  const totalEdges = communityData.reduce(
    (sum, m) => sum + (m.internalConns?.low || 0) + (m.externalConns?.low || 0),
    0
  ) / 2;
  const internalEdges = communityData.reduce(
    (sum, m) => sum + (m.internalConns?.low || 0),
    0
  ) / 2;
  const modularity = totalEdges > 0 ? internalEdges / totalEdges : 0;

  // Stats
  const sizes = communities.map((c) => c.size);

  return {
    communities,
    modularity,
    stats: {
      totalCommunities: communities.length,
      avgCommunitySize: sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0,
      largestCommunity: Math.max(...sizes, 0),
      smallestCommunity: Math.min(...sizes, 0),
      isolatedNodes: communityData.filter(
        (c) => (c.internalConns?.low || 0) === 0 && (c.externalConns?.low || 0) === 0
      ).length,
    },
  };
}

/**
 * Get community for a specific person
 */
export async function getPersonCommunity(
  organizationId: string,
  email: string
): Promise<Community | null> {
  const result = await runQuery<{ communityId: { low: number } | number }>(
    `
    MATCH (p:Person {organizationId: $organizationId, email: $email})
    RETURN p.communityId as communityId
    `,
    { organizationId, email: email.toLowerCase() }
  );

  if (result.length === 0 || result[0].communityId === null) return null;

  const allCommunities = await readCommunities(organizationId);
  const communityId = typeof result[0].communityId === 'object'
    ? result[0].communityId.low
    : result[0].communityId;

  return allCommunities.communities.find((c) => c.id === String(communityId)) || null;
}

/**
 * Find bridges between communities
 */
export async function findCommunityBridges(
  organizationId: string
): Promise<Array<{
  email: string;
  displayName?: string;
  communities: string[];
  bridgeStrength: number;
}>> {
  const result = await runQuery<{
    email: string;
    displayName: string;
    connectedCommunities: Array<{ low: number } | number>;
    bridgeCount: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})-[:COMMUNICATES_WITH]-(other:Person)
    WHERE p.communityId IS NOT NULL AND other.communityId IS NOT NULL
      AND p.communityId <> other.communityId
    WITH p, collect(DISTINCT other.communityId) as connectedCommunities, count(DISTINCT other) as bridgeCount
    WHERE size(connectedCommunities) > 1
    RETURN p.email as email, p.displayName as displayName,
           connectedCommunities, bridgeCount
    ORDER BY bridgeCount DESC
    LIMIT 50
    `,
    { organizationId }
  );

  return result.map((r) => ({
    email: r.email,
    displayName: r.displayName,
    communities: r.connectedCommunities.map((c) =>
      String(typeof c === 'object' ? c.low : c)
    ),
    bridgeStrength: r.bridgeCount?.low || 0,
  }));
}

export default {
  detectCommunities,
  getPersonCommunity,
  findCommunityBridges,
};
