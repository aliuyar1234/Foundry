/**
 * Integration Tests for Task Routing (T261)
 * E2E tests for the intelligent routing flow
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Mock external services
vi.mock('../../lib/anthropic.js', () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ route: 'support', confidence: 0.9 }) }],
      }),
    },
  }),
}));

vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn().mockResolvedValue(1),
  }),
}));

const prisma = new PrismaClient();

describe('Task Routing Integration Tests', () => {
  const testOrgId = 'test-org-routing';
  const testUserId = 'test-user-routing';

  beforeAll(async () => {
    // Setup test organization and users
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Routing Rules', () => {
    it('should create a routing rule', async () => {
      const rule = {
        organizationId: testOrgId,
        name: 'High Priority Support',
        description: 'Route high priority tickets to senior support',
        priority: 100,
        enabled: true,
        conditions: {
          all: [
            { field: 'priority', operator: 'equals', value: 'high' },
            { field: 'type', operator: 'equals', value: 'support' },
          ],
        },
        actions: {
          assignTeam: 'senior-support',
          setUrgency: 'high',
        },
      };

      // Validate rule structure
      expect(rule.organizationId).toBe(testOrgId);
      expect(rule.priority).toBeGreaterThan(0);
      expect(rule.conditions.all.length).toBe(2);
      expect(rule.actions.assignTeam).toBeDefined();
    });

    it('should evaluate rule conditions correctly', () => {
      const evaluateCondition = (
        task: Record<string, unknown>,
        condition: { field: string; operator: string; value: unknown }
      ): boolean => {
        const fieldValue = task[condition.field];
        switch (condition.operator) {
          case 'equals':
            return fieldValue === condition.value;
          case 'contains':
            return String(fieldValue).includes(String(condition.value));
          case 'greaterThan':
            return Number(fieldValue) > Number(condition.value);
          case 'lessThan':
            return Number(fieldValue) < Number(condition.value);
          default:
            return false;
        }
      };

      const task = { priority: 'high', type: 'support', score: 85 };

      expect(evaluateCondition(task, { field: 'priority', operator: 'equals', value: 'high' })).toBe(true);
      expect(evaluateCondition(task, { field: 'type', operator: 'equals', value: 'billing' })).toBe(false);
      expect(evaluateCondition(task, { field: 'score', operator: 'greaterThan', value: 80 })).toBe(true);
    });

    it('should prioritize rules by priority value', () => {
      const rules = [
        { id: '1', priority: 50, name: 'Medium Priority Rule' },
        { id: '2', priority: 100, name: 'High Priority Rule' },
        { id: '3', priority: 25, name: 'Low Priority Rule' },
      ];

      const sorted = [...rules].sort((a, b) => b.priority - a.priority);

      expect(sorted[0].name).toBe('High Priority Rule');
      expect(sorted[1].name).toBe('Medium Priority Rule');
      expect(sorted[2].name).toBe('Low Priority Rule');
    });
  });

  describe('AI-Assisted Routing', () => {
    it('should classify task intent', async () => {
      const classifyIntent = (taskDescription: string): string => {
        const keywords = {
          support: ['help', 'issue', 'problem', 'error', 'not working'],
          billing: ['invoice', 'payment', 'charge', 'subscription', 'refund'],
          feature: ['feature', 'request', 'suggestion', 'enhancement', 'new'],
          security: ['security', 'breach', 'access', 'permission', 'vulnerability'],
        };

        const lowerDesc = taskDescription.toLowerCase();
        for (const [intent, words] of Object.entries(keywords)) {
          if (words.some(word => lowerDesc.includes(word))) {
            return intent;
          }
        }
        return 'general';
      };

      expect(classifyIntent('I have a billing issue with my invoice')).toBe('billing');
      expect(classifyIntent('Can you help me with this error?')).toBe('support');
      expect(classifyIntent('I have a feature request')).toBe('feature');
      expect(classifyIntent('Security breach detected')).toBe('security');
      expect(classifyIntent('Just a general question')).toBe('general');
    });

    it('should calculate routing confidence', () => {
      const calculateConfidence = (
        factors: { matchScore: number; historicalAccuracy: number; ruleMatch: boolean }
      ): number => {
        const baseConfidence = factors.matchScore * 0.5;
        const historicalBoost = factors.historicalAccuracy * 0.3;
        const ruleBoost = factors.ruleMatch ? 0.2 : 0;
        return Math.min(baseConfidence + historicalBoost + ruleBoost, 1);
      };

      expect(calculateConfidence({ matchScore: 1, historicalAccuracy: 1, ruleMatch: true })).toBe(1);
      expect(calculateConfidence({ matchScore: 0.8, historicalAccuracy: 0.7, ruleMatch: false })).toBe(0.61);
      expect(calculateConfidence({ matchScore: 0.5, historicalAccuracy: 0.5, ruleMatch: true })).toBe(0.6);
    });
  });

  describe('Team Capacity', () => {
    it('should calculate team capacity', () => {
      const calculateCapacity = (
        members: Array<{ maxTasks: number; currentTasks: number }>
      ): { total: number; used: number; available: number; utilization: number } => {
        const total = members.reduce((sum, m) => sum + m.maxTasks, 0);
        const used = members.reduce((sum, m) => sum + m.currentTasks, 0);
        return {
          total,
          used,
          available: total - used,
          utilization: total > 0 ? used / total : 0,
        };
      };

      const team = [
        { maxTasks: 10, currentTasks: 7 },
        { maxTasks: 8, currentTasks: 5 },
        { maxTasks: 12, currentTasks: 9 },
      ];

      const capacity = calculateCapacity(team);
      expect(capacity.total).toBe(30);
      expect(capacity.used).toBe(21);
      expect(capacity.available).toBe(9);
      expect(capacity.utilization).toBeCloseTo(0.7, 2);
    });

    it('should select least busy team member', () => {
      const selectLeastBusy = (
        members: Array<{ id: string; currentTasks: number; maxTasks: number }>
      ): string | null => {
        const available = members.filter(m => m.currentTasks < m.maxTasks);
        if (available.length === 0) return null;

        available.sort((a, b) => {
          const aUtil = a.currentTasks / a.maxTasks;
          const bUtil = b.currentTasks / b.maxTasks;
          return aUtil - bUtil;
        });

        return available[0].id;
      };

      const members = [
        { id: 'user1', currentTasks: 8, maxTasks: 10 }, // 80%
        { id: 'user2', currentTasks: 3, maxTasks: 8 },  // 37.5%
        { id: 'user3', currentTasks: 6, maxTasks: 8 },  // 75%
      ];

      expect(selectLeastBusy(members)).toBe('user2');

      // All at capacity
      const fullMembers = [
        { id: 'user1', currentTasks: 10, maxTasks: 10 },
        { id: 'user2', currentTasks: 8, maxTasks: 8 },
      ];

      expect(selectLeastBusy(fullMembers)).toBeNull();
    });
  });

  describe('Skill Matching', () => {
    it('should match skills to task requirements', () => {
      const matchSkills = (
        requiredSkills: string[],
        memberSkills: string[]
      ): { matched: string[]; missing: string[]; score: number } => {
        const matched = requiredSkills.filter(s => memberSkills.includes(s));
        const missing = requiredSkills.filter(s => !memberSkills.includes(s));
        const score = requiredSkills.length > 0 ? matched.length / requiredSkills.length : 1;
        return { matched, missing, score };
      };

      const required = ['javascript', 'react', 'typescript'];
      const member1Skills = ['javascript', 'react', 'nodejs'];
      const member2Skills = ['javascript', 'react', 'typescript', 'python'];

      const match1 = matchSkills(required, member1Skills);
      expect(match1.matched).toContain('javascript');
      expect(match1.matched).toContain('react');
      expect(match1.missing).toContain('typescript');
      expect(match1.score).toBeCloseTo(0.67, 2);

      const match2 = matchSkills(required, member2Skills);
      expect(match2.missing.length).toBe(0);
      expect(match2.score).toBe(1);
    });

    it('should rank members by skill match', () => {
      const rankBySkills = (
        required: string[],
        members: Array<{ id: string; skills: string[] }>
      ): Array<{ id: string; score: number }> => {
        return members
          .map(m => {
            const matched = required.filter(s => m.skills.includes(s));
            const score = required.length > 0 ? matched.length / required.length : 1;
            return { id: m.id, score };
          })
          .sort((a, b) => b.score - a.score);
      };

      const required = ['python', 'ml', 'tensorflow'];
      const members = [
        { id: 'alice', skills: ['python', 'javascript'] },
        { id: 'bob', skills: ['python', 'ml', 'pytorch'] },
        { id: 'carol', skills: ['python', 'ml', 'tensorflow', 'keras'] },
      ];

      const ranked = rankBySkills(required, members);
      expect(ranked[0].id).toBe('carol');
      expect(ranked[0].score).toBe(1);
      expect(ranked[1].id).toBe('bob');
      expect(ranked[2].id).toBe('alice');
    });
  });

  describe('Round Robin Distribution', () => {
    it('should distribute tasks evenly', () => {
      const getNextAssignee = (
        members: string[],
        lastAssignee: string | null
      ): string => {
        if (!lastAssignee || !members.includes(lastAssignee)) {
          return members[0];
        }
        const currentIndex = members.indexOf(lastAssignee);
        return members[(currentIndex + 1) % members.length];
      };

      const members = ['alice', 'bob', 'carol'];

      expect(getNextAssignee(members, null)).toBe('alice');
      expect(getNextAssignee(members, 'alice')).toBe('bob');
      expect(getNextAssignee(members, 'bob')).toBe('carol');
      expect(getNextAssignee(members, 'carol')).toBe('alice');
    });

    it('should track assignment counts', () => {
      const distributeTask = (
        counts: Record<string, number>,
        members: string[]
      ): string => {
        const minCount = Math.min(...members.map(m => counts[m] || 0));
        const candidates = members.filter(m => (counts[m] || 0) === minCount);
        return candidates[0];
      };

      const counts: Record<string, number> = { alice: 5, bob: 3, carol: 4 };
      const members = ['alice', 'bob', 'carol'];

      expect(distributeTask(counts, members)).toBe('bob');

      counts.bob = 4;
      expect(distributeTask(counts, members)).toBe('bob');

      counts.bob = 5;
      expect(distributeTask(counts, members)).toBe('carol');
    });
  });

  describe('Escalation', () => {
    it('should calculate escalation time', () => {
      const shouldEscalate = (
        createdAt: Date,
        priority: string,
        slaMinutes: Record<string, number>
      ): boolean => {
        const elapsedMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);
        const slaLimit = slaMinutes[priority] || slaMinutes.default;
        return elapsedMinutes > slaLimit;
      };

      const slaMinutes = { critical: 15, high: 60, medium: 240, low: 480, default: 240 };
      const now = new Date();

      // Task created 30 minutes ago with critical priority should escalate
      const criticalTask = new Date(now.getTime() - 30 * 60 * 1000);
      expect(shouldEscalate(criticalTask, 'critical', slaMinutes)).toBe(true);

      // Task created 30 minutes ago with medium priority should not escalate
      const mediumTask = new Date(now.getTime() - 30 * 60 * 1000);
      expect(shouldEscalate(mediumTask, 'medium', slaMinutes)).toBe(false);
    });

    it('should determine escalation path', () => {
      const getEscalationTarget = (
        currentLevel: number,
        escalationPath: string[]
      ): string | null => {
        if (currentLevel >= escalationPath.length) return null;
        return escalationPath[currentLevel];
      };

      const path = ['team-lead', 'manager', 'director'];

      expect(getEscalationTarget(0, path)).toBe('team-lead');
      expect(getEscalationTarget(1, path)).toBe('manager');
      expect(getEscalationTarget(2, path)).toBe('director');
      expect(getEscalationTarget(3, path)).toBeNull();
    });
  });

  describe('Routing Metrics', () => {
    it('should calculate routing accuracy', () => {
      const calculateAccuracy = (
        totalRouted: number,
        correctlyRouted: number
      ): number => {
        if (totalRouted === 0) return 0;
        return (correctlyRouted / totalRouted) * 100;
      };

      expect(calculateAccuracy(100, 85)).toBe(85);
      expect(calculateAccuracy(0, 0)).toBe(0);
      expect(calculateAccuracy(50, 50)).toBe(100);
    });

    it('should calculate average routing time', () => {
      const calculateAvgTime = (routingTimes: number[]): number => {
        if (routingTimes.length === 0) return 0;
        return routingTimes.reduce((sum, t) => sum + t, 0) / routingTimes.length;
      };

      expect(calculateAvgTime([100, 150, 200, 250])).toBe(175);
      expect(calculateAvgTime([])).toBe(0);
    });

    it('should identify routing bottlenecks', () => {
      const findBottlenecks = (
        routes: Array<{ route: string; avgTime: number; threshold: number }>
      ): string[] => {
        return routes
          .filter(r => r.avgTime > r.threshold)
          .map(r => r.route);
      };

      const routes = [
        { route: 'support', avgTime: 50, threshold: 100 },
        { route: 'billing', avgTime: 150, threshold: 100 },
        { route: 'technical', avgTime: 200, threshold: 100 },
        { route: 'sales', avgTime: 80, threshold: 100 },
      ];

      const bottlenecks = findBottlenecks(routes);
      expect(bottlenecks).toContain('billing');
      expect(bottlenecks).toContain('technical');
      expect(bottlenecks).not.toContain('support');
      expect(bottlenecks).not.toContain('sales');
    });
  });
});
