/**
 * Integration Failure Detector
 * T133 - Create integration failure detector
 *
 * Detects failing external integrations and connectivity issues
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import {
  registerDetector,
  createDetectedPattern,
  mergePatterns,
} from './patternDetector.js';
import type { DetectedPattern, AffectedEntity } from 'shared/types/selfHealing.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface IntegrationFailureConfig {
  /** Number of consecutive failures to trigger alert */
  failureThreshold: number;
  /** Error rate threshold (0-1) to trigger alert */
  errorRateThreshold: number;
  /** Response time threshold (ms) to consider slow */
  slowResponseThresholdMs: number;
  /** Minimum requests to calculate error rate */
  minRequestsForRate: number;
}

interface IntegrationHealth {
  integrationId: string;
  integrationName: string;
  integrationType: string;
  totalRequests: number;
  failedRequests: number;
  consecutiveFailures: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastError?: string;
  avgResponseTimeMs: number;
  status: 'healthy' | 'degraded' | 'failing' | 'down';
}

// Default configuration
const DEFAULT_CONFIG: IntegrationFailureConfig = {
  failureThreshold: 3,
  errorRateThreshold: 0.1, // 10%
  slowResponseThresholdMs: 30000, // 30 seconds
  minRequestsForRate: 10,
};

// Integration types we monitor
const MONITORED_INTEGRATIONS = [
  'microsoft365',
  'google',
  'salesforce',
  'hubspot',
  'slack',
  'sap',
  'odoo',
  'datev',
  'bmd',
  'custom_webhook',
];

// =============================================================================
// Detector Implementation
// =============================================================================

/**
 * Detect integration failures
 */
export async function detectIntegrationFailures(
  organizationId: string,
  timeWindowMinutes: number,
  config: Partial<IntegrationFailureConfig> = {}
): Promise<DetectedPattern[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const patterns: DetectedPattern[] = [];

  logger.debug({ organizationId, config: cfg }, 'Detecting integration failures');

  try {
    // Get health status of all integrations
    const integrationHealths = await getIntegrationHealthStatus(
      organizationId,
      timeWindowMinutes
    );

    for (const health of integrationHealths) {
      const issues = analyzeIntegrationHealth(health, cfg);

      if (issues.length > 0) {
        const severity = determineSeverity(health, cfg);

        const affectedEntities: AffectedEntity[] = [
          {
            type: 'integration',
            id: health.integrationId,
            name: health.integrationName,
            impact: 'direct',
          },
        ];

        // Add dependent processes as indirect impacts
        const dependentProcesses = await getDependentProcesses(
          organizationId,
          health.integrationId
        );
        for (const process of dependentProcesses) {
          affectedEntities.push({
            type: 'process',
            id: process.id,
            name: process.name,
            impact: 'indirect',
          });
        }

        const pattern = createDetectedPattern(
          'integration_failure',
          `Integration "${health.integrationName}" is ${health.status}: ${issues.join(', ')}`,
          severity,
          affectedEntities,
          generateSuggestedActions(health)
        );

        patterns.push(pattern);
      }
    }

    const merged = mergePatterns(patterns);

    logger.info(
      {
        organizationId,
        unhealthyIntegrations: patterns.length,
        patternCount: merged.length,
      },
      'Integration failure detection completed'
    );

    return merged;
  } catch (error) {
    logger.error({ error, organizationId }, 'Failed to detect integration failures');
    throw error;
  }
}

// =============================================================================
// Health Status Queries
// =============================================================================

async function getIntegrationHealthStatus(
  organizationId: string,
  timeWindowMinutes: number
): Promise<IntegrationHealth[]> {
  const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

  // Get integrations for the organization
  const integrations = await prisma.integration.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      lastSyncAt: true,
      status: true,
      errorMessage: true,
    },
  });

  const healthStatuses: IntegrationHealth[] = [];

  for (const integration of integrations) {
    // Get sync history for this integration
    const syncLogs = await prisma.syncLog.findMany({
      where: {
        integrationId: integration.id,
        startedAt: { gte: since },
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });

    const totalRequests = syncLogs.length;
    const failedRequests = syncLogs.filter((s) => s.status === 'failed').length;
    const successfulSyncs = syncLogs.filter((s) => s.status === 'completed');

    // Calculate consecutive failures
    let consecutiveFailures = 0;
    for (const log of syncLogs) {
      if (log.status === 'failed') {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    // Calculate average response time from successful syncs
    const avgResponseTimeMs =
      successfulSyncs.length > 0
        ? successfulSyncs.reduce((sum, s) => {
            const duration = s.completedAt
              ? s.completedAt.getTime() - s.startedAt.getTime()
              : 0;
            return sum + duration;
          }, 0) / successfulSyncs.length
        : 0;

    // Determine status
    let status: IntegrationHealth['status'] = 'healthy';
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

    if (consecutiveFailures >= DEFAULT_CONFIG.failureThreshold * 2) {
      status = 'down';
    } else if (consecutiveFailures >= DEFAULT_CONFIG.failureThreshold) {
      status = 'failing';
    } else if (
      errorRate >= DEFAULT_CONFIG.errorRateThreshold ||
      avgResponseTimeMs >= DEFAULT_CONFIG.slowResponseThresholdMs
    ) {
      status = 'degraded';
    }

    const lastSuccess = successfulSyncs[0];
    const lastFailure = syncLogs.find((s) => s.status === 'failed');

    healthStatuses.push({
      integrationId: integration.id,
      integrationName: integration.name,
      integrationType: integration.type,
      totalRequests,
      failedRequests,
      consecutiveFailures,
      lastSuccessAt: lastSuccess?.completedAt || undefined,
      lastFailureAt: lastFailure?.startedAt || undefined,
      lastError: lastFailure?.errorMessage || integration.errorMessage || undefined,
      avgResponseTimeMs,
      status,
    });
  }

  return healthStatuses;
}

async function getDependentProcesses(
  organizationId: string,
  integrationId: string
): Promise<Array<{ id: string; name: string }>> {
  // Find processes that use this integration
  // This is a simplified query - actual implementation would depend on schema
  const processes = await prisma.process
    .findMany({
      where: {
        organizationId,
        // Assuming processes have integration dependencies stored
        steps: {
          some: {
            config: {
              path: ['integrationId'],
              equals: integrationId,
            },
          },
        },
      },
      select: { id: true, name: true },
      take: 10,
    })
    .catch(() => []);

  return processes;
}

// =============================================================================
// Analysis Functions
// =============================================================================

function analyzeIntegrationHealth(
  health: IntegrationHealth,
  config: IntegrationFailureConfig
): string[] {
  const issues: string[] = [];

  // Check consecutive failures
  if (health.consecutiveFailures >= config.failureThreshold) {
    issues.push(
      `${health.consecutiveFailures} consecutive failures`
    );
  }

  // Check error rate
  if (health.totalRequests >= config.minRequestsForRate) {
    const errorRate = health.failedRequests / health.totalRequests;
    if (errorRate >= config.errorRateThreshold) {
      issues.push(`${(errorRate * 100).toFixed(1)}% error rate`);
    }
  }

  // Check response time
  if (health.avgResponseTimeMs >= config.slowResponseThresholdMs) {
    issues.push(
      `slow response time (${Math.round(health.avgResponseTimeMs / 1000)}s avg)`
    );
  }

  // Check if completely down
  if (health.status === 'down') {
    issues.push('integration is completely unavailable');
  }

  return issues;
}

function determineSeverity(
  health: IntegrationHealth,
  config: IntegrationFailureConfig
): DetectedPattern['severity'] {
  if (health.status === 'down') return 'critical';
  if (health.status === 'failing') return 'high';
  if (health.consecutiveFailures >= config.failureThreshold) return 'high';

  const errorRate =
    health.totalRequests > 0 ? health.failedRequests / health.totalRequests : 0;
  if (errorRate >= config.errorRateThreshold * 2) return 'high';
  if (errorRate >= config.errorRateThreshold) return 'medium';

  return 'low';
}

function generateSuggestedActions(health: IntegrationHealth): string[] {
  const actions: string[] = [];

  switch (health.status) {
    case 'down':
      actions.push('Check external service status');
      actions.push('Verify API credentials');
      actions.push('Review firewall/network settings');
      actions.push('Contact integration provider support');
      break;
    case 'failing':
      actions.push('Retry failed sync operations');
      actions.push('Check API rate limits');
      actions.push('Review recent error logs');
      break;
    case 'degraded':
      actions.push('Monitor for further degradation');
      actions.push('Check for partial outages');
      actions.push('Verify data consistency');
      break;
  }

  // Type-specific suggestions
  if (health.integrationType === 'microsoft365') {
    actions.push('Verify OAuth token validity');
    actions.push('Check Microsoft 365 admin center for issues');
  } else if (health.integrationType === 'salesforce') {
    actions.push('Check Salesforce API usage limits');
  }

  return actions;
}

// =============================================================================
// Monitoring Functions
// =============================================================================

/**
 * Check health of a specific integration
 */
export async function checkIntegrationHealth(
  integrationId: string
): Promise<IntegrationHealth | null> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    include: {
      organization: { select: { id: true } },
    },
  });

  if (!integration) return null;

  const healthStatuses = await getIntegrationHealthStatus(
    integration.organizationId,
    60 // Last hour
  );

  return healthStatuses.find((h) => h.integrationId === integrationId) || null;
}

/**
 * Get integration health summary for an organization
 */
export async function getIntegrationHealthSummary(
  organizationId: string
): Promise<{
  totalIntegrations: number;
  healthy: number;
  degraded: number;
  failing: number;
  down: number;
}> {
  const healthStatuses = await getIntegrationHealthStatus(organizationId, 60);

  return {
    totalIntegrations: healthStatuses.length,
    healthy: healthStatuses.filter((h) => h.status === 'healthy').length,
    degraded: healthStatuses.filter((h) => h.status === 'degraded').length,
    failing: healthStatuses.filter((h) => h.status === 'failing').length,
    down: healthStatuses.filter((h) => h.status === 'down').length,
  };
}

// =============================================================================
// Register Detector
// =============================================================================

registerDetector({
  patternType: 'integration_failure',
  detect: (organizationId, timeWindowMinutes) =>
    detectIntegrationFailures(organizationId, timeWindowMinutes),
});

export default {
  detectIntegrationFailures,
  checkIntegrationHealth,
  getIntegrationHealthSummary,
  DEFAULT_CONFIG,
  MONITORED_INTEGRATIONS,
};
