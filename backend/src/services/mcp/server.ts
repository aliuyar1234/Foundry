/**
 * MCP Server with stdio transport (T057)
 * Implements Model Context Protocol for Claude Desktop and other MCP clients
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../lib/logger.js';
import { listTools, executeTool, getToolScopes } from './tools.js';
import { listResources, getResource } from './resources.js';
import { getMcpSessionService } from './session.service.js';
import { createAuditMiddleware, getMcpAuditService } from './audit.js';

/**
 * Create and configure MCP server
 */
export function createMcpServer(options: {
  sessionId: string;
  userId: string;
  tenantId: string;
}): Server {
  const { sessionId, userId, tenantId } = options;

  const server = new Server(
    {
      name: 'foundry-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  const auditMiddleware = createAuditMiddleware();

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug({ sessionId }, 'MCP: List tools requested');
    return { tools: listTools() };
  });

  // Execute tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info({ sessionId, toolName: name }, 'MCP: Tool call requested');

    // Check session and rate limit
    const sessionService = getMcpSessionService();
    const validation = await sessionService.validateSession(sessionId);

    if (!validation.valid) {
      return {
        content: [{
          type: 'text',
          text: `Session error: ${validation.error}`,
        }],
        isError: true,
      };
    }

    // Check scope
    const requiredScopes = getToolScopes(name);
    const hasRequiredScopes = requiredScopes.every(
      (scope) => validation.session!.scopes.includes(scope) ||
                 validation.session!.scopes.includes('foundry:admin:all')
    );

    if (!hasRequiredScopes) {
      return {
        content: [{
          type: 'text',
          text: `Access denied: Missing required scope for ${name}`,
        }],
        isError: true,
      };
    }

    // Decrement rate limit
    await sessionService.decrementRateLimit(sessionId);

    // Execute with audit logging
    return auditMiddleware(
      sessionId,
      userId,
      tenantId,
      name,
      args as Record<string, unknown>,
      () => executeTool(name, args as Record<string, unknown>, tenantId)
    );
  });

  // List resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.debug({ sessionId }, 'MCP: List resources requested');
    const resources = await listResources(tenantId);
    return { resources };
  });

  // Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    logger.debug({ sessionId, uri }, 'MCP: Read resource requested');

    const content = await getResource(uri, tenantId);

    if (!content) {
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: 'Resource not found',
        }],
      };
    }

    return {
      contents: content.map((c) => ({
        uri,
        mimeType: c.mimeType || 'text/plain',
        text: c.text || '',
      })),
    };
  });

  return server;
}

/**
 * Run MCP server with stdio transport
 */
export async function runMcpStdioServer(options: {
  sessionId: string;
  userId: string;
  tenantId: string;
}): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();

  logger.info({ sessionId: options.sessionId }, 'Starting MCP stdio server');

  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('MCP server shutting down');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('MCP server shutting down');
    await server.close();
    process.exit(0);
  });
}
