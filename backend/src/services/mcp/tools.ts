/**
 * MCP Tool Implementations (T051-T055)
 * Foundry-specific MCP tools for AI assistants
 */

import { PrismaClient } from '@prisma/client';
import { getSearchService } from '../vector/search.service.js';
import { runQuery } from '../../graph/connection.js';
import { logger } from '../../lib/logger.js';
import type { McpTool, McpToolCallResponse, McpContent } from '../../lib/mcp-types.js';
import { FOUNDRY_MCP_TOOLS, FOUNDRY_MCP_SCOPES, TOOL_SCOPE_MAP } from '../../lib/mcp-types.js';

const prisma = new PrismaClient();

/**
 * Tool definitions for MCP protocol
 */
export const MCP_TOOL_DEFINITIONS: McpTool[] = [
  // T051: search_organization
  {
    name: FOUNDRY_MCP_TOOLS.SEARCH_ORGANIZATION,
    description: 'Search across organizational documents, emails, and messages using semantic search',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
        sourceTypes: {
          type: 'array',
          description: 'Filter by source types (DOCUMENT, EMAIL, MESSAGE, MEETING)',
          items: {
            type: 'string',
            enum: ['DOCUMENT', 'EMAIL', 'MESSAGE', 'MEETING'],
          },
        },
      },
      required: ['query'],
    },
  },

  // T052: get_person
  {
    name: FOUNDRY_MCP_TOOLS.GET_PERSON,
    description: 'Get information about a person in the organization including their relationships and expertise',
    inputSchema: {
      type: 'object',
      properties: {
        personId: {
          type: 'string',
          description: 'The ID of the person to look up',
        },
        email: {
          type: 'string',
          description: 'Email address to search for (alternative to personId)',
        },
        includeRelationships: {
          type: 'boolean',
          description: 'Include relationships with other people',
          default: true,
        },
      },
      required: [],
    },
  },

  // T053: get_process
  {
    name: FOUNDRY_MCP_TOOLS.GET_PROCESS,
    description: 'Get details about a discovered business process including steps and metrics',
    inputSchema: {
      type: 'object',
      properties: {
        processId: {
          type: 'string',
          description: 'The ID of the process',
        },
        processName: {
          type: 'string',
          description: 'Search for process by name (alternative to processId)',
        },
        includeMetrics: {
          type: 'boolean',
          description: 'Include process metrics and performance data',
          default: true,
        },
      },
      required: [],
    },
  },

  // T054: list_documents
  {
    name: FOUNDRY_MCP_TOOLS.LIST_DOCUMENTS,
    description: 'List documents in the organization with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by document category',
        },
        authorId: {
          type: 'string',
          description: 'Filter by author ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return',
          default: 20,
          maximum: 100,
        },
        offset: {
          type: 'number',
          description: 'Offset for pagination',
          default: 0,
        },
      },
      required: [],
    },
  },

  // T055: query_graph
  {
    name: FOUNDRY_MCP_TOOLS.QUERY_GRAPH,
    description: 'Execute a read-only Cypher query against the knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Cypher query (must be read-only, no CREATE/DELETE/SET)',
        },
        parameters: {
          type: 'object',
          description: 'Query parameters',
        },
      },
      required: ['query'],
    },
  },

  // analyze_decision (bonus tool)
  {
    name: FOUNDRY_MCP_TOOLS.ANALYZE_DECISION,
    description: 'Analyze the history and context of a specific decision',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The decision topic or question to analyze',
        },
        timeRange: {
          type: 'object',
          description: 'Time range to search within',
          properties: {
            startDate: { type: 'string', description: 'ISO date string' },
            endDate: { type: 'string', description: 'ISO date string' },
          },
        },
      },
      required: ['topic'],
    },
  },
];

/**
 * Tool handler type
 */
type ToolHandler = (
  args: Record<string, unknown>,
  tenantId: string
) => Promise<McpToolCallResponse>;

/**
 * Tool handlers
 */
const toolHandlers: Record<string, ToolHandler> = {
  // T051: search_organization
  [FOUNDRY_MCP_TOOLS.SEARCH_ORGANIZATION]: async (args, tenantId) => {
    const { query, limit = 10, sourceTypes } = args as {
      query: string;
      limit?: number;
      sourceTypes?: string[];
    };

    const searchService = getSearchService();
    const results = await searchService.search(query, tenantId, {
      limit,
      filter: sourceTypes ? { tenantId, sourceTypes: sourceTypes as any } : undefined,
    });

    const content: McpContent[] = results.map((r) => ({
      type: 'text',
      text: JSON.stringify({
        sourceId: r.sourceId,
        sourceType: r.sourceType,
        score: r.score,
        content: r.content,
        metadata: r.metadata,
      }),
    }));

    return {
      content: content.length > 0
        ? content
        : [{ type: 'text', text: 'No results found for your query.' }],
    };
  },

  // T052: get_person
  [FOUNDRY_MCP_TOOLS.GET_PERSON]: async (args, tenantId) => {
    const { personId, email, includeRelationships = true } = args as {
      personId?: string;
      email?: string;
      includeRelationships?: boolean;
    };

    if (!personId && !email) {
      return {
        content: [{ type: 'text', text: 'Please provide either personId or email' }],
        isError: true,
      };
    }

    // Query Neo4j for person
    const matchClause = personId
      ? 'MATCH (p:Person {id: $personId})'
      : 'MATCH (p:Person {email: $email})';

    const personQuery = `
      ${matchClause}
      WHERE p.tenantId = $tenantId
      OPTIONAL MATCH (p)-[r:HAS_EXPERTISE]->(e:Expertise)
      RETURN p, collect(DISTINCT {expertise: e.name, confidence: r.confidence}) as expertise
    `;

    const personResult = await runQuery(personQuery, { personId, email, tenantId });

    if (personResult.records.length === 0) {
      return {
        content: [{ type: 'text', text: 'Person not found' }],
        isError: true,
      };
    }

    const personRecord = personResult.records[0];
    const person = personRecord.get('p').properties;
    const expertise = personRecord.get('expertise');

    let relationships: unknown[] = [];
    if (includeRelationships) {
      const relQuery = `
        ${matchClause}
        WHERE p.tenantId = $tenantId
        MATCH (p)-[r:COMMUNICATES_WITH|REPORTS_TO|COLLABORATES_WITH]-(other:Person)
        RETURN type(r) as relType, other.name as otherName, other.id as otherId
        LIMIT 20
      `;
      const relResult = await runQuery(relQuery, { personId, email, tenantId });
      relationships = relResult.records.map((r) => ({
        type: r.get('relType'),
        personName: r.get('otherName'),
        personId: r.get('otherId'),
      }));
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: person.id,
          name: person.name,
          email: person.email,
          title: person.title,
          department: person.department,
          expertise,
          relationships,
        }, null, 2),
      }],
    };
  },

  // T053: get_process
  [FOUNDRY_MCP_TOOLS.GET_PROCESS]: async (args, tenantId) => {
    const { processId, processName, includeMetrics = true } = args as {
      processId?: string;
      processName?: string;
      includeMetrics?: boolean;
    };

    if (!processId && !processName) {
      return {
        content: [{ type: 'text', text: 'Please provide either processId or processName' }],
        isError: true,
      };
    }

    // Query Neo4j for process
    const matchClause = processId
      ? 'MATCH (p:Process {id: $processId})'
      : 'MATCH (p:Process) WHERE p.name CONTAINS $processName';

    const processQuery = `
      ${matchClause}
      WHERE p.tenantId = $tenantId
      OPTIONAL MATCH (p)-[:HAS_STEP]->(s:Step)
      RETURN p, collect(DISTINCT {name: s.name, order: s.order, avgDuration: s.avgDuration}) as steps
      ORDER BY p.name
      LIMIT 1
    `;

    const processResult = await runQuery(processQuery, { processId, processName, tenantId });

    if (processResult.records.length === 0) {
      return {
        content: [{ type: 'text', text: 'Process not found' }],
        isError: true,
      };
    }

    const processRecord = processResult.records[0];
    const process = processRecord.get('p').properties;
    const steps = processRecord.get('steps');

    const response: Record<string, unknown> = {
      id: process.id,
      name: process.name,
      description: process.description,
      steps: steps.sort((a: any, b: any) => a.order - b.order),
    };

    if (includeMetrics) {
      response.metrics = {
        instanceCount: process.instanceCount,
        avgDuration: process.avgDuration,
        successRate: process.successRate,
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
      }],
    };
  },

  // T054: list_documents
  [FOUNDRY_MCP_TOOLS.LIST_DOCUMENTS]: async (args, tenantId) => {
    const { category, authorId, limit = 20, offset = 0 } = args as {
      category?: string;
      authorId?: string;
      limit?: number;
      offset?: number;
    };

    // Query embeddings table for documents
    const where: Record<string, unknown> = {
      tenantId,
      sourceType: 'DOCUMENT',
      chunkIndex: 0, // Only get first chunk of each document
    };

    const embeddings = await prisma.embedding.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      select: {
        sourceId: true,
        contentPreview: true,
        metadata: true,
        createdAt: true,
      },
    });

    const documents = embeddings.map((e) => ({
      id: e.sourceId,
      preview: e.contentPreview,
      metadata: e.metadata,
      createdAt: e.createdAt,
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          documents,
          count: documents.length,
          offset,
        }, null, 2),
      }],
    };
  },

  // T055: query_graph
  [FOUNDRY_MCP_TOOLS.QUERY_GRAPH]: async (args, tenantId) => {
    const { query, parameters = {} } = args as {
      query: string;
      parameters?: Record<string, unknown>;
    };

    // Validate query is read-only
    const upperQuery = query.toUpperCase();
    const writeKeywords = ['CREATE', 'DELETE', 'SET', 'REMOVE', 'MERGE', 'DROP', 'DETACH'];

    if (writeKeywords.some((kw) => upperQuery.includes(kw))) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Only read-only queries are allowed. Write operations (CREATE, DELETE, SET, REMOVE, MERGE) are not permitted.',
        }],
        isError: true,
      };
    }

    try {
      // Add tenant filter to parameters
      const queryParams = { ...parameters, tenantId };

      const result = await runQuery(query, queryParams);

      const records = result.records.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const key of r.keys) {
          const value = r.get(key);
          // Handle Neo4j types
          if (value && typeof value === 'object' && 'properties' in value) {
            obj[key] = value.properties;
          } else {
            obj[key] = value;
          }
        }
        return obj;
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            records,
            count: records.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Query error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  },

  // analyze_decision
  [FOUNDRY_MCP_TOOLS.ANALYZE_DECISION]: async (args, tenantId) => {
    const { topic, timeRange } = args as {
      topic: string;
      timeRange?: { startDate?: string; endDate?: string };
    };

    // Search for decision-related content
    const searchService = getSearchService();
    const results = await searchService.search(
      `decision about ${topic}`,
      tenantId,
      { limit: 10 }
    );

    // Look for existing decision records
    const decisions = await prisma.decisionRecord.findMany({
      where: {
        tenantId,
        OR: [
          { title: { contains: topic, mode: 'insensitive' } },
          { summary: { contains: topic, mode: 'insensitive' } },
        ],
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          topic,
          existingDecisions: decisions.map((d) => ({
            id: d.id,
            title: d.title,
            summary: d.summary,
            outcome: d.outcome,
            date: d.decisionDate,
            confidence: d.confidenceScore,
          })),
          relatedContent: results.slice(0, 5).map((r) => ({
            sourceId: r.sourceId,
            sourceType: r.sourceType,
            preview: r.content,
            score: r.score,
          })),
        }, null, 2),
      }],
    };
  },
};

/**
 * Execute a tool
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string
): Promise<McpToolCallResponse> {
  const handler = toolHandlers[toolName];

  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  try {
    return await handler(args, tenantId);
  } catch (error) {
    logger.error({ toolName, args, error }, 'MCP tool execution failed');
    return {
      content: [{
        type: 'text',
        text: `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      isError: true,
    };
  }
}

/**
 * Get required scopes for a tool
 */
export function getToolScopes(toolName: string): string[] {
  return TOOL_SCOPE_MAP[toolName] || [];
}

/**
 * List available tools
 */
export function listTools(): McpTool[] {
  return MCP_TOOL_DEFINITIONS;
}
