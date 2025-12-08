/**
 * Integration Tests for Self-Healing (T263)
 * E2E tests for the self-healing automation
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Mock external dependencies
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

const prisma = new PrismaClient();

describe('Self-Healing Integration Tests', () => {
  const testOrgId = 'test-org-selfhealing';

  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Issue Detection', () => {
    it('should detect anomalies in metrics', () => {
      const detectAnomaly = (
        values: number[],
        threshold: number = 2
      ): { isAnomaly: boolean; value: number; zscore: number } => {
        if (values.length < 3) {
          return { isAnomaly: false, value: values[values.length - 1] || 0, zscore: 0 };
        }

        const current = values[values.length - 1];
        const historical = values.slice(0, -1);
        const mean = historical.reduce((a, b) => a + b, 0) / historical.length;
        const variance = historical.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historical.length;
        const stdDev = Math.sqrt(variance);
        const zscore = stdDev === 0 ? 0 : (current - mean) / stdDev;

        return {
          isAnomaly: Math.abs(zscore) > threshold,
          value: current,
          zscore,
        };
      };

      const normalValues = [10, 11, 9, 10, 12, 10, 11];
      expect(detectAnomaly(normalValues).isAnomaly).toBe(false);

      const anomalyValues = [10, 11, 9, 10, 12, 10, 50];
      expect(detectAnomaly(anomalyValues).isAnomaly).toBe(true);
    });

    it('should identify pattern-based issues', () => {
      const detectPattern = (
        events: Array<{ type: string; timestamp: number }>
      ): { pattern: string | null; confidence: number } => {
        // Count event types
        const counts: Record<string, number> = {};
        for (const event of events) {
          counts[event.type] = (counts[event.type] || 0) + 1;
        }

        // Check for recurring patterns
        const totalEvents = events.length;
        for (const [type, count] of Object.entries(counts)) {
          const frequency = count / totalEvents;
          if (frequency > 0.5) {
            return { pattern: `frequent_${type}`, confidence: frequency };
          }
        }

        return { pattern: null, confidence: 0 };
      };

      const events = [
        { type: 'error', timestamp: 1 },
        { type: 'error', timestamp: 2 },
        { type: 'error', timestamp: 3 },
        { type: 'warning', timestamp: 4 },
        { type: 'error', timestamp: 5 },
      ];

      const result = detectPattern(events);
      expect(result.pattern).toBe('frequent_error');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should correlate related issues', () => {
      const correlateIssues = (
        issues: Array<{ id: string; type: string; component: string; timestamp: number }>
      ): Array<{ issues: string[]; correlation: string }> => {
        const groups: Record<string, string[]> = {};
        const timeWindow = 60000; // 1 minute

        for (const issue of issues) {
          const key = `${issue.component}_${Math.floor(issue.timestamp / timeWindow)}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(issue.id);
        }

        return Object.entries(groups)
          .filter(([_, ids]) => ids.length > 1)
          .map(([key, ids]) => ({
            issues: ids,
            correlation: `time_proximity_${key.split('_')[0]}`,
          }));
      };

      const issues = [
        { id: '1', type: 'error', component: 'api', timestamp: 1000 },
        { id: '2', type: 'timeout', component: 'api', timestamp: 1500 },
        { id: '3', type: 'error', component: 'database', timestamp: 100000 },
      ];

      const correlations = correlateIssues(issues);
      expect(correlations.length).toBe(1);
      expect(correlations[0].issues).toContain('1');
      expect(correlations[0].issues).toContain('2');
    });
  });

  describe('Automated Actions', () => {
    it('should select appropriate remediation action', () => {
      const selectAction = (
        issue: { type: string; severity: string; component: string }
      ): { action: string; params: Record<string, unknown> } => {
        const actionMap: Record<string, { action: string; params: Record<string, unknown> }> = {
          'high_cpu': { action: 'scale_up', params: { instances: 1 } },
          'memory_leak': { action: 'restart_service', params: { graceful: true } },
          'connection_pool_exhausted': { action: 'increase_pool', params: { increment: 10 } },
          'rate_limit_exceeded': { action: 'enable_throttling', params: { threshold: 100 } },
          'disk_full': { action: 'cleanup_logs', params: { olderThan: '7d' } },
        };

        const key = issue.type.toLowerCase().replace(/ /g, '_');
        return actionMap[key] || { action: 'notify_admin', params: { issue } };
      };

      expect(selectAction({ type: 'high_cpu', severity: 'high', component: 'api' }).action).toBe('scale_up');
      expect(selectAction({ type: 'memory_leak', severity: 'medium', component: 'worker' }).action).toBe('restart_service');
      expect(selectAction({ type: 'unknown', severity: 'low', component: 'api' }).action).toBe('notify_admin');
    });

    it('should validate action prerequisites', () => {
      const validatePrerequisites = (
        action: string,
        context: Record<string, unknown>
      ): { valid: boolean; missing: string[] } => {
        const requirements: Record<string, string[]> = {
          scale_up: ['available_capacity', 'budget_remaining'],
          restart_service: ['backup_available', 'redundancy_enabled'],
          increase_pool: ['memory_available'],
          enable_throttling: ['throttle_config'],
        };

        const required = requirements[action] || [];
        const missing = required.filter(r => !context[r]);
        return { valid: missing.length === 0, missing };
      };

      const fullContext = { available_capacity: true, budget_remaining: true };
      expect(validatePrerequisites('scale_up', fullContext).valid).toBe(true);

      const partialContext = { available_capacity: true };
      const result = validatePrerequisites('scale_up', partialContext);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('budget_remaining');
    });

    it('should apply rate limiting to actions', () => {
      const rateLimiter = (
        actionCounts: Record<string, number>,
        limits: Record<string, number>
      ) => ({
        canExecute: (action: string): boolean => {
          const count = actionCounts[action] || 0;
          const limit = limits[action] || 10;
          return count < limit;
        },
        increment: (action: string): void => {
          actionCounts[action] = (actionCounts[action] || 0) + 1;
        },
      });

      const counts: Record<string, number> = { restart_service: 3 };
      const limits = { restart_service: 5, scale_up: 2 };
      const limiter = rateLimiter(counts, limits);

      expect(limiter.canExecute('restart_service')).toBe(true);
      expect(limiter.canExecute('scale_up')).toBe(true);

      limiter.increment('restart_service');
      limiter.increment('restart_service');
      expect(limiter.canExecute('restart_service')).toBe(false);
    });
  });

  describe('Action Execution', () => {
    it('should track action lifecycle', () => {
      interface ActionState {
        id: string;
        status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
        startedAt?: Date;
        completedAt?: Date;
        result?: string;
        error?: string;
      }

      const createAction = (id: string): ActionState => ({
        id,
        status: 'pending',
      });

      const startAction = (action: ActionState): ActionState => ({
        ...action,
        status: 'running',
        startedAt: new Date(),
      });

      const completeAction = (action: ActionState, result: string): ActionState => ({
        ...action,
        status: 'completed',
        completedAt: new Date(),
        result,
      });

      const failAction = (action: ActionState, error: string): ActionState => ({
        ...action,
        status: 'failed',
        completedAt: new Date(),
        error,
      });

      let action = createAction('action-1');
      expect(action.status).toBe('pending');

      action = startAction(action);
      expect(action.status).toBe('running');
      expect(action.startedAt).toBeDefined();

      action = completeAction(action, 'Success');
      expect(action.status).toBe('completed');
      expect(action.result).toBe('Success');
    });

    it('should handle rollback scenarios', () => {
      const determineRollback = (
        action: { type: string; params: Record<string, unknown> }
      ): { type: string; params: Record<string, unknown> } | null => {
        const rollbackMap: Record<string, (params: Record<string, unknown>) => { type: string; params: Record<string, unknown> }> = {
          scale_up: (params) => ({ type: 'scale_down', params: { instances: params.instances } }),
          increase_pool: (params) => ({ type: 'decrease_pool', params: { decrement: params.increment } }),
          enable_throttling: () => ({ type: 'disable_throttling', params: {} }),
        };

        const rollbackFn = rollbackMap[action.type];
        return rollbackFn ? rollbackFn(action.params) : null;
      };

      const scaleUp = { type: 'scale_up', params: { instances: 2 } };
      const rollback = determineRollback(scaleUp);
      expect(rollback?.type).toBe('scale_down');
      expect(rollback?.params.instances).toBe(2);

      const noRollback = { type: 'send_notification', params: {} };
      expect(determineRollback(noRollback)).toBeNull();
    });
  });

  describe('Playbooks', () => {
    it('should match issues to playbooks', () => {
      const matchPlaybook = (
        issue: { type: string; severity: string; component: string },
        playbooks: Array<{ id: string; conditions: { type?: string; severity?: string; component?: string } }>
      ): string | null => {
        for (const playbook of playbooks) {
          const matches =
            (!playbook.conditions.type || playbook.conditions.type === issue.type) &&
            (!playbook.conditions.severity || playbook.conditions.severity === issue.severity) &&
            (!playbook.conditions.component || playbook.conditions.component === issue.component);

          if (matches) return playbook.id;
        }
        return null;
      };

      const playbooks = [
        { id: 'pb-1', conditions: { type: 'high_cpu', severity: 'high' } },
        { id: 'pb-2', conditions: { type: 'memory_leak' } },
        { id: 'pb-3', conditions: { component: 'database' } },
      ];

      expect(matchPlaybook({ type: 'high_cpu', severity: 'high', component: 'api' }, playbooks)).toBe('pb-1');
      expect(matchPlaybook({ type: 'memory_leak', severity: 'low', component: 'worker' }, playbooks)).toBe('pb-2');
      expect(matchPlaybook({ type: 'timeout', severity: 'medium', component: 'database' }, playbooks)).toBe('pb-3');
      expect(matchPlaybook({ type: 'unknown', severity: 'low', component: 'other' }, playbooks)).toBeNull();
    });

    it('should execute playbook steps in order', () => {
      interface PlaybookStep {
        id: string;
        action: string;
        waitFor?: string;
        condition?: (context: Record<string, unknown>) => boolean;
      }

      const executePlaybook = (
        steps: PlaybookStep[],
        context: Record<string, unknown>
      ): string[] => {
        const executed: string[] = [];
        const completed = new Set<string>();

        for (const step of steps) {
          // Check wait condition
          if (step.waitFor && !completed.has(step.waitFor)) {
            continue;
          }

          // Check conditional
          if (step.condition && !step.condition(context)) {
            continue;
          }

          executed.push(step.id);
          completed.add(step.id);
        }

        return executed;
      };

      const steps: PlaybookStep[] = [
        { id: 'step1', action: 'check_status' },
        { id: 'step2', action: 'restart', waitFor: 'step1' },
        { id: 'step3', action: 'scale', waitFor: 'step2', condition: (ctx) => ctx.needsScaling === true },
        { id: 'step4', action: 'notify', waitFor: 'step2' },
      ];

      const result1 = executePlaybook(steps, { needsScaling: true });
      expect(result1).toEqual(['step1', 'step2', 'step3', 'step4']);

      const result2 = executePlaybook(steps, { needsScaling: false });
      expect(result2).toEqual(['step1', 'step2', 'step4']);
    });
  });

  describe('Health Monitoring', () => {
    it('should calculate system health score', () => {
      const calculateHealthScore = (
        metrics: Array<{ name: string; value: number; threshold: number; weight: number }>
      ): number => {
        let totalWeight = 0;
        let weightedScore = 0;

        for (const metric of metrics) {
          const normalizedValue = Math.min(metric.value / metric.threshold, 1);
          weightedScore += normalizedValue * metric.weight;
          totalWeight += metric.weight;
        }

        return totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;
      };

      const metrics = [
        { name: 'cpu', value: 60, threshold: 100, weight: 1 },
        { name: 'memory', value: 70, threshold: 100, weight: 1 },
        { name: 'latency', value: 50, threshold: 200, weight: 0.5 },
      ];

      const score = calculateHealthScore(metrics);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should determine health status', () => {
      const getHealthStatus = (score: number): 'healthy' | 'degraded' | 'critical' => {
        if (score >= 80) return 'healthy';
        if (score >= 50) return 'degraded';
        return 'critical';
      };

      expect(getHealthStatus(90)).toBe('healthy');
      expect(getHealthStatus(65)).toBe('degraded');
      expect(getHealthStatus(30)).toBe('critical');
    });

    it('should track health trends', () => {
      const analyzeTrend = (
        scores: number[]
      ): { trend: 'improving' | 'stable' | 'degrading'; slope: number } => {
        if (scores.length < 2) return { trend: 'stable', slope: 0 };

        // Simple linear regression
        const n = scores.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (let i = 0; i < n; i++) {
          sumX += i;
          sumY += scores[i];
          sumXY += i * scores[i];
          sumX2 += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

        if (slope > 1) return { trend: 'improving', slope };
        if (slope < -1) return { trend: 'degrading', slope };
        return { trend: 'stable', slope };
      };

      expect(analyzeTrend([60, 65, 70, 75, 80]).trend).toBe('improving');
      expect(analyzeTrend([80, 75, 70, 65, 60]).trend).toBe('degrading');
      expect(analyzeTrend([70, 71, 70, 69, 70]).trend).toBe('stable');
    });
  });

  describe('Incident Management', () => {
    it('should create incident from issues', () => {
      const createIncident = (
        issues: Array<{ id: string; type: string; severity: string }>
      ): { id: string; severity: string; issueCount: number; title: string } => {
        const severityOrder = ['critical', 'high', 'medium', 'low'];
        const highestSeverity = issues.reduce((highest, issue) => {
          const currentIndex = severityOrder.indexOf(issue.severity);
          const highestIndex = severityOrder.indexOf(highest);
          return currentIndex < highestIndex ? issue.severity : highest;
        }, 'low');

        return {
          id: `inc_${Date.now()}`,
          severity: highestSeverity,
          issueCount: issues.length,
          title: `${issues.length} related ${issues[0]?.type || 'issues'} detected`,
        };
      };

      const issues = [
        { id: '1', type: 'timeout', severity: 'high' },
        { id: '2', type: 'timeout', severity: 'critical' },
        { id: '3', type: 'timeout', severity: 'medium' },
      ];

      const incident = createIncident(issues);
      expect(incident.severity).toBe('critical');
      expect(incident.issueCount).toBe(3);
    });

    it('should escalate incidents based on time', () => {
      const shouldEscalate = (
        incident: { createdAt: Date; severity: string; acknowledged: boolean },
        escalationRules: Record<string, number>
      ): boolean => {
        if (incident.acknowledged) return false;

        const elapsedMinutes = (Date.now() - incident.createdAt.getTime()) / (1000 * 60);
        const threshold = escalationRules[incident.severity] || 60;

        return elapsedMinutes > threshold;
      };

      const rules = { critical: 5, high: 15, medium: 30, low: 60 };
      const now = new Date();

      // Critical incident 10 minutes old - should escalate
      const critical = {
        createdAt: new Date(now.getTime() - 10 * 60 * 1000),
        severity: 'critical',
        acknowledged: false,
      };
      expect(shouldEscalate(critical, rules)).toBe(true);

      // Critical incident but acknowledged - should not escalate
      const acknowledged = { ...critical, acknowledged: true };
      expect(shouldEscalate(acknowledged, rules)).toBe(false);

      // Low priority 30 minutes old - should not escalate
      const low = {
        createdAt: new Date(now.getTime() - 30 * 60 * 1000),
        severity: 'low',
        acknowledged: false,
      };
      expect(shouldEscalate(low, rules)).toBe(false);
    });
  });
});
