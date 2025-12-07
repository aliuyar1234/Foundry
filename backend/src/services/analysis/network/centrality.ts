/**
 * Centrality Calculations Service
 * Implements degree, betweenness, and closeness centrality
 * T232 - Centrality calculations (degree, betweenness, closeness)
 */

import { runQuery, runWriteTransaction } from '../../../graph/connection.js';

export interface CentralityScores {
  email: string;
  displayName?: string;
  department?: string;
  degreeCentrality: number;
  inDegreeCentrality: number;
  outDegreeCentrality: number;
  betweennessCentrality: number;
  closenessCentrality: number;
  eigenvectorCentrality: number;
  pageRank: number;
}

export interface CentralityResult {
  persons: CentralityScores[];
  stats: {
    avgDegreeCentrality: number;
    avgBetweennessCentrality: number;
    avgClosenessCentrality: number;
    maxDegreeCentrality: number;
    maxBetweennessCentrality: number;
    maxClosenessCentrality: number;
  };
}

/**
 * Calculate degree centrality for all persons
 * Degree centrality = number of connections / (n-1)
 */
export async function calculateDegreeCentrality(
  organizationId: string
): Promise<Array<{ email: string; degree: number; inDegree: number; outDegree: number; centrality: number }>> {
  // First get total node count for normalization
  const countResult = await runQuery<{ count: { low: number } }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    RETURN count(p) as count
    `,
    { organizationId }
  );
  const totalNodes = countResult[0]?.count?.low || 1;
  const maxDegree = totalNodes - 1;

  const results = await runQuery<{
    email: string;
    displayName: string;
    outDegree: { low: number };
    inDegree: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[out:COMMUNICATES_WITH]->(:Person)
    OPTIONAL MATCH (:Person)-[inc:COMMUNICATES_WITH]->(p)
    WITH p, count(DISTINCT out) as outDegree, count(DISTINCT inc) as inDegree
    RETURN p.email as email, p.displayName as displayName, outDegree, inDegree
    ORDER BY (outDegree + inDegree) DESC
    `,
    { organizationId }
  );

  return results.map((r) => {
    const outDeg = r.outDegree?.low || 0;
    const inDeg = r.inDegree?.low || 0;
    const totalDegree = outDeg + inDeg;
    return {
      email: r.email,
      degree: totalDegree,
      inDegree: inDeg,
      outDegree: outDeg,
      centrality: maxDegree > 0 ? totalDegree / maxDegree : 0,
    };
  });
}

/**
 * Calculate betweenness centrality
 * Measures how often a node lies on the shortest path between other nodes
 * Uses Neo4j GDS if available, otherwise approximation
 */
export async function calculateBetweennessCentrality(
  organizationId: string
): Promise<Array<{ email: string; betweenness: number }>> {
  try {
    // Try using Neo4j GDS (Graph Data Science)
    const results = await runQuery<{
      email: string;
      score: number;
    }>(
      `
      CALL gds.betweenness.stream({
        nodeQuery: 'MATCH (p:Person {organizationId: "${organizationId}"}) RETURN id(p) AS id',
        relationshipQuery: 'MATCH (p1:Person {organizationId: "${organizationId}"})-[r:COMMUNICATES_WITH]->(p2:Person) RETURN id(p1) AS source, id(p2) AS target, r.totalCount AS weight'
      })
      YIELD nodeId, score
      MATCH (p:Person) WHERE id(p) = nodeId
      RETURN p.email as email, score
      ORDER BY score DESC
      `,
      {}
    );
    return results;
  } catch {
    // Fallback: Approximate betweenness using sampling
    return approximateBetweennessCentrality(organizationId);
  }
}

/**
 * Approximate betweenness centrality using random sampling
 */
async function approximateBetweennessCentrality(
  organizationId: string
): Promise<Array<{ email: string; betweenness: number }>> {
  // Get all persons
  const persons = await runQuery<{ email: string }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    RETURN p.email as email
    `,
    { organizationId }
  );

  const betweennessMap = new Map<string, number>();
  persons.forEach((p) => betweennessMap.set(p.email, 0));

  // Sample shortest paths between random pairs
  const sampleSize = Math.min(100, persons.length * 2);

  for (let i = 0; i < sampleSize; i++) {
    const source = persons[Math.floor(Math.random() * persons.length)].email;
    const target = persons[Math.floor(Math.random() * persons.length)].email;

    if (source === target) continue;

    const pathResult = await runQuery<{ path: Array<{ email: string }> }>(
      `
      MATCH (start:Person {organizationId: $organizationId, email: $source}),
            (end:Person {organizationId: $organizationId, email: $target}),
            path = shortestPath((start)-[:COMMUNICATES_WITH*]-(end))
      UNWIND nodes(path) as node
      RETURN collect(node.email) as path
      `,
      { organizationId, source, target }
    ).catch(() => []);

    if (pathResult.length > 0 && pathResult[0].path) {
      const pathNodes = pathResult[0].path;
      // Intermediate nodes get betweenness credit
      for (let j = 1; j < pathNodes.length - 1; j++) {
        const current = betweennessMap.get(pathNodes[j]) || 0;
        betweennessMap.set(pathNodes[j], current + 1);
      }
    }
  }

  // Normalize by sample size
  const results: Array<{ email: string; betweenness: number }> = [];
  betweennessMap.forEach((value, email) => {
    results.push({ email, betweenness: value / sampleSize });
  });

  return results.sort((a, b) => b.betweenness - a.betweenness);
}

/**
 * Calculate closeness centrality
 * Measures average shortest path distance to all other nodes
 */
export async function calculateClosenessCentrality(
  organizationId: string
): Promise<Array<{ email: string; closeness: number }>> {
  try {
    // Try using Neo4j GDS
    const results = await runQuery<{
      email: string;
      score: number;
    }>(
      `
      CALL gds.closeness.stream({
        nodeQuery: 'MATCH (p:Person {organizationId: "${organizationId}"}) RETURN id(p) AS id',
        relationshipQuery: 'MATCH (p1:Person {organizationId: "${organizationId}"})-[r:COMMUNICATES_WITH]->(p2:Person) RETURN id(p1) AS source, id(p2) AS target'
      })
      YIELD nodeId, score
      MATCH (p:Person) WHERE id(p) = nodeId
      RETURN p.email as email, score
      ORDER BY score DESC
      `,
      {}
    );
    return results.map((r) => ({ email: r.email, closeness: r.score }));
  } catch {
    // Fallback: Calculate manually for smaller networks
    return approximateClosenessCentrality(organizationId);
  }
}

/**
 * Approximate closeness centrality
 */
async function approximateClosenessCentrality(
  organizationId: string
): Promise<Array<{ email: string; closeness: number }>> {
  const persons = await runQuery<{ email: string }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    RETURN p.email as email
    `,
    { organizationId }
  );

  const results: Array<{ email: string; closeness: number }> = [];

  for (const person of persons) {
    // Get average shortest path length from this person to all others
    const pathResult = await runQuery<{ avgDistance: number }>(
      `
      MATCH (start:Person {organizationId: $organizationId, email: $email})
      MATCH (end:Person {organizationId: $organizationId})
      WHERE start <> end
      MATCH path = shortestPath((start)-[:COMMUNICATES_WITH*]-(end))
      WITH length(path) as distance
      RETURN avg(distance) as avgDistance
      `,
      { organizationId, email: person.email }
    ).catch(() => [{ avgDistance: null }]);

    const avgDistance = pathResult[0]?.avgDistance;
    // Closeness = 1 / average distance (or 0 if unreachable)
    const closeness = avgDistance && avgDistance > 0 ? 1 / avgDistance : 0;
    results.push({ email: person.email, closeness });
  }

  return results.sort((a, b) => b.closeness - a.closeness);
}

/**
 * Calculate PageRank for the network
 */
export async function calculatePageRank(
  organizationId: string,
  dampingFactor: number = 0.85,
  iterations: number = 20
): Promise<Array<{ email: string; pageRank: number }>> {
  try {
    // Try using Neo4j GDS
    const results = await runQuery<{
      email: string;
      score: number;
    }>(
      `
      CALL gds.pageRank.stream({
        nodeQuery: 'MATCH (p:Person {organizationId: "${organizationId}"}) RETURN id(p) AS id',
        relationshipQuery: 'MATCH (p1:Person {organizationId: "${organizationId}"})-[r:COMMUNICATES_WITH]->(p2:Person) RETURN id(p1) AS source, id(p2) AS target, r.totalCount AS weight',
        dampingFactor: ${dampingFactor},
        maxIterations: ${iterations}
      })
      YIELD nodeId, score
      MATCH (p:Person) WHERE id(p) = nodeId
      RETURN p.email as email, score
      ORDER BY score DESC
      `,
      {}
    );
    return results.map((r) => ({ email: r.email, pageRank: r.score }));
  } catch {
    // Fallback: Simple PageRank implementation
    return approximatePageRank(organizationId, dampingFactor, iterations);
  }
}

/**
 * Approximate PageRank using power iteration
 */
async function approximatePageRank(
  organizationId: string,
  dampingFactor: number,
  iterations: number
): Promise<Array<{ email: string; pageRank: number }>> {
  // Get all nodes and edges
  const nodes = await runQuery<{ email: string }>(
    `MATCH (p:Person {organizationId: $organizationId}) RETURN p.email as email`,
    { organizationId }
  );

  const edges = await runQuery<{ source: string; target: string; weight: { low: number } }>(
    `
    MATCH (from:Person {organizationId: $organizationId})-[r:COMMUNICATES_WITH]->(to:Person)
    RETURN from.email as source, to.email as target, r.totalCount as weight
    `,
    { organizationId }
  );

  const n = nodes.length;
  if (n === 0) return [];

  // Initialize PageRank
  const pr = new Map<string, number>();
  const outLinks = new Map<string, Array<{ target: string; weight: number }>>();

  nodes.forEach((node) => {
    pr.set(node.email, 1 / n);
    outLinks.set(node.email, []);
  });

  edges.forEach((edge) => {
    const links = outLinks.get(edge.source) || [];
    links.push({ target: edge.target, weight: edge.weight?.low || 1 });
    outLinks.set(edge.source, links);
  });

  // Power iteration
  for (let iter = 0; iter < iterations; iter++) {
    const newPr = new Map<string, number>();

    nodes.forEach((node) => {
      newPr.set(node.email, (1 - dampingFactor) / n);
    });

    nodes.forEach((node) => {
      const links = outLinks.get(node.email) || [];
      const totalWeight = links.reduce((sum, l) => sum + l.weight, 0);

      if (totalWeight > 0) {
        const currentPr = pr.get(node.email) || 0;
        links.forEach((link) => {
          const contribution = dampingFactor * currentPr * (link.weight / totalWeight);
          newPr.set(link.target, (newPr.get(link.target) || 0) + contribution);
        });
      }
    });

    // Update PR values
    newPr.forEach((value, key) => pr.set(key, value));
  }

  const results: Array<{ email: string; pageRank: number }> = [];
  pr.forEach((value, email) => results.push({ email, pageRank: value }));

  return results.sort((a, b) => b.pageRank - a.pageRank);
}

/**
 * Calculate all centrality metrics for an organization
 */
export async function calculateAllCentralityMetrics(
  organizationId: string
): Promise<CentralityResult> {
  // Calculate all metrics in parallel
  const [degree, betweenness, closeness, pageRank] = await Promise.all([
    calculateDegreeCentrality(organizationId),
    calculateBetweennessCentrality(organizationId),
    calculateClosenessCentrality(organizationId),
    calculatePageRank(organizationId),
  ]);

  // Merge results
  const metricsMap = new Map<string, CentralityScores>();

  degree.forEach((d) => {
    metricsMap.set(d.email, {
      email: d.email,
      degreeCentrality: d.centrality,
      inDegreeCentrality: d.inDegree / Math.max(degree.length - 1, 1),
      outDegreeCentrality: d.outDegree / Math.max(degree.length - 1, 1),
      betweennessCentrality: 0,
      closenessCentrality: 0,
      eigenvectorCentrality: 0,
      pageRank: 0,
    });
  });

  betweenness.forEach((b) => {
    const existing = metricsMap.get(b.email);
    if (existing) {
      existing.betweennessCentrality = b.betweenness;
    }
  });

  closeness.forEach((c) => {
    const existing = metricsMap.get(c.email);
    if (existing) {
      existing.closenessCentrality = c.closeness;
    }
  });

  pageRank.forEach((p) => {
    const existing = metricsMap.get(p.email);
    if (existing) {
      existing.pageRank = p.pageRank;
    }
  });

  const persons = Array.from(metricsMap.values());

  // Calculate stats
  const stats = {
    avgDegreeCentrality: persons.reduce((sum, p) => sum + p.degreeCentrality, 0) / persons.length || 0,
    avgBetweennessCentrality: persons.reduce((sum, p) => sum + p.betweennessCentrality, 0) / persons.length || 0,
    avgClosenessCentrality: persons.reduce((sum, p) => sum + p.closenessCentrality, 0) / persons.length || 0,
    maxDegreeCentrality: Math.max(...persons.map((p) => p.degreeCentrality), 0),
    maxBetweennessCentrality: Math.max(...persons.map((p) => p.betweennessCentrality), 0),
    maxClosenessCentrality: Math.max(...persons.map((p) => p.closenessCentrality), 0),
  };

  return { persons, stats };
}

/**
 * Store calculated centrality metrics on nodes
 */
export async function storeCentralityMetrics(
  organizationId: string,
  metrics: CentralityResult
): Promise<void> {
  await runWriteTransaction(async (tx) => {
    for (const person of metrics.persons) {
      await tx.run(
        `
        MATCH (p:Person {organizationId: $organizationId, email: $email})
        SET p.degreeCentrality = $degreeCentrality,
            p.betweennessCentrality = $betweennessCentrality,
            p.closenessCentrality = $closenessCentrality,
            p.pageRank = $pageRank,
            p.centralityUpdatedAt = datetime()
        `,
        {
          organizationId,
          email: person.email,
          degreeCentrality: person.degreeCentrality,
          betweennessCentrality: person.betweennessCentrality,
          closenessCentrality: person.closenessCentrality,
          pageRank: person.pageRank,
        }
      );
    }
  });
}

export default {
  calculateDegreeCentrality,
  calculateBetweennessCentrality,
  calculateClosenessCentrality,
  calculatePageRank,
  calculateAllCentralityMetrics,
  storeCentralityMetrics,
};
