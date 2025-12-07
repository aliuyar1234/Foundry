/**
 * MCP (Model Context Protocol) Type Definitions
 * Types for MCP server implementation
 */

/**
 * MCP Tool definition
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, McpToolProperty>;
    required?: string[];
  };
}

/**
 * MCP Tool property schema
 */
export interface McpToolProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: McpToolProperty;
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

/**
 * MCP Resource definition
 */
export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

/**
 * MCP Tool call request
 */
export interface McpToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * MCP Tool call response
 */
export interface McpToolCallResponse {
  content: McpContent[];
  isError?: boolean;
}

/**
 * MCP Content block
 */
export interface McpContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

/**
 * MCP Session state
 */
export interface McpSessionState {
  id: string;
  userId: string;
  clientName: string;
  clientVersion?: string;
  ipAddress: string;
  scopes: string[];
  rateLimitBucket: number;
  rateLimitResetAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * MCP Audit log entry
 */
export interface McpAuditEntry {
  sessionId: string;
  userId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  responseSize: number;
  durationMs: number;
  statusCode: number;
  errorMessage?: string;
  tenantId: string;
  createdAt: Date;
}

/**
 * MCP Server capabilities
 */
export interface McpServerCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
}

/**
 * MCP Server info
 */
export interface McpServerInfo {
  name: string;
  version: string;
  capabilities: McpServerCapabilities;
}

/**
 * MCP Rate limit status
 */
export interface McpRateLimitStatus {
  remaining: number;
  resetAt: Date;
  limit: number;
}

/**
 * MCP Error codes
 */
export enum McpErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
}

/**
 * MCP Error response
 */
export interface McpError {
  code: McpErrorCode;
  message: string;
  retryAfter?: number;
  details?: Record<string, unknown>;
}

/**
 * Foundry-specific MCP tool names
 */
export const FOUNDRY_MCP_TOOLS = {
  SEARCH_ORGANIZATION: 'search_organization',
  GET_PERSON: 'get_person',
  GET_PROCESS: 'get_process',
  LIST_DOCUMENTS: 'list_documents',
  QUERY_GRAPH: 'query_graph',
  ANALYZE_DECISION: 'analyze_decision',
} as const;

/**
 * Foundry MCP scopes for authorization
 */
export const FOUNDRY_MCP_SCOPES = {
  READ_SEARCH: 'foundry:search:read',
  READ_PEOPLE: 'foundry:people:read',
  READ_PROCESSES: 'foundry:processes:read',
  READ_DOCUMENTS: 'foundry:documents:read',
  READ_GRAPH: 'foundry:graph:read',
  ANALYZE: 'foundry:analyze:execute',
} as const;

/**
 * MCP Tool scope mapping
 */
export const TOOL_SCOPE_MAP: Record<string, string[]> = {
  [FOUNDRY_MCP_TOOLS.SEARCH_ORGANIZATION]: [FOUNDRY_MCP_SCOPES.READ_SEARCH],
  [FOUNDRY_MCP_TOOLS.GET_PERSON]: [FOUNDRY_MCP_SCOPES.READ_PEOPLE],
  [FOUNDRY_MCP_TOOLS.GET_PROCESS]: [FOUNDRY_MCP_SCOPES.READ_PROCESSES],
  [FOUNDRY_MCP_TOOLS.LIST_DOCUMENTS]: [FOUNDRY_MCP_SCOPES.READ_DOCUMENTS],
  [FOUNDRY_MCP_TOOLS.QUERY_GRAPH]: [FOUNDRY_MCP_SCOPES.READ_GRAPH],
  [FOUNDRY_MCP_TOOLS.ANALYZE_DECISION]: [FOUNDRY_MCP_SCOPES.ANALYZE],
};

/**
 * Default MCP rate limits
 */
export const MCP_RATE_LIMITS = {
  DEFAULT_BUCKET_SIZE: 1000,
  RESET_INTERVAL_MS: 3600000, // 1 hour
  TOOL_LIMITS: {
    [FOUNDRY_MCP_TOOLS.SEARCH_ORGANIZATION]: 100,
    [FOUNDRY_MCP_TOOLS.GET_PERSON]: 200,
    [FOUNDRY_MCP_TOOLS.GET_PROCESS]: 200,
    [FOUNDRY_MCP_TOOLS.LIST_DOCUMENTS]: 200,
    [FOUNDRY_MCP_TOOLS.QUERY_GRAPH]: 50,
    [FOUNDRY_MCP_TOOLS.ANALYZE_DECISION]: 10,
  },
} as const;
