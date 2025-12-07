/**
 * McpAuditLog TypeScript Model Types (T046)
 * Record of MCP interactions for compliance
 */

export interface McpAuditLog {
  id: string;
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

export interface CreateMcpAuditLogInput {
  sessionId: string;
  userId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  responseSize: number;
  durationMs: number;
  statusCode: number;
  errorMessage?: string;
  tenantId: string;
}

export interface McpAuditLogWithSession extends McpAuditLog {
  session?: {
    id: string;
    clientName: string;
    ipAddress: string;
  };
}

/**
 * Audit log query filters
 */
export interface McpAuditLogFilters {
  sessionId?: string;
  userId?: string;
  toolName?: string;
  tenantId?: string;
  startDate?: Date;
  endDate?: Date;
  statusCode?: number;
  hasError?: boolean;
}

/**
 * Audit log statistics
 */
export interface McpAuditStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageDurationMs: number;
  totalResponseBytes: number;
  requestsByTool: Record<string, number>;
  requestsByUser: Record<string, number>;
  errorRate: number;
}

/**
 * Sanitize parameters for audit logging
 * Removes sensitive information
 */
export function sanitizeParameters(
  params: Record<string, unknown>
): Record<string, unknown> {
  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'credential',
    'auth',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((s) => lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeParameters(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Truncate large parameter values
 */
export function truncateParameters(
  params: Record<string, unknown>,
  maxLength: number = 1000
): Record<string, unknown> {
  const truncated: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > maxLength) {
      truncated[key] = value.slice(0, maxLength) + '...[truncated]';
    } else if (Array.isArray(value) && value.length > 100) {
      truncated[key] = value.slice(0, 100);
    } else if (typeof value === 'object' && value !== null) {
      truncated[key] = truncateParameters(value as Record<string, unknown>, maxLength);
    } else {
      truncated[key] = value;
    }
  }

  return truncated;
}
