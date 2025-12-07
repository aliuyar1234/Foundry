/**
 * McpSession TypeScript Model Types (T045)
 * Represents an active MCP connection from external AI tool
 */

export interface McpSession {
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

export interface CreateMcpSessionInput {
  userId: string;
  clientName: string;
  clientVersion?: string;
  ipAddress: string;
  scopes: string[];
  ttlSeconds?: number;
}

export interface UpdateMcpSessionInput {
  rateLimitBucket?: number;
  rateLimitResetAt?: Date;
  lastActivityAt?: Date;
}

export interface McpSessionWithUser extends McpSession {
  user?: {
    id: string;
    email: string;
    name?: string;
    organizationId: string;
  };
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: McpSession;
  error?: string;
  errorCode?: 'EXPIRED' | 'NOT_FOUND' | 'INVALID_SCOPE' | 'RATE_LIMITED';
}

/**
 * Default session configuration
 */
export const MCP_SESSION_DEFAULTS = {
  TTL_SECONDS: 3600, // 1 hour
  RATE_LIMIT_BUCKET: 1000,
  RATE_LIMIT_RESET_INTERVAL_MS: 3600000, // 1 hour
};

/**
 * Available MCP scopes
 */
export const MCP_SCOPES = {
  // Read scopes
  READ_SEARCH: 'foundry:search:read',
  READ_PEOPLE: 'foundry:people:read',
  READ_PROCESSES: 'foundry:processes:read',
  READ_DOCUMENTS: 'foundry:documents:read',
  READ_GRAPH: 'foundry:graph:read',

  // Execute scopes
  ANALYZE: 'foundry:analyze:execute',

  // Admin scopes
  ADMIN_ALL: 'foundry:admin:all',
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

/**
 * Scope groups for common use cases
 */
export const MCP_SCOPE_GROUPS = {
  READ_ALL: [
    MCP_SCOPES.READ_SEARCH,
    MCP_SCOPES.READ_PEOPLE,
    MCP_SCOPES.READ_PROCESSES,
    MCP_SCOPES.READ_DOCUMENTS,
    MCP_SCOPES.READ_GRAPH,
  ],
  STANDARD: [
    MCP_SCOPES.READ_SEARCH,
    MCP_SCOPES.READ_PEOPLE,
    MCP_SCOPES.READ_PROCESSES,
    MCP_SCOPES.READ_DOCUMENTS,
  ],
  FULL_ACCESS: [
    ...Object.values(MCP_SCOPES),
  ],
};

/**
 * Check if a scope is valid
 */
export function isValidScope(scope: string): scope is McpScope {
  return Object.values(MCP_SCOPES).includes(scope as McpScope);
}

/**
 * Check if session has required scope
 */
export function hasScope(session: McpSession, requiredScope: McpScope): boolean {
  return session.scopes.includes(requiredScope) ||
         session.scopes.includes(MCP_SCOPES.ADMIN_ALL);
}

/**
 * Check if session has any of the required scopes
 */
export function hasAnyScope(session: McpSession, requiredScopes: McpScope[]): boolean {
  return requiredScopes.some(scope => hasScope(session, scope));
}
