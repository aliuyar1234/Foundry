/**
 * MCP Audit Logging (T050)
 * Records all MCP tool interactions for compliance
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import type {
  McpAuditLog,
  CreateMcpAuditLogInput,
  McpAuditLogFilters,
  McpAuditStats,
} from '../../models/McpAuditLog.js';
import { sanitizeParameters, truncateParameters } from '../../models/McpAuditLog.js';

const prisma = new PrismaClient();

/**
 * MCP Audit Service
 */
export class McpAuditService {
  /**
   * Log an MCP tool call
   */
  async logToolCall(input: CreateMcpAuditLogInput): Promise<McpAuditLog> {
    // Sanitize and truncate parameters for storage
    const sanitized = sanitizeParameters(input.parameters);
    const truncated = truncateParameters(sanitized);

    const auditLog = await prisma.mcpAuditLog.create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        toolName: input.toolName,
        parameters: truncated,
        responseSize: input.responseSize,
        durationMs: input.durationMs,
        statusCode: input.statusCode,
        errorMessage: input.errorMessage,
        tenantId: input.tenantId,
      },
    });

    logger.debug(
      {
        auditId: auditLog.id,
        sessionId: input.sessionId,
        toolName: input.toolName,
        durationMs: input.durationMs,
        statusCode: input.statusCode,
      },
      'MCP tool call logged'
    );

    return {
      id: auditLog.id,
      sessionId: auditLog.sessionId,
      userId: auditLog.userId,
      toolName: auditLog.toolName,
      parameters: auditLog.parameters as Record<string, unknown>,
      responseSize: auditLog.responseSize,
      durationMs: auditLog.durationMs,
      statusCode: auditLog.statusCode,
      errorMessage: auditLog.errorMessage ?? undefined,
      tenantId: auditLog.tenantId,
      createdAt: auditLog.createdAt,
    };
  }

  /**
   * Query audit logs
   */
  async queryLogs(
    filters: McpAuditLogFilters,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ logs: McpAuditLog[]; total: number }> {
    const { limit = 100, offset = 0 } = options;

    const where: Record<string, unknown> = {};

    if (filters.sessionId) where.sessionId = filters.sessionId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.toolName) where.toolName = filters.toolName;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.statusCode) where.statusCode = filters.statusCode;
    if (filters.hasError !== undefined) {
      where.errorMessage = filters.hasError ? { not: null } : null;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) (where.createdAt as Record<string, Date>).gte = filters.startDate;
      if (filters.endDate) (where.createdAt as Record<string, Date>).lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.mcpAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.mcpAuditLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        sessionId: l.sessionId,
        userId: l.userId,
        toolName: l.toolName,
        parameters: l.parameters as Record<string, unknown>,
        responseSize: l.responseSize,
        durationMs: l.durationMs,
        statusCode: l.statusCode,
        errorMessage: l.errorMessage ?? undefined,
        tenantId: l.tenantId,
        createdAt: l.createdAt,
      })),
      total,
    };
  }

  /**
   * Get audit statistics
   */
  async getStats(
    tenantId: string,
    options: { startDate?: Date; endDate?: Date } = {}
  ): Promise<McpAuditStats> {
    const where: Record<string, unknown> = { tenantId };

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) (where.createdAt as Record<string, Date>).gte = options.startDate;
      if (options.endDate) (where.createdAt as Record<string, Date>).lte = options.endDate;
    }

    const [
      totalRequests,
      successfulRequests,
      aggregates,
      byTool,
      byUser,
    ] = await Promise.all([
      prisma.mcpAuditLog.count({ where }),
      prisma.mcpAuditLog.count({
        where: { ...where, statusCode: { lt: 400 } },
      }),
      prisma.mcpAuditLog.aggregate({
        where,
        _avg: { durationMs: true },
        _sum: { responseSize: true },
      }),
      prisma.mcpAuditLog.groupBy({
        by: ['toolName'],
        where,
        _count: true,
      }),
      prisma.mcpAuditLog.groupBy({
        by: ['userId'],
        where,
        _count: true,
      }),
    ]);

    const requestsByTool: Record<string, number> = {};
    for (const item of byTool) {
      requestsByTool[item.toolName] = item._count;
    }

    const requestsByUser: Record<string, number> = {};
    for (const item of byUser) {
      requestsByUser[item.userId] = item._count;
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests: totalRequests - successfulRequests,
      averageDurationMs: aggregates._avg.durationMs ?? 0,
      totalResponseBytes: aggregates._sum.responseSize ?? 0,
      requestsByTool,
      requestsByUser,
      errorRate: totalRequests > 0
        ? (totalRequests - successfulRequests) / totalRequests
        : 0,
    };
  }

  /**
   * Delete old audit logs (retention policy)
   */
  async deleteOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await prisma.mcpAuditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    logger.info(
      { deletedCount: result.count, retentionDays },
      'Deleted old MCP audit logs'
    );

    return result.count;
  }
}

// Singleton instance
let auditServiceInstance: McpAuditService | null = null;

export function getMcpAuditService(): McpAuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = new McpAuditService();
  }
  return auditServiceInstance;
}

/**
 * Create audit logger middleware
 */
export function createAuditMiddleware() {
  const auditService = getMcpAuditService();

  return async function auditMiddleware(
    sessionId: string,
    userId: string,
    tenantId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    execute: () => Promise<{ content: unknown; isError?: boolean }>
  ): Promise<{ content: unknown; isError?: boolean }> {
    const startTime = Date.now();
    let statusCode = 200;
    let errorMessage: string | undefined;
    let responseSize = 0;

    try {
      const result = await execute();

      if (result.isError) {
        statusCode = 400;
        errorMessage = typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);
      }

      responseSize = JSON.stringify(result.content).length;
      return result;
    } catch (error) {
      statusCode = 500;
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    } finally {
      const durationMs = Date.now() - startTime;

      // Log asynchronously to not block response
      auditService.logToolCall({
        sessionId,
        userId,
        toolName,
        parameters,
        responseSize,
        durationMs,
        statusCode,
        errorMessage,
        tenantId,
      }).catch((err) => {
        logger.error({ error: err }, 'Failed to log MCP audit');
      });
    }
  };
}
