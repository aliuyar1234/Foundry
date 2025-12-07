/**
 * MCP Services Index
 * Exports all MCP-related services and utilities
 */

// Session management
export { McpSessionService, getMcpSessionService } from './session.service.js';

// Authentication and authorization
export {
  createMcpAuthMiddleware,
  mcpAuthPlugin,
  requireScope,
  requireScopes,
} from './auth.js';
export type { McpAuthenticatedRequest, McpAuthOptions } from './auth.js';

// Rate limiting
export {
  createRateLimitMiddleware,
  rateLimitTool,
  checkRateLimit,
  getToolRateLimit,
  createRateLimitHeaders,
} from './ratelimit.js';
export type { RateLimitStatus, RateLimitHeaders } from './ratelimit.js';

// Audit logging
export {
  McpAuditService,
  getMcpAuditService,
  createAuditMiddleware,
} from './audit.js';

// Tools
export {
  MCP_TOOL_DEFINITIONS,
  executeTool,
  getToolScopes,
  listTools,
} from './tools.js';

// Resources
export {
  listResources,
  getResource,
  parseResourceUri,
  subscribeToResource,
  RESOURCE_URI_PATTERNS,
} from './resources.js';

// Server implementations
export { createMcpServer, runMcpStdioServer } from './server.js';
export { mcpHttpRoutes } from './http-server.js';

// Re-export types
export type {
  McpSession,
  CreateMcpSessionInput,
  UpdateMcpSessionInput,
  SessionValidationResult,
  McpScope,
} from '../../models/McpSession.js';
export {
  MCP_SESSION_DEFAULTS,
  MCP_SCOPES,
  MCP_SCOPE_GROUPS,
  isValidScope,
  hasScope,
  hasAnyScope,
} from '../../models/McpSession.js';

export type {
  McpAuditLog,
  CreateMcpAuditLogInput,
  McpAuditLogFilters,
  McpAuditStats,
} from '../../models/McpAuditLog.js';
export { sanitizeParameters, truncateParameters } from '../../models/McpAuditLog.js';
