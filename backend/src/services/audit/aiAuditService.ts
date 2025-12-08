/**
 * AI Audit Service
 * T252 - Implement audit trail for all AI decisions
 *
 * Tracks and logs all AI-related decisions, queries, and actions
 * for compliance, debugging, and analytics purposes
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// Types
interface AIDecisionAudit {
  id: string;
  organizationId: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  decisionType: AIDecisionType;
  inputHash: string;
  inputSummary: string;
  outputHash: string;
  outputSummary: string;
  model: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  latencyMs: number;
  confidence?: number;
  metadata: Record<string, unknown>;
  timestamp: Date;
  retentionDays: number;
}

type AIDecisionType =
  | 'chat_response'
  | 'routing_decision'
  | 'task_classification'
  | 'content_generation'
  | 'data_analysis'
  | 'risk_assessment'
  | 'recommendation'
  | 'compliance_check'
  | 'summarization'
  | 'translation'
  | 'other';

interface AuditQueryOptions {
  organizationId: string;
  userId?: string;
  sessionId?: string;
  decisionType?: AIDecisionType;
  startDate?: Date;
  endDate?: Date;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

interface AuditSummary {
  organizationId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalDecisions: number;
  decisionsByType: Record<string, number>;
  totalTokensUsed: number;
  averageLatencyMs: number;
  averageConfidence: number;
  uniqueUsers: number;
  modelUsage: Record<string, number>;
}

// In-memory audit buffer (for batch writing)
const auditBuffer: AIDecisionAudit[] = [];
const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 30000; // 30 seconds

let prisma: PrismaClient | null = null;
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Initialize the AI audit service
 */
export function initializeAuditService(prismaClient: PrismaClient): void {
  prisma = prismaClient;

  // Start periodic flush
  flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL);
}

/**
 * Shutdown the audit service
 */
export async function shutdownAuditService(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Flush remaining audits
  await flushBuffer();
}

/**
 * Log an AI decision
 */
export async function logAIDecision(
  decision: Omit<AIDecisionAudit, 'id' | 'timestamp' | 'inputHash' | 'outputHash'>  & {
    input: string;
    output: string;
  }
): Promise<string> {
  const id = generateAuditId();

  const audit: AIDecisionAudit = {
    id,
    organizationId: decision.organizationId,
    userId: decision.userId,
    sessionId: decision.sessionId,
    correlationId: decision.correlationId,
    decisionType: decision.decisionType,
    inputHash: hashContent(decision.input),
    inputSummary: truncateSummary(decision.input),
    outputHash: hashContent(decision.output),
    outputSummary: truncateSummary(decision.output),
    model: decision.model,
    tokensUsed: decision.tokensUsed,
    latencyMs: decision.latencyMs,
    confidence: decision.confidence,
    metadata: decision.metadata,
    timestamp: new Date(),
    retentionDays: decision.retentionDays,
  };

  // Add to buffer
  auditBuffer.push(audit);

  // Flush if buffer is full
  if (auditBuffer.length >= BUFFER_SIZE) {
    flushBuffer().catch(console.error);
  }

  return id;
}

/**
 * Log a chat response
 */
export async function logChatResponse(
  organizationId: string,
  userId: string,
  sessionId: string,
  query: string,
  response: string,
  model: string,
  tokensUsed: { prompt: number; completion: number },
  latencyMs: number,
  metadata?: Record<string, unknown>
): Promise<string> {
  return logAIDecision({
    organizationId,
    userId,
    sessionId,
    decisionType: 'chat_response',
    input: query,
    output: response,
    model,
    tokensUsed: {
      ...tokensUsed,
      total: tokensUsed.prompt + tokensUsed.completion,
    },
    latencyMs,
    metadata: metadata || {},
    retentionDays: 90,
  });
}

/**
 * Log a routing decision
 */
export async function logRoutingDecision(
  organizationId: string,
  taskDescription: string,
  selectedRoute: string,
  confidence: number,
  model: string,
  latencyMs: number,
  factors: Record<string, number>,
  correlationId?: string
): Promise<string> {
  return logAIDecision({
    organizationId,
    correlationId,
    decisionType: 'routing_decision',
    input: taskDescription,
    output: selectedRoute,
    model,
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    latencyMs,
    confidence,
    metadata: { factors },
    retentionDays: 365,
  });
}

/**
 * Log a risk assessment
 */
export async function logRiskAssessment(
  organizationId: string,
  subject: string,
  assessment: string,
  riskScore: number,
  model: string,
  latencyMs: number,
  factors: string[],
  userId?: string
): Promise<string> {
  return logAIDecision({
    organizationId,
    userId,
    decisionType: 'risk_assessment',
    input: subject,
    output: assessment,
    model,
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    latencyMs,
    confidence: 1 - riskScore, // Confidence inverse of risk
    metadata: { riskScore, factors },
    retentionDays: 365,
  });
}

/**
 * Query audit records
 */
export async function queryAuditRecords(
  options: AuditQueryOptions
): Promise<AIDecisionAudit[]> {
  if (!prisma) {
    throw new Error('Audit service not initialized');
  }

  // Build where clause
  const where: Record<string, unknown> = {
    organizationId: options.organizationId,
  };

  if (options.userId) where.userId = options.userId;
  if (options.sessionId) where.sessionId = options.sessionId;
  if (options.decisionType) where.decisionType = options.decisionType;
  if (options.startDate || options.endDate) {
    where.timestamp = {};
    if (options.startDate) (where.timestamp as Record<string, Date>).gte = options.startDate;
    if (options.endDate) (where.timestamp as Record<string, Date>).lte = options.endDate;
  }
  if (options.minConfidence !== undefined) {
    where.confidence = { gte: options.minConfidence };
  }

  // Query database
  const records = await prisma.aiDecisionAudit.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: options.limit || 100,
    skip: options.offset || 0,
  });

  return records.map(mapDbRecordToAudit);
}

/**
 * Get audit summary
 */
export async function getAuditSummary(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<AuditSummary> {
  if (!prisma) {
    throw new Error('Audit service not initialized');
  }

  // Get aggregated stats
  const stats = await prisma.aiDecisionAudit.aggregate({
    where: {
      organizationId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: { id: true },
    _sum: {
      totalTokens: true,
    },
    _avg: {
      latencyMs: true,
      confidence: true,
    },
  });

  // Get decision type breakdown
  const typeBreakdown = await prisma.aiDecisionAudit.groupBy({
    by: ['decisionType'],
    where: {
      organizationId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: { id: true },
  });

  // Get model usage
  const modelBreakdown = await prisma.aiDecisionAudit.groupBy({
    by: ['model'],
    where: {
      organizationId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: { id: true },
  });

  // Get unique users
  const uniqueUsers = await prisma.aiDecisionAudit.findMany({
    where: {
      organizationId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      userId: { not: null },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  return {
    organizationId,
    period: { start: startDate, end: endDate },
    totalDecisions: stats._count.id || 0,
    decisionsByType: typeBreakdown.reduce((acc, item) => {
      acc[item.decisionType] = item._count.id;
      return acc;
    }, {} as Record<string, number>),
    totalTokensUsed: stats._sum.totalTokens || 0,
    averageLatencyMs: stats._avg.latencyMs || 0,
    averageConfidence: stats._avg.confidence || 0,
    uniqueUsers: uniqueUsers.length,
    modelUsage: modelBreakdown.reduce((acc, item) => {
      acc[item.model] = item._count.id;
      return acc;
    }, {} as Record<string, number>),
  };
}

/**
 * Get audit record by ID
 */
export async function getAuditRecord(
  auditId: string
): Promise<AIDecisionAudit | null> {
  if (!prisma) {
    throw new Error('Audit service not initialized');
  }

  const record = await prisma.aiDecisionAudit.findUnique({
    where: { id: auditId },
  });

  return record ? mapDbRecordToAudit(record) : null;
}

/**
 * Delete expired audit records
 */
export async function cleanupExpiredRecords(): Promise<number> {
  if (!prisma) {
    throw new Error('Audit service not initialized');
  }

  const result = await prisma.aiDecisionAudit.deleteMany({
    where: {
      expiresAt: { lte: new Date() },
    },
  });

  return result.count;
}

/**
 * Export audit records for compliance
 */
export async function exportAuditRecords(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  format: 'json' | 'csv' = 'json'
): Promise<string> {
  const records = await queryAuditRecords({
    organizationId,
    startDate,
    endDate,
    limit: 10000,
  });

  if (format === 'csv') {
    return convertToCSV(records);
  }

  return JSON.stringify(records, null, 2);
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Generate unique audit ID
 */
function generateAuditId(): string {
  return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Hash content for storage
 */
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Truncate content for summary
 */
function truncateSummary(content: string, maxLength = 500): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

/**
 * Flush audit buffer to database
 */
async function flushBuffer(): Promise<void> {
  if (auditBuffer.length === 0 || !prisma) return;

  const toFlush = auditBuffer.splice(0, auditBuffer.length);

  try {
    await prisma.aiDecisionAudit.createMany({
      data: toFlush.map((audit) => ({
        id: audit.id,
        organizationId: audit.organizationId,
        userId: audit.userId,
        sessionId: audit.sessionId,
        correlationId: audit.correlationId,
        decisionType: audit.decisionType,
        inputHash: audit.inputHash,
        inputSummary: audit.inputSummary,
        outputHash: audit.outputHash,
        outputSummary: audit.outputSummary,
        model: audit.model,
        promptTokens: audit.tokensUsed.prompt,
        completionTokens: audit.tokensUsed.completion,
        totalTokens: audit.tokensUsed.total,
        latencyMs: audit.latencyMs,
        confidence: audit.confidence,
        metadata: audit.metadata,
        timestamp: audit.timestamp,
        expiresAt: new Date(audit.timestamp.getTime() + audit.retentionDays * 24 * 60 * 60 * 1000),
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    // On error, put records back in buffer
    auditBuffer.push(...toFlush);
    console.error('Failed to flush audit buffer:', error);
  }
}

/**
 * Map database record to audit type
 */
function mapDbRecordToAudit(record: Record<string, unknown>): AIDecisionAudit {
  return {
    id: record.id as string,
    organizationId: record.organizationId as string,
    userId: record.userId as string | undefined,
    sessionId: record.sessionId as string | undefined,
    correlationId: record.correlationId as string | undefined,
    decisionType: record.decisionType as AIDecisionType,
    inputHash: record.inputHash as string,
    inputSummary: record.inputSummary as string,
    outputHash: record.outputHash as string,
    outputSummary: record.outputSummary as string,
    model: record.model as string,
    tokensUsed: {
      prompt: record.promptTokens as number,
      completion: record.completionTokens as number,
      total: record.totalTokens as number,
    },
    latencyMs: record.latencyMs as number,
    confidence: record.confidence as number | undefined,
    metadata: record.metadata as Record<string, unknown>,
    timestamp: record.timestamp as Date,
    retentionDays: Math.ceil(
      ((record.expiresAt as Date).getTime() - (record.timestamp as Date).getTime()) /
        (24 * 60 * 60 * 1000)
    ),
  };
}

/**
 * Convert records to CSV
 */
function convertToCSV(records: AIDecisionAudit[]): string {
  const headers = [
    'id',
    'organizationId',
    'userId',
    'sessionId',
    'decisionType',
    'model',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'latencyMs',
    'confidence',
    'timestamp',
  ];

  const rows = records.map((r) =>
    [
      r.id,
      r.organizationId,
      r.userId || '',
      r.sessionId || '',
      r.decisionType,
      r.model,
      r.tokensUsed.prompt,
      r.tokensUsed.completion,
      r.tokensUsed.total,
      r.latencyMs,
      r.confidence || '',
      r.timestamp.toISOString(),
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

// Export types
export type {
  AIDecisionAudit,
  AIDecisionType,
  AuditQueryOptions,
  AuditSummary,
};

export default {
  initializeAuditService,
  shutdownAuditService,
  logAIDecision,
  logChatResponse,
  logRoutingDecision,
  logRiskAssessment,
  queryAuditRecords,
  getAuditSummary,
  getAuditRecord,
  cleanupExpiredRecords,
  exportAuditRecords,
};
