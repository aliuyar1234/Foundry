/**
 * Knowledge Graph Enrichment Service (T107-T111)
 * AI-powered knowledge graph enrichment and relationship discovery
 */

import { logger } from '../../lib/logger.js';
import { getAnthropicClient } from '../../lib/anthropic.js';
import { getNeo4jDriver } from '../../lib/neo4j.js';
import { getEmbeddingService } from '../vector/embedding.service.js';
import { getQdrantService } from '../vector/qdrant.service.js';

/**
 * Relationship discovery result
 */
export interface DiscoveredRelationship {
  sourceType: string;
  sourceId: string;
  sourceName: string;
  targetType: string;
  targetId: string;
  targetName: string;
  relationshipType: string;
  confidence: number;
  evidence: string[];
  metadata: Record<string, unknown>;
}

/**
 * Entity enrichment result
 */
export interface EnrichedEntity {
  type: string;
  id: string;
  name: string;
  discoveredProperties: Record<string, unknown>;
  discoveredRelationships: DiscoveredRelationship[];
  enrichmentSource: string;
  confidence: number;
}

/**
 * Expertise mapping result
 */
export interface ExpertiseMapping {
  personId: string;
  personName: string;
  expertise: ExpertiseArea[];
  inferredFrom: string[];
}

/**
 * Expertise area
 */
export interface ExpertiseArea {
  domain: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  confidence: number;
  evidence: string[];
}

/**
 * Graph enrichment service
 */
export class EnrichmentService {
  private static instance: EnrichmentService;

  private constructor() {}

  static getInstance(): EnrichmentService {
    if (!EnrichmentService.instance) {
      EnrichmentService.instance = new EnrichmentService();
    }
    return EnrichmentService.instance;
  }

  /**
   * Discover relationships between entities
   */
  async discoverRelationships(
    tenantId: string,
    options: {
      entityTypes?: string[];
      minConfidence?: number;
      limit?: number;
    } = {}
  ): Promise<DiscoveredRelationship[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    const discovered: DiscoveredRelationship[] = [];

    try {
      // Get entities without many connections
      const entityTypes = options.entityTypes || ['Person', 'Process', 'Document'];

      for (const entityType of entityTypes) {
        // Find entities with few relationships
        const result = await session.run(
          `
          MATCH (e:${entityType})
          WHERE e.tenantId = $tenantId
          OPTIONAL MATCH (e)-[r]-()
          WITH e, count(r) as relCount
          WHERE relCount < 3
          RETURN e.id as id, e.name as name
          LIMIT $limit
          `,
          { tenantId, limit: options.limit || 20 }
        );

        for (const record of result.records) {
          const entityId = record.get('id');
          const entityName = record.get('name');

          // Find potential relationships using vector similarity
          const relationships = await this.findPotentialRelationships(
            entityType,
            entityId,
            entityName,
            tenantId
          );

          discovered.push(
            ...relationships.filter(
              (r) => r.confidence >= (options.minConfidence || 0.6)
            )
          );
        }
      }

      logger.info(
        { tenantId, discoveredCount: discovered.length },
        'Discovered potential relationships'
      );

      return discovered;
    } finally {
      await session.close();
    }
  }

  /**
   * Enrich an entity with additional information
   */
  async enrichEntity(
    entityType: string,
    entityId: string,
    tenantId: string
  ): Promise<EnrichedEntity | null> {
    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      // Get current entity data
      const result = await session.run(
        `
        MATCH (e:${entityType} {id: $entityId, tenantId: $tenantId})
        RETURN e
        `,
        { entityId, tenantId }
      );

      if (result.records.length === 0) {
        return null;
      }

      const entity = result.records[0].get('e').properties;

      // Find related content using vector search
      const embeddingService = getEmbeddingService();
      const qdrantService = getQdrantService();

      const searchText = `${entity.name} ${entity.description || ''}`;
      const embedding = await embeddingService.generateEmbedding(searchText);

      const similarContent = await qdrantService.search('events', embedding, 20, {
        tenantId,
      });

      // Use AI to extract additional information
      const client = getAnthropicClient();

      const contentSummary = similarContent
        .slice(0, 10)
        .map((r) => r.payload?.content || '')
        .join('\n\n');

      const prompt = `Analyze this content to enrich our knowledge about "${entity.name}" (${entityType}):

Entity Information:
${JSON.stringify(entity, null, 2)}

Related Content:
${contentSummary}

Extract:
1. Additional properties that could be added to this entity
2. Potential relationships to other entities mentioned
3. Expertise areas (if this is a Person)

Return as JSON:
{
  "discoveredProperties": {"key": "value"},
  "relationships": [{"targetType": "...", "targetName": "...", "relationshipType": "...", "evidence": "..."}],
  "expertise": [{"domain": "...", "level": "...", "evidence": "..."}]
}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return null;
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const enrichment = JSON.parse(jsonMatch[0]);

      const discoveredRelationships: DiscoveredRelationship[] = (
        enrichment.relationships || []
      ).map((r: Record<string, unknown>) => ({
        sourceType: entityType,
        sourceId: entityId,
        sourceName: entity.name,
        targetType: r.targetType as string,
        targetId: '',
        targetName: r.targetName as string,
        relationshipType: r.relationshipType as string,
        confidence: 0.7,
        evidence: [r.evidence as string],
        metadata: {},
      }));

      return {
        type: entityType,
        id: entityId,
        name: entity.name,
        discoveredProperties: enrichment.discoveredProperties || {},
        discoveredRelationships,
        enrichmentSource: 'ai-analysis',
        confidence: 0.75,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Apply enrichment to the graph
   */
  async applyEnrichment(enrichment: EnrichedEntity): Promise<void> {
    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      // Update entity properties
      if (Object.keys(enrichment.discoveredProperties).length > 0) {
        const setClause = Object.keys(enrichment.discoveredProperties)
          .map((key) => `e.${key} = $props.${key}`)
          .join(', ');

        await session.run(
          `
          MATCH (e:${enrichment.type} {id: $entityId})
          SET ${setClause}, e.enrichedAt = datetime()
          `,
          { entityId: enrichment.id, props: enrichment.discoveredProperties }
        );
      }

      // Create discovered relationships
      for (const rel of enrichment.discoveredRelationships) {
        // Try to find or create target entity
        await session.run(
          `
          MATCH (source:${rel.sourceType} {id: $sourceId})
          MERGE (target:${rel.targetType} {name: $targetName})
          ON CREATE SET target.id = randomUUID(), target.createdAt = datetime()
          MERGE (source)-[r:${rel.relationshipType}]->(target)
          SET r.confidence = $confidence,
              r.evidence = $evidence,
              r.discoveredAt = datetime()
          `,
          {
            sourceId: rel.sourceId,
            targetName: rel.targetName,
            confidence: rel.confidence,
            evidence: rel.evidence,
          }
        );
      }

      logger.info(
        {
          entityType: enrichment.type,
          entityId: enrichment.id,
          propertiesAdded: Object.keys(enrichment.discoveredProperties).length,
          relationshipsAdded: enrichment.discoveredRelationships.length,
        },
        'Applied enrichment to graph'
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Map expertise for people in the organization
   */
  async mapExpertise(tenantId: string): Promise<ExpertiseMapping[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    const mappings: ExpertiseMapping[] = [];

    try {
      // Get all people
      const result = await session.run(
        `
        MATCH (p:Person)
        WHERE p.tenantId = $tenantId
        OPTIONAL MATCH (p)-[:OWNS|PARTICIPATES_IN]->(proc:Process)
        OPTIONAL MATCH (p)-[:AUTHORED|REVIEWED]->(doc:Document)
        RETURN p.id as personId, p.name as personName,
               collect(DISTINCT proc.name) as processes,
               collect(DISTINCT doc.title) as documents
        `,
        { tenantId }
      );

      const client = getAnthropicClient();

      for (const record of result.records) {
        const personId = record.get('personId');
        const personName = record.get('personName');
        const processes = record.get('processes');
        const documents = record.get('documents');

        // Use AI to infer expertise
        const prompt = `Based on this person's involvement, infer their areas of expertise:

Person: ${personName}
Processes they own or participate in: ${processes.join(', ') || 'None'}
Documents they've authored or reviewed: ${documents.join(', ') || 'None'}

Infer their expertise areas with confidence levels.
Return as JSON:
{
  "expertise": [
    {"domain": "area name", "level": "beginner|intermediate|advanced|expert", "confidence": 0.0-1.0, "evidence": ["reason"]}
  ]
}`;

        try {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
          });

          const content = response.content[0];
          if (content.type === 'text') {
            const jsonMatch = content.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              mappings.push({
                personId,
                personName,
                expertise: parsed.expertise || [],
                inferredFrom: [...processes, ...documents],
              });
            }
          }
        } catch (error) {
          logger.error({ error, personId }, 'Failed to map expertise for person');
        }
      }

      return mappings;
    } finally {
      await session.close();
    }
  }

  /**
   * Apply expertise mappings to the graph
   */
  async applyExpertiseMappings(mappings: ExpertiseMapping[]): Promise<void> {
    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      for (const mapping of mappings) {
        for (const expertise of mapping.expertise) {
          await session.run(
            `
            MATCH (p:Person {id: $personId})
            MERGE (e:Expertise {domain: $domain})
            MERGE (p)-[r:HAS_EXPERTISE]->(e)
            SET r.level = $level,
                r.confidence = $confidence,
                r.evidence = $evidence,
                r.updatedAt = datetime()
            `,
            {
              personId: mapping.personId,
              domain: expertise.domain,
              level: expertise.level,
              confidence: expertise.confidence,
              evidence: expertise.evidence,
            }
          );
        }
      }

      logger.info(
        { mappingCount: mappings.length },
        'Applied expertise mappings to graph'
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Find clusters in the knowledge graph
   */
  async findClusters(
    tenantId: string,
    options: { minSize?: number } = {}
  ): Promise<Array<{ nodes: string[]; theme: string; strength: number }>> {
    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      // Find densely connected subgraphs
      const result = await session.run(
        `
        MATCH (n)-[r]-(m)
        WHERE n.tenantId = $tenantId
        WITH n, collect(DISTINCT m) as neighbors
        WHERE size(neighbors) >= $minSize
        RETURN n.id as nodeId, n.name as nodeName, labels(n)[0] as nodeType,
               [x IN neighbors | {id: x.id, name: x.name, type: labels(x)[0]}] as neighbors
        `,
        { tenantId, minSize: options.minSize || 3 }
      );

      // Group into clusters
      const clusters: Map<
        string,
        { nodes: Set<string>; nodeNames: string[] }
      > = new Map();

      result.records.forEach((record) => {
        const nodeId = record.get('nodeId');
        const nodeName = record.get('nodeName');
        const neighbors = record.get('neighbors') as Array<{
          id: string;
          name: string;
        }>;

        const neighborIds = neighbors.map((n) => n.id);
        const clusterKey = [nodeId, ...neighborIds].sort().join(',');

        if (!clusters.has(clusterKey)) {
          clusters.set(clusterKey, {
            nodes: new Set([nodeId, ...neighborIds]),
            nodeNames: [nodeName, ...neighbors.map((n) => n.name)],
          });
        }
      });

      // Use AI to identify themes
      const client = getAnthropicClient();
      const clusterResults: Array<{
        nodes: string[];
        theme: string;
        strength: number;
      }> = [];

      for (const [, cluster] of clusters) {
        const prompt = `What theme or topic connects these entities: ${cluster.nodeNames.join(', ')}?
Return a single phrase describing the common theme.`;

        try {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [{ role: 'user', content: prompt }],
          });

          const content = response.content[0];
          const theme =
            content.type === 'text' ? content.text.trim() : 'Unknown theme';

          clusterResults.push({
            nodes: Array.from(cluster.nodes),
            theme,
            strength: cluster.nodes.size / 10,
          });
        } catch {
          clusterResults.push({
            nodes: Array.from(cluster.nodes),
            theme: 'Related entities',
            strength: cluster.nodes.size / 10,
          });
        }
      }

      return clusterResults;
    } finally {
      await session.close();
    }
  }

  /**
   * Get graph statistics
   */
  async getGraphStats(tenantId: string): Promise<Record<string, unknown>> {
    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      const result = await session.run(
        `
        MATCH (n)
        WHERE n.tenantId = $tenantId
        WITH labels(n)[0] as nodeType, count(n) as nodeCount
        RETURN collect({type: nodeType, count: nodeCount}) as nodeCounts
        `,
        { tenantId }
      );

      const nodeCounts = result.records[0]?.get('nodeCounts') || [];

      const relResult = await session.run(
        `
        MATCH (n)-[r]->(m)
        WHERE n.tenantId = $tenantId
        WITH type(r) as relType, count(r) as relCount
        RETURN collect({type: relType, count: relCount}) as relCounts
        `
      );

      const relCounts = relResult.records[0]?.get('relCounts') || [];

      return {
        nodes: nodeCounts.reduce(
          (acc: Record<string, number>, n: { type: string; count: number }) => {
            acc[n.type] = n.count;
            return acc;
          },
          {}
        ),
        relationships: relCounts.reduce(
          (acc: Record<string, number>, r: { type: string; count: number }) => {
            acc[r.type] = r.count;
            return acc;
          },
          {}
        ),
        lastUpdated: new Date().toISOString(),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Find potential relationships using vector similarity
   */
  private async findPotentialRelationships(
    entityType: string,
    entityId: string,
    entityName: string,
    tenantId: string
  ): Promise<DiscoveredRelationship[]> {
    const embeddingService = getEmbeddingService();
    const qdrantService = getQdrantService();

    const embedding = await embeddingService.generateEmbedding(entityName);

    // Search across different collections
    const collections = ['events', 'documents', 'decisions'];
    const discovered: DiscoveredRelationship[] = [];

    for (const collection of collections) {
      try {
        const results = await qdrantService.search(collection, embedding, 5, {
          tenantId,
        });

        for (const result of results) {
          if (result.score > 0.7 && result.payload?.sourceId !== entityId) {
            discovered.push({
              sourceType: entityType,
              sourceId: entityId,
              sourceName: entityName,
              targetType: result.payload?.sourceType as string || 'Unknown',
              targetId: result.payload?.sourceId as string || '',
              targetName: (result.payload?.title as string) || 'Unknown',
              relationshipType: 'RELATED_TO',
              confidence: result.score,
              evidence: [`Vector similarity: ${(result.score * 100).toFixed(1)}%`],
              metadata: { collection },
            });
          }
        }
      } catch (error) {
        logger.debug({ error, collection }, 'Collection search failed (may not exist)');
      }
    }

    return discovered;
  }
}

/**
 * Get singleton instance
 */
export function getEnrichmentService(): EnrichmentService {
  return EnrichmentService.getInstance();
}
