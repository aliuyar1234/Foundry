/**
 * MCP HTTP/SSE Server (T058)
 * HTTP-based MCP server for web clients
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../lib/logger.js';
import { listTools, executeTool, getToolScopes } from './tools.js';
import { listResources, getResource } from './resources.js';
import { getMcpSessionService } from './session.service.js';
import { createAuditMiddleware } from './audit.js';
import { createMcpAuthMiddleware, McpAuthenticatedRequest } from './auth.js';
import { createRateLimitMiddleware } from './ratelimit.js';
import type { McpServerInfo, McpServerCapabilities, McpToolCallRequest } from '../../lib/mcp-types.js';

/**
 * Server info response
 */
const SERVER_INFO: McpServerInfo = {
  name: 'foundry-mcp-http-server',
  version: '1.0.0',
  capabilities: {
    tools: true,
    resources: true,
    prompts: false,
  },
};

/**
 * Register MCP HTTP routes
 */
export async function mcpHttpRoutes(fastify: FastifyInstance): Promise<void> {
  const auditMiddleware = createAuditMiddleware();
  const authMiddleware = createMcpAuthMiddleware();
  const rateLimitMiddleware = createRateLimitMiddleware();

  /**
   * Get server info
   * GET /mcp/info
   */
  fastify.get('/info', async (request, reply) => {
    return reply.send(SERVER_INFO);
  });

  /**
   * List tools
   * GET /mcp/tools
   */
  fastify.get(
    '/tools',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tools = listTools();
      return reply.send({ tools });
    }
  );

  /**
   * Execute tool
   * POST /mcp/tools/call
   */
  fastify.post(
    '/tools/call',
    {
      preHandler: [authMiddleware, rateLimitMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const mcpRequest = request as McpAuthenticatedRequest;
      const { name, arguments: args } = request.body as McpToolCallRequest;

      if (!name) {
        return reply.status(400).send({
          error: 'Missing tool name',
        });
      }

      const session = mcpRequest.mcpSession;
      const tenantId = mcpRequest.tenantId;

      // Check scope
      const requiredScopes = getToolScopes(name);
      const hasRequiredScopes = requiredScopes.every(
        (scope) => session.scopes.includes(scope) ||
                   session.scopes.includes('foundry:admin:all')
      );

      if (!hasRequiredScopes) {
        return reply.status(403).send({
          error: `Access denied: Missing required scope for ${name}`,
          requiredScopes,
        });
      }

      logger.info(
        { sessionId: session.id, toolName: name },
        'MCP HTTP: Tool call'
      );

      // Execute with audit logging
      const result = await auditMiddleware(
        session.id,
        session.userId,
        tenantId,
        name,
        args,
        () => executeTool(name, args, tenantId)
      );

      return reply.send(result);
    }
  );

  /**
   * List resources
   * GET /mcp/resources
   */
  fastify.get(
    '/resources',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const mcpRequest = request as McpAuthenticatedRequest;
      const resources = await listResources(mcpRequest.tenantId);
      return reply.send({ resources });
    }
  );

  /**
   * Read resource
   * GET /mcp/resources/:uri
   */
  fastify.get(
    '/resources/*',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const mcpRequest = request as McpAuthenticatedRequest;
      const uri = 'foundry://' + (request.params as Record<string, string>)['*'];

      const content = await getResource(uri, mcpRequest.tenantId);

      if (!content) {
        return reply.status(404).send({
          error: 'Resource not found',
          uri,
        });
      }

      return reply.send({ uri, content });
    }
  );

  /**
   * SSE endpoint for streaming responses
   * GET /mcp/stream
   */
  fastify.get(
    '/stream',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const mcpRequest = request as McpAuthenticatedRequest;

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send initial connection event
      reply.raw.write(`event: connected\ndata: ${JSON.stringify({
        sessionId: mcpRequest.mcpSession.id,
        capabilities: SERVER_INFO.capabilities,
      })}\n\n`);

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        reply.raw.write('event: ping\ndata: {}\n\n');
      }, 30000);

      // Handle client disconnect
      request.raw.on('close', () => {
        clearInterval(pingInterval);
        logger.debug(
          { sessionId: mcpRequest.mcpSession.id },
          'MCP SSE client disconnected'
        );
      });

      // Don't end the response - keep it open for SSE
    }
  );

  /**
   * Health check
   * GET /mcp/health
   */
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });
}

export default mcpHttpRoutes;
