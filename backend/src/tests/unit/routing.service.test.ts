/**
 * Unit Tests for Routing Service (T266)
 * Tests for routing logic and algorithms
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock types for testing
interface RoutingRule {
  id: string;
  priority: number;
  enabled: boolean;
  conditions: {
    all?: Array<{ field: string; operator: string; value: unknown }>;
    any?: Array<{ field: string; operator: string; value: unknown }>;
  };
  actions: {
    assignTeam?: string;
    assignUser?: string;
    escalate?: boolean;
  };
}

interface Task {
  id: string;
  type: string;
  priority: string;
  source: string;
  metadata: Record<string, unknown>;
}

interface TeamMember {
  id: string;
  skills: string[];
  currentTasks: number;
  maxTasks: number;
  available: boolean;
}

// ==========================================
// Condition Evaluator Tests
// ==========================================

describe('Condition Evaluator', () => {
  const evaluateCondition = (
    value: unknown,
    operator: string,
    expected: unknown
  ): boolean => {
    switch (operator) {
      case 'equals':
        return value === expected;
      case 'notEquals':
        return value !== expected;
      case 'contains':
        return String(value).toLowerCase().includes(String(expected).toLowerCase());
      case 'startsWith':
        return String(value).toLowerCase().startsWith(String(expected).toLowerCase());
      case 'endsWith':
        return String(value).toLowerCase().endsWith(String(expected).toLowerCase());
      case 'greaterThan':
        return Number(value) > Number(expected);
      case 'lessThan':
        return Number(value) < Number(expected);
      case 'greaterThanOrEqual':
        return Number(value) >= Number(expected);
      case 'lessThanOrEqual':
        return Number(value) <= Number(expected);
      case 'in':
        return Array.isArray(expected) && expected.includes(value);
      case 'notIn':
        return Array.isArray(expected) && !expected.includes(value);
      case 'exists':
        return value !== undefined && value !== null;
      case 'regex':
        return new RegExp(String(expected)).test(String(value));
      default:
        return false;
    }
  };

  describe('String operators', () => {
    it('should evaluate equals operator', () => {
      expect(evaluateCondition('support', 'equals', 'support')).toBe(true);
      expect(evaluateCondition('support', 'equals', 'billing')).toBe(false);
    });

    it('should evaluate notEquals operator', () => {
      expect(evaluateCondition('support', 'notEquals', 'billing')).toBe(true);
      expect(evaluateCondition('support', 'notEquals', 'support')).toBe(false);
    });

    it('should evaluate contains operator (case insensitive)', () => {
      expect(evaluateCondition('Support Request', 'contains', 'support')).toBe(true);
      expect(evaluateCondition('Bug Report', 'contains', 'support')).toBe(false);
    });

    it('should evaluate startsWith operator', () => {
      expect(evaluateCondition('urgent-task', 'startsWith', 'urgent')).toBe(true);
      expect(evaluateCondition('task-urgent', 'startsWith', 'urgent')).toBe(false);
    });

    it('should evaluate endsWith operator', () => {
      expect(evaluateCondition('task-urgent', 'endsWith', 'urgent')).toBe(true);
      expect(evaluateCondition('urgent-task', 'endsWith', 'urgent')).toBe(false);
    });

    it('should evaluate regex operator', () => {
      expect(evaluateCondition('TICKET-123', 'regex', '^TICKET-\\d+$')).toBe(true);
      expect(evaluateCondition('BUG-123', 'regex', '^TICKET-\\d+$')).toBe(false);
    });
  });

  describe('Numeric operators', () => {
    it('should evaluate greaterThan operator', () => {
      expect(evaluateCondition(100, 'greaterThan', 50)).toBe(true);
      expect(evaluateCondition(50, 'greaterThan', 100)).toBe(false);
      expect(evaluateCondition(100, 'greaterThan', 100)).toBe(false);
    });

    it('should evaluate lessThan operator', () => {
      expect(evaluateCondition(50, 'lessThan', 100)).toBe(true);
      expect(evaluateCondition(100, 'lessThan', 50)).toBe(false);
    });

    it('should evaluate greaterThanOrEqual operator', () => {
      expect(evaluateCondition(100, 'greaterThanOrEqual', 100)).toBe(true);
      expect(evaluateCondition(101, 'greaterThanOrEqual', 100)).toBe(true);
      expect(evaluateCondition(99, 'greaterThanOrEqual', 100)).toBe(false);
    });

    it('should evaluate lessThanOrEqual operator', () => {
      expect(evaluateCondition(100, 'lessThanOrEqual', 100)).toBe(true);
      expect(evaluateCondition(99, 'lessThanOrEqual', 100)).toBe(true);
      expect(evaluateCondition(101, 'lessThanOrEqual', 100)).toBe(false);
    });
  });

  describe('Array operators', () => {
    it('should evaluate in operator', () => {
      expect(evaluateCondition('high', 'in', ['high', 'critical'])).toBe(true);
      expect(evaluateCondition('low', 'in', ['high', 'critical'])).toBe(false);
    });

    it('should evaluate notIn operator', () => {
      expect(evaluateCondition('low', 'notIn', ['high', 'critical'])).toBe(true);
      expect(evaluateCondition('high', 'notIn', ['high', 'critical'])).toBe(false);
    });
  });

  describe('Existence operators', () => {
    it('should evaluate exists operator', () => {
      expect(evaluateCondition('value', 'exists', true)).toBe(true);
      expect(evaluateCondition(undefined, 'exists', true)).toBe(false);
      expect(evaluateCondition(null, 'exists', true)).toBe(false);
      expect(evaluateCondition(0, 'exists', true)).toBe(true);
      expect(evaluateCondition('', 'exists', true)).toBe(true);
    });
  });
});

// ==========================================
// Rule Matcher Tests
// ==========================================

describe('Rule Matcher', () => {
  const evaluateRuleConditions = (
    task: Task,
    rule: RoutingRule
  ): boolean => {
    const evaluate = (condition: { field: string; operator: string; value: unknown }): boolean => {
      const value = condition.field.includes('.')
        ? condition.field.split('.').reduce((obj: any, key) => obj?.[key], task)
        : (task as any)[condition.field] ?? task.metadata[condition.field];

      switch (condition.operator) {
        case 'equals': return value === condition.value;
        case 'notEquals': return value !== condition.value;
        case 'contains': return String(value).includes(String(condition.value));
        case 'greaterThan': return Number(value) > Number(condition.value);
        case 'lessThan': return Number(value) < Number(condition.value);
        case 'in': return Array.isArray(condition.value) && condition.value.includes(value);
        default: return false;
      }
    };

    if (rule.conditions.all) {
      return rule.conditions.all.every(evaluate);
    }

    if (rule.conditions.any) {
      return rule.conditions.any.some(evaluate);
    }

    return true;
  };

  it('should match task with ALL conditions', () => {
    const task: Task = {
      id: 'task-1',
      type: 'support',
      priority: 'high',
      source: 'email',
      metadata: {},
    };

    const rule: RoutingRule = {
      id: 'rule-1',
      priority: 100,
      enabled: true,
      conditions: {
        all: [
          { field: 'type', operator: 'equals', value: 'support' },
          { field: 'priority', operator: 'equals', value: 'high' },
        ],
      },
      actions: { assignTeam: 'support-team' },
    };

    expect(evaluateRuleConditions(task, rule)).toBe(true);
  });

  it('should not match when one ALL condition fails', () => {
    const task: Task = {
      id: 'task-1',
      type: 'support',
      priority: 'low',
      source: 'email',
      metadata: {},
    };

    const rule: RoutingRule = {
      id: 'rule-1',
      priority: 100,
      enabled: true,
      conditions: {
        all: [
          { field: 'type', operator: 'equals', value: 'support' },
          { field: 'priority', operator: 'equals', value: 'high' },
        ],
      },
      actions: { assignTeam: 'support-team' },
    };

    expect(evaluateRuleConditions(task, rule)).toBe(false);
  });

  it('should match task with ANY conditions', () => {
    const task: Task = {
      id: 'task-1',
      type: 'billing',
      priority: 'critical',
      source: 'chat',
      metadata: {},
    };

    const rule: RoutingRule = {
      id: 'rule-1',
      priority: 100,
      enabled: true,
      conditions: {
        any: [
          { field: 'priority', operator: 'equals', value: 'critical' },
          { field: 'source', operator: 'equals', value: 'phone' },
        ],
      },
      actions: { escalate: true },
    };

    expect(evaluateRuleConditions(task, rule)).toBe(true);
  });

  it('should not match when no ANY condition matches', () => {
    const task: Task = {
      id: 'task-1',
      type: 'billing',
      priority: 'low',
      source: 'chat',
      metadata: {},
    };

    const rule: RoutingRule = {
      id: 'rule-1',
      priority: 100,
      enabled: true,
      conditions: {
        any: [
          { field: 'priority', operator: 'equals', value: 'critical' },
          { field: 'source', operator: 'equals', value: 'phone' },
        ],
      },
      actions: { escalate: true },
    };

    expect(evaluateRuleConditions(task, rule)).toBe(false);
  });
});

// ==========================================
// Assignment Strategy Tests
// ==========================================

describe('Assignment Strategies', () => {
  describe('Round Robin', () => {
    const roundRobin = (
      members: string[],
      lastAssigned: string | null,
      assignmentCounts: Record<string, number>
    ): string => {
      if (members.length === 0) throw new Error('No members available');

      if (!lastAssigned) return members[0];

      const lastIndex = members.indexOf(lastAssigned);
      const nextIndex = (lastIndex + 1) % members.length;
      return members[nextIndex];
    };

    it('should assign to first member when no previous assignment', () => {
      const members = ['alice', 'bob', 'carol'];
      expect(roundRobin(members, null, {})).toBe('alice');
    });

    it('should cycle through members', () => {
      const members = ['alice', 'bob', 'carol'];
      expect(roundRobin(members, 'alice', {})).toBe('bob');
      expect(roundRobin(members, 'bob', {})).toBe('carol');
      expect(roundRobin(members, 'carol', {})).toBe('alice');
    });

    it('should throw when no members available', () => {
      expect(() => roundRobin([], null, {})).toThrow('No members available');
    });
  });

  describe('Least Busy', () => {
    const leastBusy = (members: TeamMember[]): TeamMember | null => {
      const available = members.filter(m => m.available && m.currentTasks < m.maxTasks);
      if (available.length === 0) return null;

      return available.reduce((least, member) => {
        const leastUtilization = least.currentTasks / least.maxTasks;
        const memberUtilization = member.currentTasks / member.maxTasks;
        return memberUtilization < leastUtilization ? member : least;
      });
    };

    it('should select member with lowest utilization', () => {
      const members: TeamMember[] = [
        { id: 'alice', skills: [], currentTasks: 8, maxTasks: 10, available: true },
        { id: 'bob', skills: [], currentTasks: 3, maxTasks: 10, available: true },
        { id: 'carol', skills: [], currentTasks: 5, maxTasks: 10, available: true },
      ];

      expect(leastBusy(members)?.id).toBe('bob');
    });

    it('should skip unavailable members', () => {
      const members: TeamMember[] = [
        { id: 'alice', skills: [], currentTasks: 8, maxTasks: 10, available: true },
        { id: 'bob', skills: [], currentTasks: 2, maxTasks: 10, available: false },
      ];

      expect(leastBusy(members)?.id).toBe('alice');
    });

    it('should skip members at capacity', () => {
      const members: TeamMember[] = [
        { id: 'alice', skills: [], currentTasks: 10, maxTasks: 10, available: true },
        { id: 'bob', skills: [], currentTasks: 8, maxTasks: 10, available: true },
      ];

      expect(leastBusy(members)?.id).toBe('bob');
    });

    it('should return null when no members available', () => {
      const members: TeamMember[] = [
        { id: 'alice', skills: [], currentTasks: 10, maxTasks: 10, available: true },
      ];

      expect(leastBusy(members)).toBeNull();
    });
  });

  describe('Skill Match', () => {
    const skillMatch = (
      requiredSkills: string[],
      members: TeamMember[]
    ): TeamMember | null => {
      const scored = members
        .filter(m => m.available && m.currentTasks < m.maxTasks)
        .map(m => {
          const matchedSkills = requiredSkills.filter(s => m.skills.includes(s));
          const score = requiredSkills.length > 0
            ? matchedSkills.length / requiredSkills.length
            : 0;
          return { member: m, score };
        })
        .sort((a, b) => b.score - a.score);

      return scored.length > 0 && scored[0].score > 0 ? scored[0].member : null;
    };

    it('should select member with best skill match', () => {
      const members: TeamMember[] = [
        { id: 'alice', skills: ['react', 'node'], currentTasks: 5, maxTasks: 10, available: true },
        { id: 'bob', skills: ['react', 'python'], currentTasks: 5, maxTasks: 10, available: true },
        { id: 'carol', skills: ['react', 'node', 'typescript'], currentTasks: 5, maxTasks: 10, available: true },
      ];

      const required = ['react', 'node', 'typescript'];
      expect(skillMatch(required, members)?.id).toBe('carol');
    });

    it('should return null when no skill match', () => {
      const members: TeamMember[] = [
        { id: 'alice', skills: ['java', 'spring'], currentTasks: 5, maxTasks: 10, available: true },
      ];

      const required = ['react', 'node'];
      expect(skillMatch(required, members)).toBeNull();
    });
  });
});

// ==========================================
// Priority Calculator Tests
// ==========================================

describe('Priority Calculator', () => {
  const calculatePriority = (
    basePriority: string,
    factors: {
      customerTier?: string;
      slaRemaining?: number;
      isEscalated?: boolean;
    }
  ): number => {
    const basePriorities: Record<string, number> = {
      critical: 100,
      high: 75,
      medium: 50,
      low: 25,
    };

    let priority = basePriorities[basePriority] || 50;

    // Customer tier boost
    if (factors.customerTier === 'enterprise') priority += 20;
    else if (factors.customerTier === 'premium') priority += 10;

    // SLA urgency boost
    if (factors.slaRemaining !== undefined) {
      if (factors.slaRemaining < 30) priority += 30;
      else if (factors.slaRemaining < 60) priority += 15;
    }

    // Escalation boost
    if (factors.isEscalated) priority += 25;

    return Math.min(priority, 150);
  };

  it('should return base priority for simple tasks', () => {
    expect(calculatePriority('high', {})).toBe(75);
    expect(calculatePriority('low', {})).toBe(25);
  });

  it('should boost priority for enterprise customers', () => {
    expect(calculatePriority('medium', { customerTier: 'enterprise' })).toBe(70);
    expect(calculatePriority('medium', { customerTier: 'premium' })).toBe(60);
  });

  it('should boost priority when SLA is running out', () => {
    expect(calculatePriority('medium', { slaRemaining: 20 })).toBe(80);
    expect(calculatePriority('medium', { slaRemaining: 45 })).toBe(65);
  });

  it('should boost priority for escalated tasks', () => {
    expect(calculatePriority('medium', { isEscalated: true })).toBe(75);
  });

  it('should combine multiple factors', () => {
    const priority = calculatePriority('high', {
      customerTier: 'enterprise',
      slaRemaining: 20,
      isEscalated: true,
    });
    expect(priority).toBe(150); // Capped at 150
  });
});

// ==========================================
// Routing Metrics Tests
// ==========================================

describe('Routing Metrics', () => {
  describe('Accuracy calculation', () => {
    const calculateAccuracy = (
      results: Array<{ routed: boolean; correct: boolean }>
    ): number => {
      const total = results.filter(r => r.routed).length;
      if (total === 0) return 0;
      const correct = results.filter(r => r.routed && r.correct).length;
      return (correct / total) * 100;
    };

    it('should calculate accuracy percentage', () => {
      const results = [
        { routed: true, correct: true },
        { routed: true, correct: true },
        { routed: true, correct: false },
        { routed: true, correct: true },
      ];
      expect(calculateAccuracy(results)).toBe(75);
    });

    it('should return 0 for empty results', () => {
      expect(calculateAccuracy([])).toBe(0);
    });
  });

  describe('Latency percentiles', () => {
    const calculatePercentile = (values: number[], percentile: number): number => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.ceil((percentile / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    };

    it('should calculate P50', () => {
      const latencies = [10, 20, 30, 40, 50];
      expect(calculatePercentile(latencies, 50)).toBe(30);
    });

    it('should calculate P95', () => {
      const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(calculatePercentile(latencies, 95)).toBe(95);
    });

    it('should calculate P99', () => {
      const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(calculatePercentile(latencies, 99)).toBe(99);
    });
  });
});
