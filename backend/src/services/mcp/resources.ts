/**
 * MCP Resource Providers (T056)
 * Provides access to organizational resources for AI assistants
 */

import { runQuery } from '../../graph/connection.js';
import { logger } from '../../lib/logger.js';
import type { McpResource, McpContent } from '../../lib/mcp-types.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Resource URI patterns
 */
export const RESOURCE_URI_PATTERNS = {
  PROCESS: 'foundry://processes/{id}',
  PERSON: 'foundry://people/{id}',
  DOCUMENT: 'foundry://documents/{id}',
  ORGANIZATION: 'foundry://organization',
};

/**
 * Resource definition
 */
export interface McpResourceDefinition extends McpResource {
  handler: (tenantId: string, params: Record<string, string>) => Promise<McpContent[]>;
}

/**
 * Parse resource URI to extract type and params
 */
export function parseResourceUri(uri: string): { type: string; params: Record<string, string> } | null {
  if (!uri.startsWith('foundry://')) {
    return null;
  }

  const path = uri.slice('foundry://'.length);
  const parts = path.split('/');

  if (parts.length === 0) {
    return null;
  }

  const type = parts[0];
  const params: Record<string, string> = {};

  if (parts.length > 1) {
    params.id = parts[1];
  }

  return { type, params };
}

/**
 * List available resources for a tenant
 */
export async function listResources(tenantId: string): Promise<McpResource[]> {
  const resources: McpResource[] = [];

  // Add organization resource
  resources.push({
    uri: 'foundry://organization',
    name: 'Organization Overview',
    description: 'Overview of the organization including key metrics',
    mimeType: 'application/json',
  });

  // Add process resources
  const processQuery = `
    MATCH (p:Process)
    WHERE p.tenantId = $tenantId
    RETURN p.id as id, p.name as name
    ORDER BY p.name
    LIMIT 100
  `;
  const processResult = await runQuery(processQuery, { tenantId });

  for (const record of processResult.records) {
    resources.push({
      uri: `foundry://processes/${record.get('id')}`,
      name: record.get('name'),
      description: `Business process: ${record.get('name')}`,
      mimeType: 'application/json',
    });
  }

  // Add people resources (key individuals)
  const peopleQuery = `
    MATCH (p:Person)
    WHERE p.tenantId = $tenantId
    RETURN p.id as id, p.name as name, p.title as title
    ORDER BY p.name
    LIMIT 100
  `;
  const peopleResult = await runQuery(peopleQuery, { tenantId });

  for (const record of peopleResult.records) {
    resources.push({
      uri: `foundry://people/${record.get('id')}`,
      name: record.get('name'),
      description: record.get('title') || 'Organization member',
      mimeType: 'application/json',
    });
  }

  return resources;
}

/**
 * Get resource content by URI
 */
export async function getResource(
  uri: string,
  tenantId: string
): Promise<McpContent[] | null> {
  const parsed = parseResourceUri(uri);

  if (!parsed) {
    return null;
  }

  const { type, params } = parsed;

  switch (type) {
    case 'organization':
      return getOrganizationResource(tenantId);

    case 'processes':
      if (!params.id) return null;
      return getProcessResource(params.id, tenantId);

    case 'people':
      if (!params.id) return null;
      return getPersonResource(params.id, tenantId);

    case 'documents':
      if (!params.id) return null;
      return getDocumentResource(params.id, tenantId);

    default:
      return null;
  }
}

/**
 * Get organization overview resource
 */
async function getOrganizationResource(tenantId: string): Promise<McpContent[]> {
  // Get organization stats
  const [
    processCount,
    personCount,
    documentCount,
  ] = await Promise.all([
    runQuery('MATCH (p:Process) WHERE p.tenantId = $tenantId RETURN count(p) as count', { tenantId })
      .then((r) => r.records[0]?.get('count')?.toNumber() || 0),
    runQuery('MATCH (p:Person) WHERE p.tenantId = $tenantId RETURN count(p) as count', { tenantId })
      .then((r) => r.records[0]?.get('count')?.toNumber() || 0),
    prisma.embedding.count({
      where: { tenantId, sourceType: 'DOCUMENT', chunkIndex: 0 },
    }),
  ]);

  // Get recent activity
  const recentActivity = await prisma.embedding.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { sourceType: true, createdAt: true },
  });

  const content = {
    overview: {
      processesDiscovered: processCount,
      peopleInNetwork: personCount,
      documentsIndexed: documentCount,
    },
    recentActivity: recentActivity.map((a) => ({
      type: a.sourceType,
      timestamp: a.createdAt.toISOString(),
    })),
  };

  return [
    {
      type: 'text',
      text: JSON.stringify(content, null, 2),
      mimeType: 'application/json',
    },
  ];
}

/**
 * Get process resource
 */
async function getProcessResource(
  processId: string,
  tenantId: string
): Promise<McpContent[]> {
  const query = `
    MATCH (p:Process {id: $processId})
    WHERE p.tenantId = $tenantId
    OPTIONAL MATCH (p)-[:HAS_STEP]->(s:Step)
    OPTIONAL MATCH (p)-[:INVOLVES]->(person:Person)
    RETURN p,
           collect(DISTINCT {id: s.id, name: s.name, order: s.order, avgDuration: s.avgDuration}) as steps,
           collect(DISTINCT {id: person.id, name: person.name, role: person.role}) as participants
  `;

  const result = await runQuery(query, { processId, tenantId });

  if (result.records.length === 0) {
    return [{ type: 'text', text: 'Process not found' }];
  }

  const record = result.records[0];
  const process = record.get('p').properties;
  const steps = record.get('steps').filter((s: any) => s.id);
  const participants = record.get('participants').filter((p: any) => p.id);

  const content = {
    id: process.id,
    name: process.name,
    description: process.description,
    metrics: {
      instanceCount: process.instanceCount,
      avgDuration: process.avgDuration,
      successRate: process.successRate,
    },
    steps: steps.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)),
    participants,
  };

  return [
    {
      type: 'text',
      text: JSON.stringify(content, null, 2),
      mimeType: 'application/json',
    },
  ];
}

/**
 * Get person resource
 */
async function getPersonResource(
  personId: string,
  tenantId: string
): Promise<McpContent[]> {
  const query = `
    MATCH (p:Person {id: $personId})
    WHERE p.tenantId = $tenantId
    OPTIONAL MATCH (p)-[e:HAS_EXPERTISE]->(exp:Expertise)
    OPTIONAL MATCH (p)-[:REPORTS_TO]->(manager:Person)
    OPTIONAL MATCH (p)<-[:REPORTS_TO]-(report:Person)
    RETURN p,
           collect(DISTINCT {name: exp.name, category: exp.category, confidence: e.confidence}) as expertise,
           manager,
           collect(DISTINCT {id: report.id, name: report.name}) as directReports
  `;

  const result = await runQuery(query, { personId, tenantId });

  if (result.records.length === 0) {
    return [{ type: 'text', text: 'Person not found' }];
  }

  const record = result.records[0];
  const person = record.get('p').properties;
  const expertise = record.get('expertise').filter((e: any) => e.name);
  const manager = record.get('manager')?.properties;
  const directReports = record.get('directReports').filter((r: any) => r.id);

  const content = {
    id: person.id,
    name: person.name,
    email: person.email,
    title: person.title,
    department: person.department,
    expertise,
    manager: manager ? { id: manager.id, name: manager.name } : null,
    directReports,
  };

  return [
    {
      type: 'text',
      text: JSON.stringify(content, null, 2),
      mimeType: 'application/json',
    },
  ];
}

/**
 * Get document resource
 */
async function getDocumentResource(
  documentId: string,
  tenantId: string
): Promise<McpContent[]> {
  // Get all chunks for this document
  const embeddings = await prisma.embedding.findMany({
    where: {
      sourceId: documentId,
      tenantId,
    },
    orderBy: { chunkIndex: 'asc' },
  });

  if (embeddings.length === 0) {
    return [{ type: 'text', text: 'Document not found' }];
  }

  const content = {
    id: documentId,
    chunks: embeddings.length,
    metadata: embeddings[0].metadata,
    preview: embeddings.slice(0, 3).map((e) => e.contentPreview).join('\n\n'),
  };

  return [
    {
      type: 'text',
      text: JSON.stringify(content, null, 2),
      mimeType: 'application/json',
    },
  ];
}

/**
 * Subscribe to resource updates
 */
export function subscribeToResource(
  uri: string,
  callback: (content: McpContent[]) => void
): () => void {
  // For now, return a no-op unsubscribe function
  // In production, this would set up real-time subscriptions
  logger.debug({ uri }, 'Resource subscription requested');

  return () => {
    logger.debug({ uri }, 'Resource subscription cancelled');
  };
}
