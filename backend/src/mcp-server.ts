/**
 * MCP Server Entry Point (T060)
 * Standalone MCP server for Claude Desktop and other MCP clients
 */

import { runMcpStdioServer } from './services/mcp/server.js';
import { getMcpSessionService } from './services/mcp/session.service.js';
import { logger } from './lib/logger.js';
import { MCP_SCOPE_GROUPS } from './models/McpSession.js';

/**
 * Parse command line arguments
 */
function parseArgs(): {
  sessionId?: string;
  userId?: string;
  tenantId?: string;
  createSession?: boolean;
} {
  const args: Record<string, string | boolean> = {};

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || true;
    }
  }

  return args as {
    sessionId?: string;
    userId?: string;
    tenantId?: string;
    createSession?: boolean;
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  logger.info({ args }, 'Starting MCP server');

  // Determine session configuration
  let sessionId = args.sessionId;
  let userId = args.userId || 'mcp-user';
  let tenantId = args.tenantId || 'default';

  // Create session if needed
  if (!sessionId || args.createSession) {
    const sessionService = getMcpSessionService();

    const session = await sessionService.createSession({
      userId,
      clientName: 'mcp-stdio',
      ipAddress: 'localhost',
      scopes: MCP_SCOPE_GROUPS.FULL_ACCESS,
      ttlSeconds: 86400, // 24 hours
    });

    sessionId = session.id;

    logger.info(
      { sessionId, userId, tenantId },
      'Created MCP session for stdio server'
    );

    // Output session info to stderr (stdout is for MCP protocol)
    console.error(`MCP Session ID: ${sessionId}`);
    console.error(`Expires at: ${session.expiresAt.toISOString()}`);
  }

  // Run the stdio server
  await runMcpStdioServer({
    sessionId,
    userId,
    tenantId,
  });
}

// Run
main().catch((error) => {
  logger.error({ error }, 'MCP server failed');
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
