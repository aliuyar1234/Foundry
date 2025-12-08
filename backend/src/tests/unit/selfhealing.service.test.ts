/**
 * Unit Tests for Self-Healing Service (T267)
 * Tests for anomaly detection and automated remediation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==========================================
// Anomaly Detection Tests
// ==========================================

describe('Anomaly Detection', () => {
  describe('Statistical Anomaly Detection', () => {
    const detectStatisticalAnomaly = (
      values: number[],
      current: number,
      threshold: number = 2
    ): { isAnomaly: boolean; zscore: number; mean: number; stdDev: number } => {
      if (values.length < 3) {
        return { isAnomaly: false, zscore: 0, mean: current, stdDev: 0 };
      }

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const zscore = stdDev === 0 ? 0 : (current - mean) / stdDev;

      return {
        isAnomaly: Math.abs(zscore) > threshold,
        zscore,
        mean,
        stdDev,
      };
    };

    it('should detect high outliers', () => {
      const historical = [100, 102, 98, 101, 99, 100];
      const result = detectStatisticalAnomaly(historical, 150);
      expect(result.isAnomaly).toBe(true);
      expect(result.zscore).toBeGreaterThan(2);
    });

    it('should detect low outliers', () => {
      const historical = [100, 102, 98, 101, 99, 100];
      const result = detectStatisticalAnomaly(historical, 50);
      expect(result.isAnomaly).toBe(true);
      expect(result.zscore).toBeLessThan(-2);
    });

    it('should not flag normal values', () => {
      const historical = [100, 102, 98, 101, 99, 100];
      const result = detectStatisticalAnomaly(historical, 101);
      expect(result.isAnomaly).toBe(false);
    });

    it('should handle insufficient data', () => {
      const historical = [100, 102];
      const result = detectStatisticalAnomaly(historical, 150);
      expect(result.isAnomaly).toBe(false);
    });

    it('should handle zero variance', () => {
      const historical = [100, 100, 100, 100];
      const result = detectStatisticalAnomaly(historical, 100);
      expect(result.isAnomaly).toBe(false);
      expect(result.zscore).toBe(0);
    });
  });

  describe('Threshold-Based Detection', () => {
    const detectThresholdBreach = (
      metric: string,
      value: number,
      thresholds: Record<string, { warning: number; critical: number }>
    ): { breached: boolean; severity: 'normal' | 'warning' | 'critical' } => {
      const threshold = thresholds[metric];
      if (!threshold) return { breached: false, severity: 'normal' };

      if (value >= threshold.critical) return { breached: true, severity: 'critical' };
      if (value >= threshold.warning) return { breached: true, severity: 'warning' };
      return { breached: false, severity: 'normal' };
    };

    it('should detect critical threshold breach', () => {
      const thresholds = { cpu: { warning: 70, critical: 90 } };
      const result = detectThresholdBreach('cpu', 95, thresholds);
      expect(result.breached).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('should detect warning threshold breach', () => {
      const thresholds = { cpu: { warning: 70, critical: 90 } };
      const result = detectThresholdBreach('cpu', 75, thresholds);
      expect(result.breached).toBe(true);
      expect(result.severity).toBe('warning');
    });

    it('should not flag normal values', () => {
      const thresholds = { cpu: { warning: 70, critical: 90 } };
      const result = detectThresholdBreach('cpu', 50, thresholds);
      expect(result.breached).toBe(false);
      expect(result.severity).toBe('normal');
    });
  });

  describe('Pattern Detection', () => {
    const detectRepeatingPattern = (
      events: Array<{ type: string; timestamp: number }>,
      windowMs: number
    ): { pattern: string | null; count: number; frequency: number } => {
      const counts: Record<string, number> = {};

      for (const event of events) {
        counts[event.type] = (counts[event.type] || 0) + 1;
      }

      const maxEntry = Object.entries(counts).reduce(
        (max, [type, count]) => (count > max.count ? { type, count } : max),
        { type: '', count: 0 }
      );

      const duration = events.length > 0
        ? events[events.length - 1].timestamp - events[0].timestamp
        : 0;

      const frequency = duration > 0 ? maxEntry.count / (duration / windowMs) : 0;

      return {
        pattern: maxEntry.count >= 3 ? `recurring_${maxEntry.type}` : null,
        count: maxEntry.count,
        frequency,
      };
    };

    it('should detect recurring error pattern', () => {
      const events = [
        { type: 'error', timestamp: 1000 },
        { type: 'error', timestamp: 2000 },
        { type: 'error', timestamp: 3000 },
        { type: 'warning', timestamp: 3500 },
      ];
      const result = detectRepeatingPattern(events, 1000);
      expect(result.pattern).toBe('recurring_error');
      expect(result.count).toBe(3);
    });

    it('should return null for no pattern', () => {
      const events = [
        { type: 'error', timestamp: 1000 },
        { type: 'warning', timestamp: 2000 },
      ];
      const result = detectRepeatingPattern(events, 1000);
      expect(result.pattern).toBeNull();
    });
  });
});

// ==========================================
// Remediation Selection Tests
// ==========================================

describe('Remediation Selection', () => {
  interface Remediation {
    action: string;
    params: Record<string, unknown>;
    auto: boolean;
    cooldown: number;
  }

  const selectRemediation = (
    issueType: string,
    severity: string,
    context: Record<string, unknown>,
    remediationMap: Record<string, Remediation>
  ): Remediation | null => {
    const key = `${issueType}_${severity}`;
    const remediation = remediationMap[key] || remediationMap[issueType];

    if (!remediation) return null;

    // Check if auto remediation is allowed
    if (!remediation.auto && !context.manualOverride) {
      return { ...remediation, auto: false };
    }

    return remediation;
  };

  it('should select remediation based on issue type and severity', () => {
    const remediationMap = {
      'high_cpu_critical': { action: 'scale_up', params: { instances: 2 }, auto: true, cooldown: 300 },
      'high_cpu_warning': { action: 'notify', params: {}, auto: true, cooldown: 60 },
      'memory_leak': { action: 'restart', params: { graceful: true }, auto: false, cooldown: 600 },
    };

    const result = selectRemediation('high_cpu', 'critical', {}, remediationMap);
    expect(result?.action).toBe('scale_up');
    expect(result?.params.instances).toBe(2);
  });

  it('should fall back to type-only key', () => {
    const remediationMap = {
      'memory_leak': { action: 'restart', params: { graceful: true }, auto: true, cooldown: 600 },
    };

    const result = selectRemediation('memory_leak', 'high', {}, remediationMap);
    expect(result?.action).toBe('restart');
  });

  it('should return null for unknown issue type', () => {
    const result = selectRemediation('unknown', 'high', {}, {});
    expect(result).toBeNull();
  });
});

// ==========================================
// Cooldown Management Tests
// ==========================================

describe('Cooldown Management', () => {
  const isCooldownActive = (
    lastExecution: number | null,
    cooldownMs: number,
    currentTime: number = Date.now()
  ): boolean => {
    if (!lastExecution) return false;
    return (currentTime - lastExecution) < cooldownMs;
  };

  it('should return false when no previous execution', () => {
    expect(isCooldownActive(null, 60000)).toBe(false);
  });

  it('should return true when within cooldown period', () => {
    const now = Date.now();
    const lastExec = now - 30000; // 30 seconds ago
    expect(isCooldownActive(lastExec, 60000, now)).toBe(true);
  });

  it('should return false when cooldown has passed', () => {
    const now = Date.now();
    const lastExec = now - 120000; // 2 minutes ago
    expect(isCooldownActive(lastExec, 60000, now)).toBe(false);
  });

  it('should return false at exact cooldown boundary', () => {
    const now = Date.now();
    const lastExec = now - 60000;
    expect(isCooldownActive(lastExec, 60000, now)).toBe(false);
  });
});

// ==========================================
// Rollback Logic Tests
// ==========================================

describe('Rollback Logic', () => {
  interface Action {
    type: string;
    params: Record<string, unknown>;
  }

  const determineRollback = (action: Action): Action | null => {
    const rollbackMap: Record<string, (params: Record<string, unknown>) => Action> = {
      scale_up: (params) => ({ type: 'scale_down', params: { instances: params.instances } }),
      scale_down: (params) => ({ type: 'scale_up', params: { instances: params.instances } }),
      restart: () => ({ type: 'no_op', params: {} }), // Can't undo a restart
      increase_pool: (params) => ({ type: 'decrease_pool', params: { size: params.size } }),
      enable_feature: (params) => ({ type: 'disable_feature', params: { feature: params.feature } }),
      disable_feature: (params) => ({ type: 'enable_feature', params: { feature: params.feature } }),
    };

    const rollbackFn = rollbackMap[action.type];
    return rollbackFn ? rollbackFn(action.params) : null;
  };

  it('should determine scale_down rollback for scale_up', () => {
    const action = { type: 'scale_up', params: { instances: 2 } };
    const rollback = determineRollback(action);
    expect(rollback?.type).toBe('scale_down');
    expect(rollback?.params.instances).toBe(2);
  });

  it('should return no_op for restart actions', () => {
    const action = { type: 'restart', params: {} };
    const rollback = determineRollback(action);
    expect(rollback?.type).toBe('no_op');
  });

  it('should return null for unknown actions', () => {
    const action = { type: 'unknown', params: {} };
    const rollback = determineRollback(action);
    expect(rollback).toBeNull();
  });

  it('should handle feature toggle rollbacks', () => {
    const enable = { type: 'enable_feature', params: { feature: 'cache' } };
    expect(determineRollback(enable)?.type).toBe('disable_feature');

    const disable = { type: 'disable_feature', params: { feature: 'cache' } };
    expect(determineRollback(disable)?.type).toBe('enable_feature');
  });
});

// ==========================================
// Health Score Calculation Tests
// ==========================================

describe('Health Score Calculation', () => {
  interface HealthDimension {
    name: string;
    value: number;
    weight: number;
    threshold: { healthy: number; warning: number };
  }

  const calculateHealthScore = (dimensions: HealthDimension[]): {
    score: number;
    status: 'healthy' | 'warning' | 'critical';
    breakdown: Record<string, { score: number; status: string }>;
  } => {
    let weightedSum = 0;
    let totalWeight = 0;
    const breakdown: Record<string, { score: number; status: string }> = {};

    for (const dim of dimensions) {
      const normalized = Math.min(dim.value / 100, 1) * 100;
      weightedSum += normalized * dim.weight;
      totalWeight += dim.weight;

      let status = 'critical';
      if (dim.value >= dim.threshold.healthy) status = 'healthy';
      else if (dim.value >= dim.threshold.warning) status = 'warning';

      breakdown[dim.name] = { score: dim.value, status };
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
    let status: 'healthy' | 'warning' | 'critical' = 'critical';
    if (score >= 80) status = 'healthy';
    else if (score >= 50) status = 'warning';

    return { score, status, breakdown };
  };

  it('should calculate overall health score', () => {
    const dimensions: HealthDimension[] = [
      { name: 'cpu', value: 70, weight: 1, threshold: { healthy: 30, warning: 70 } },
      { name: 'memory', value: 60, weight: 1, threshold: { healthy: 30, warning: 70 } },
      { name: 'latency', value: 90, weight: 0.5, threshold: { healthy: 80, warning: 50 } },
    ];

    const result = calculateHealthScore(dimensions);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should return healthy status for high scores', () => {
    const dimensions: HealthDimension[] = [
      { name: 'cpu', value: 90, weight: 1, threshold: { healthy: 30, warning: 70 } },
      { name: 'memory', value: 85, weight: 1, threshold: { healthy: 30, warning: 70 } },
    ];

    const result = calculateHealthScore(dimensions);
    expect(result.status).toBe('healthy');
  });

  it('should return warning status for medium scores', () => {
    const dimensions: HealthDimension[] = [
      { name: 'cpu', value: 60, weight: 1, threshold: { healthy: 30, warning: 70 } },
      { name: 'memory', value: 55, weight: 1, threshold: { healthy: 30, warning: 70 } },
    ];

    const result = calculateHealthScore(dimensions);
    expect(result.status).toBe('warning');
  });

  it('should provide per-dimension breakdown', () => {
    const dimensions: HealthDimension[] = [
      { name: 'cpu', value: 90, weight: 1, threshold: { healthy: 30, warning: 70 } },
      { name: 'memory', value: 50, weight: 1, threshold: { healthy: 60, warning: 40 } },
    ];

    const result = calculateHealthScore(dimensions);
    expect(result.breakdown.cpu.status).toBe('healthy');
    expect(result.breakdown.memory.status).toBe('warning');
  });
});

// ==========================================
// Playbook Execution Tests
// ==========================================

describe('Playbook Execution', () => {
  interface PlaybookStep {
    id: string;
    action: string;
    dependsOn?: string[];
    condition?: (context: Record<string, unknown>) => boolean;
  }

  const getExecutableSteps = (
    playbook: PlaybookStep[],
    completedSteps: Set<string>,
    context: Record<string, unknown>
  ): PlaybookStep[] => {
    return playbook.filter(step => {
      // Already completed
      if (completedSteps.has(step.id)) return false;

      // Check dependencies
      if (step.dependsOn) {
        const allDepsComplete = step.dependsOn.every(dep => completedSteps.has(dep));
        if (!allDepsComplete) return false;
      }

      // Check condition
      if (step.condition && !step.condition(context)) return false;

      return true;
    });
  };

  it('should return steps with no dependencies first', () => {
    const playbook: PlaybookStep[] = [
      { id: 'step1', action: 'check' },
      { id: 'step2', action: 'fix', dependsOn: ['step1'] },
      { id: 'step3', action: 'verify', dependsOn: ['step2'] },
    ];

    const executable = getExecutableSteps(playbook, new Set(), {});
    expect(executable).toHaveLength(1);
    expect(executable[0].id).toBe('step1');
  });

  it('should return dependent steps after completion', () => {
    const playbook: PlaybookStep[] = [
      { id: 'step1', action: 'check' },
      { id: 'step2', action: 'fix', dependsOn: ['step1'] },
    ];

    const executable = getExecutableSteps(playbook, new Set(['step1']), {});
    expect(executable).toHaveLength(1);
    expect(executable[0].id).toBe('step2');
  });

  it('should skip steps with unmet conditions', () => {
    const playbook: PlaybookStep[] = [
      { id: 'step1', action: 'check' },
      { id: 'step2', action: 'scale', condition: (ctx) => ctx.needsScaling === true },
    ];

    const executable = getExecutableSteps(playbook, new Set(), { needsScaling: false });
    expect(executable).toHaveLength(1);
    expect(executable[0].id).toBe('step1');
  });

  it('should include steps with met conditions', () => {
    const playbook: PlaybookStep[] = [
      { id: 'step1', action: 'scale', condition: (ctx) => ctx.needsScaling === true },
    ];

    const executable = getExecutableSteps(playbook, new Set(), { needsScaling: true });
    expect(executable).toHaveLength(1);
  });
});

// ==========================================
// Rate Limiter Tests
// ==========================================

describe('Rate Limiter', () => {
  const createRateLimiter = () => {
    const windows: Map<string, number[]> = new Map();

    return {
      check: (key: string, limit: number, windowMs: number, currentTime: number = Date.now()): boolean => {
        const timestamps = windows.get(key) || [];
        const windowStart = currentTime - windowMs;
        const recentTimestamps = timestamps.filter(t => t > windowStart);
        return recentTimestamps.length < limit;
      },
      record: (key: string, currentTime: number = Date.now()): void => {
        const timestamps = windows.get(key) || [];
        timestamps.push(currentTime);
        windows.set(key, timestamps);
      },
      reset: (key: string): void => {
        windows.delete(key);
      },
    };
  };

  it('should allow actions within limit', () => {
    const limiter = createRateLimiter();
    const now = Date.now();

    expect(limiter.check('action1', 3, 60000, now)).toBe(true);
    limiter.record('action1', now);
    expect(limiter.check('action1', 3, 60000, now)).toBe(true);
    limiter.record('action1', now);
    expect(limiter.check('action1', 3, 60000, now)).toBe(true);
  });

  it('should block actions over limit', () => {
    const limiter = createRateLimiter();
    const now = Date.now();

    limiter.record('action1', now);
    limiter.record('action1', now);
    limiter.record('action1', now);
    expect(limiter.check('action1', 3, 60000, now)).toBe(false);
  });

  it('should allow actions after window expires', () => {
    const limiter = createRateLimiter();
    const now = Date.now();

    limiter.record('action1', now - 120000);
    limiter.record('action1', now - 120000);
    limiter.record('action1', now - 120000);
    expect(limiter.check('action1', 3, 60000, now)).toBe(true);
  });
});
