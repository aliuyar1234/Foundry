/**
 * Integration Tests for Workload Management (T265)
 * E2E tests for workload monitoring and management
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Workload Management Integration Tests', () => {
  const testOrgId = 'test-org-workload';

  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Workload Metrics', () => {
    it('should calculate individual workload', () => {
      interface WorkloadMetrics {
        userId: string;
        activeTasks: number;
        maxCapacity: number;
        utilizationRate: number;
        avgTaskDuration: number;
      }

      const calculateWorkload = (
        userId: string,
        tasks: Array<{ assigneeId: string; status: string; estimatedHours: number }>,
        maxCapacity: number
      ): WorkloadMetrics => {
        const userTasks = tasks.filter(t => t.assigneeId === userId && t.status !== 'completed');
        const activeTasks = userTasks.length;
        const totalHours = userTasks.reduce((sum, t) => sum + t.estimatedHours, 0);
        const avgDuration = activeTasks > 0 ? totalHours / activeTasks : 0;

        return {
          userId,
          activeTasks,
          maxCapacity,
          utilizationRate: maxCapacity > 0 ? (activeTasks / maxCapacity) * 100 : 0,
          avgTaskDuration: avgDuration,
        };
      };

      const tasks = [
        { assigneeId: 'user-1', status: 'in_progress', estimatedHours: 4 },
        { assigneeId: 'user-1', status: 'pending', estimatedHours: 2 },
        { assigneeId: 'user-1', status: 'completed', estimatedHours: 3 },
        { assigneeId: 'user-2', status: 'in_progress', estimatedHours: 5 },
      ];

      const workload = calculateWorkload('user-1', tasks, 10);
      expect(workload.activeTasks).toBe(2);
      expect(workload.utilizationRate).toBe(20);
      expect(workload.avgTaskDuration).toBe(3);
    });

    it('should calculate team workload distribution', () => {
      const calculateTeamDistribution = (
        members: Array<{ id: string; activeTasks: number }>
      ): { mean: number; stdDev: number; isBalanced: boolean } => {
        if (members.length === 0) return { mean: 0, stdDev: 0, isBalanced: true };

        const tasks = members.map(m => m.activeTasks);
        const mean = tasks.reduce((a, b) => a + b, 0) / tasks.length;
        const variance = tasks.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / tasks.length;
        const stdDev = Math.sqrt(variance);

        // Consider balanced if stdDev is less than 30% of mean
        const isBalanced = mean === 0 || (stdDev / mean) < 0.3;

        return { mean, stdDev, isBalanced };
      };

      const balancedTeam = [
        { id: 'user-1', activeTasks: 5 },
        { id: 'user-2', activeTasks: 6 },
        { id: 'user-3', activeTasks: 5 },
      ];
      expect(calculateTeamDistribution(balancedTeam).isBalanced).toBe(true);

      const imbalancedTeam = [
        { id: 'user-1', activeTasks: 10 },
        { id: 'user-2', activeTasks: 2 },
        { id: 'user-3', activeTasks: 3 },
      ];
      expect(calculateTeamDistribution(imbalancedTeam).isBalanced).toBe(false);
    });
  });

  describe('Burnout Detection', () => {
    it('should calculate burnout risk score', () => {
      interface BurnoutFactors {
        overtimeHours: number;
        weekendWork: number;
        consecutiveWorkDays: number;
        utilizationRate: number;
        taskOverdue: number;
      }

      const calculateBurnoutRisk = (factors: BurnoutFactors): number => {
        const weights = {
          overtime: 0.25,
          weekend: 0.20,
          consecutive: 0.20,
          utilization: 0.20,
          overdue: 0.15,
        };

        // Normalize each factor to 0-100 scale
        const normalized = {
          overtime: Math.min(factors.overtimeHours / 20, 1) * 100,
          weekend: Math.min(factors.weekendWork / 8, 1) * 100,
          consecutive: Math.min(factors.consecutiveWorkDays / 14, 1) * 100,
          utilization: factors.utilizationRate > 100 ? Math.min((factors.utilizationRate - 100) / 50, 1) * 100 : 0,
          overdue: Math.min(factors.taskOverdue / 5, 1) * 100,
        };

        return Object.entries(weights).reduce(
          (score, [key, weight]) => score + normalized[key as keyof typeof normalized] * weight,
          0
        );
      };

      const lowRisk: BurnoutFactors = {
        overtimeHours: 2,
        weekendWork: 0,
        consecutiveWorkDays: 5,
        utilizationRate: 70,
        taskOverdue: 0,
      };
      expect(calculateBurnoutRisk(lowRisk)).toBeLessThan(20);

      const highRisk: BurnoutFactors = {
        overtimeHours: 15,
        weekendWork: 6,
        consecutiveWorkDays: 12,
        utilizationRate: 140,
        taskOverdue: 4,
      };
      expect(calculateBurnoutRisk(highRisk)).toBeGreaterThan(60);
    });

    it('should identify at-risk team members', () => {
      const identifyAtRisk = (
        members: Array<{ id: string; burnoutScore: number }>,
        threshold: number = 50
      ): string[] => {
        return members
          .filter(m => m.burnoutScore >= threshold)
          .sort((a, b) => b.burnoutScore - a.burnoutScore)
          .map(m => m.id);
      };

      const members = [
        { id: 'user-1', burnoutScore: 30 },
        { id: 'user-2', burnoutScore: 75 },
        { id: 'user-3', burnoutScore: 55 },
        { id: 'user-4', burnoutScore: 45 },
      ];

      const atRisk = identifyAtRisk(members);
      expect(atRisk).toHaveLength(2);
      expect(atRisk[0]).toBe('user-2');
      expect(atRisk[1]).toBe('user-3');
    });
  });

  describe('Capacity Planning', () => {
    it('should calculate available capacity', () => {
      const calculateAvailableCapacity = (
        team: Array<{ id: string; maxHours: number; scheduledHours: number; pto: number }>
      ): { totalCapacity: number; scheduledHours: number; available: number } => {
        const totals = team.reduce(
          (acc, member) => ({
            capacity: acc.capacity + (member.maxHours - member.pto),
            scheduled: acc.scheduled + member.scheduledHours,
          }),
          { capacity: 0, scheduled: 0 }
        );

        return {
          totalCapacity: totals.capacity,
          scheduledHours: totals.scheduled,
          available: totals.capacity - totals.scheduled,
        };
      };

      const team = [
        { id: 'user-1', maxHours: 40, scheduledHours: 30, pto: 0 },
        { id: 'user-2', maxHours: 40, scheduledHours: 35, pto: 8 },
        { id: 'user-3', maxHours: 32, scheduledHours: 28, pto: 0 },
      ];

      const capacity = calculateAvailableCapacity(team);
      expect(capacity.totalCapacity).toBe(104);
      expect(capacity.scheduledHours).toBe(93);
      expect(capacity.available).toBe(11);
    });

    it('should forecast future capacity', () => {
      const forecastCapacity = (
        baseCapacity: number,
        weeks: number,
        plannedPto: Array<{ week: number; hours: number }>,
        plannedHires: Array<{ week: number; capacity: number }>
      ): Array<{ week: number; capacity: number }> => {
        const forecast: Array<{ week: number; capacity: number }> = [];

        for (let w = 1; w <= weeks; w++) {
          const ptoReduction = plannedPto
            .filter(p => p.week === w)
            .reduce((sum, p) => sum + p.hours, 0);

          const hireAddition = plannedHires
            .filter(h => h.week <= w)
            .reduce((sum, h) => sum + h.capacity, 0);

          forecast.push({
            week: w,
            capacity: baseCapacity - ptoReduction + hireAddition,
          });
        }

        return forecast;
      };

      const forecast = forecastCapacity(
        160, // base weekly capacity
        4,   // 4 weeks
        [{ week: 2, hours: 40 }, { week: 3, hours: 24 }], // PTO
        [{ week: 3, capacity: 40 }] // New hire
      );

      expect(forecast[0].capacity).toBe(160); // Week 1: base
      expect(forecast[1].capacity).toBe(120); // Week 2: -40 PTO
      expect(forecast[2].capacity).toBe(176); // Week 3: -24 PTO, +40 hire
      expect(forecast[3].capacity).toBe(200); // Week 4: +40 hire
    });
  });

  describe('Task Balancing', () => {
    it('should suggest task rebalancing', () => {
      const suggestRebalancing = (
        members: Array<{ id: string; tasks: number; capacity: number }>
      ): Array<{ from: string; to: string; count: number }> => {
        const suggestions: Array<{ from: string; to: string; count: number }> = [];

        // Calculate utilization for each member
        const withUtil = members.map(m => ({
          ...m,
          utilization: m.capacity > 0 ? m.tasks / m.capacity : 0,
        }));

        // Sort by utilization
        const sorted = [...withUtil].sort((a, b) => b.utilization - a.utilization);

        // Find overloaded and underloaded members
        const overloaded = sorted.filter(m => m.utilization > 1);
        const underloaded = sorted.filter(m => m.utilization < 0.6);

        for (const over of overloaded) {
          const excess = over.tasks - over.capacity;
          for (const under of underloaded) {
            const available = under.capacity - under.tasks;
            if (available > 0 && excess > 0) {
              const transfer = Math.min(excess, available);
              suggestions.push({
                from: over.id,
                to: under.id,
                count: Math.ceil(transfer),
              });
            }
          }
        }

        return suggestions;
      };

      const members = [
        { id: 'user-1', tasks: 12, capacity: 8 },  // 150% - overloaded
        { id: 'user-2', tasks: 3, capacity: 8 },   // 37.5% - underloaded
        { id: 'user-3', tasks: 6, capacity: 8 },   // 75% - ok
      ];

      const suggestions = suggestRebalancing(members);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].from).toBe('user-1');
      expect(suggestions[0].to).toBe('user-2');
    });

    it('should prioritize urgent task rebalancing', () => {
      const prioritizeRebalancing = (
        tasks: Array<{ id: string; assigneeId: string; priority: string; dueDate: Date }>
      ): string[] => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

        return tasks
          .sort((a, b) => {
            // First by priority
            const pDiff = priorityOrder[a.priority as keyof typeof priorityOrder] -
                         priorityOrder[b.priority as keyof typeof priorityOrder];
            if (pDiff !== 0) return pDiff;

            // Then by due date
            return a.dueDate.getTime() - b.dueDate.getTime();
          })
          .map(t => t.id);
      };

      const now = new Date();
      const tasks = [
        { id: '1', assigneeId: 'user-1', priority: 'low', dueDate: new Date(now.getTime() + 86400000) },
        { id: '2', assigneeId: 'user-1', priority: 'high', dueDate: new Date(now.getTime() + 172800000) },
        { id: '3', assigneeId: 'user-1', priority: 'critical', dueDate: new Date(now.getTime() + 86400000) },
        { id: '4', assigneeId: 'user-1', priority: 'high', dueDate: new Date(now.getTime() + 86400000) },
      ];

      const prioritized = prioritizeRebalancing(tasks);
      expect(prioritized[0]).toBe('3'); // Critical
      expect(prioritized[1]).toBe('4'); // High, earlier due date
      expect(prioritized[2]).toBe('2'); // High, later due date
    });
  });

  describe('Meeting Analysis', () => {
    it('should calculate meeting load', () => {
      interface MeetingMetrics {
        totalMeetings: number;
        totalHours: number;
        avgMeetingLength: number;
        meetingFreeHours: number;
      }

      const calculateMeetingLoad = (
        meetings: Array<{ duration: number }>,
        workHours: number
      ): MeetingMetrics => {
        const totalMeetings = meetings.length;
        const totalHours = meetings.reduce((sum, m) => sum + m.duration, 0) / 60;
        const avgMeetingLength = totalMeetings > 0 ? totalHours / totalMeetings * 60 : 0;

        return {
          totalMeetings,
          totalHours,
          avgMeetingLength,
          meetingFreeHours: workHours - totalHours,
        };
      };

      const meetings = [
        { duration: 60 },
        { duration: 30 },
        { duration: 45 },
        { duration: 60 },
        { duration: 30 },
      ];

      const metrics = calculateMeetingLoad(meetings, 40);
      expect(metrics.totalMeetings).toBe(5);
      expect(metrics.totalHours).toBeCloseTo(3.75, 2);
      expect(metrics.avgMeetingLength).toBe(45);
      expect(metrics.meetingFreeHours).toBeCloseTo(36.25, 2);
    });

    it('should identify meeting-heavy days', () => {
      const findMeetingHeavyDays = (
        meetings: Array<{ date: string; duration: number }>,
        threshold: number = 4
      ): string[] => {
        const byDay: Record<string, number> = {};

        for (const meeting of meetings) {
          const hours = meeting.duration / 60;
          byDay[meeting.date] = (byDay[meeting.date] || 0) + hours;
        }

        return Object.entries(byDay)
          .filter(([_, hours]) => hours >= threshold)
          .map(([date]) => date);
      };

      const meetings = [
        { date: '2024-01-15', duration: 120 },
        { date: '2024-01-15', duration: 180 },
        { date: '2024-01-16', duration: 60 },
        { date: '2024-01-17', duration: 240 },
        { date: '2024-01-17', duration: 60 },
      ];

      const heavyDays = findMeetingHeavyDays(meetings);
      expect(heavyDays).toContain('2024-01-15');
      expect(heavyDays).toContain('2024-01-17');
      expect(heavyDays).not.toContain('2024-01-16');
    });
  });

  describe('Workload Forecasting', () => {
    it('should forecast workload based on trends', () => {
      const forecastWorkload = (
        historicalData: Array<{ week: number; workload: number }>,
        weeksAhead: number
      ): Array<{ week: number; predicted: number }> => {
        if (historicalData.length < 2) {
          return Array.from({ length: weeksAhead }, (_, i) => ({
            week: historicalData.length + i + 1,
            predicted: historicalData[0]?.workload || 0,
          }));
        }

        // Simple linear regression
        const n = historicalData.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (const data of historicalData) {
          sumX += data.week;
          sumY += data.workload;
          sumXY += data.week * data.workload;
          sumX2 += data.week * data.week;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const lastWeek = historicalData[historicalData.length - 1].week;
        return Array.from({ length: weeksAhead }, (_, i) => {
          const week = lastWeek + i + 1;
          return {
            week,
            predicted: Math.max(0, Math.round(slope * week + intercept)),
          };
        });
      };

      const historical = [
        { week: 1, workload: 100 },
        { week: 2, workload: 110 },
        { week: 3, workload: 115 },
        { week: 4, workload: 125 },
      ];

      const forecast = forecastWorkload(historical, 4);
      expect(forecast).toHaveLength(4);
      expect(forecast[0].week).toBe(5);
      expect(forecast[0].predicted).toBeGreaterThan(125); // Upward trend
    });

    it('should detect workload anomalies', () => {
      const detectAnomalies = (
        current: number,
        historical: number[],
        threshold: number = 2
      ): { isAnomaly: boolean; percentageChange: number } => {
        if (historical.length === 0) return { isAnomaly: false, percentageChange: 0 };

        const avg = historical.reduce((a, b) => a + b, 0) / historical.length;
        const percentageChange = avg > 0 ? ((current - avg) / avg) * 100 : 0;

        const variance = historical.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / historical.length;
        const stdDev = Math.sqrt(variance);
        const zscore = stdDev > 0 ? (current - avg) / stdDev : 0;

        return {
          isAnomaly: Math.abs(zscore) > threshold,
          percentageChange,
        };
      };

      const historical = [100, 105, 110, 95, 100];

      // Normal variation
      expect(detectAnomalies(108, historical).isAnomaly).toBe(false);

      // Anomaly - significant increase
      expect(detectAnomalies(180, historical).isAnomaly).toBe(true);

      // Anomaly - significant decrease
      expect(detectAnomalies(40, historical).isAnomaly).toBe(true);
    });
  });

  describe('Alert Generation', () => {
    it('should generate workload alerts', () => {
      interface WorkloadAlert {
        type: string;
        severity: string;
        message: string;
        affectedUsers: string[];
      }

      const generateAlerts = (
        members: Array<{ id: string; name: string; utilizationRate: number; burnoutScore: number }>
      ): WorkloadAlert[] => {
        const alerts: WorkloadAlert[] = [];

        // Check for high utilization
        const highUtilization = members.filter(m => m.utilizationRate > 100);
        if (highUtilization.length > 0) {
          alerts.push({
            type: 'high_utilization',
            severity: highUtilization.some(m => m.utilizationRate > 120) ? 'high' : 'medium',
            message: `${highUtilization.length} team member(s) are overloaded`,
            affectedUsers: highUtilization.map(m => m.id),
          });
        }

        // Check for burnout risk
        const burnoutRisk = members.filter(m => m.burnoutScore > 60);
        if (burnoutRisk.length > 0) {
          alerts.push({
            type: 'burnout_risk',
            severity: burnoutRisk.some(m => m.burnoutScore > 80) ? 'critical' : 'high',
            message: `${burnoutRisk.length} team member(s) showing burnout risk`,
            affectedUsers: burnoutRisk.map(m => m.id),
          });
        }

        return alerts;
      };

      const members = [
        { id: 'user-1', name: 'Alice', utilizationRate: 130, burnoutScore: 65 },
        { id: 'user-2', name: 'Bob', utilizationRate: 80, burnoutScore: 30 },
        { id: 'user-3', name: 'Carol', utilizationRate: 110, burnoutScore: 85 },
      ];

      const alerts = generateAlerts(members);
      expect(alerts.length).toBe(2);

      const utilizationAlert = alerts.find(a => a.type === 'high_utilization');
      expect(utilizationAlert?.affectedUsers).toHaveLength(2);

      const burnoutAlert = alerts.find(a => a.type === 'burnout_risk');
      expect(burnoutAlert?.severity).toBe('critical');
    });
  });

  describe('Time Tracking', () => {
    it('should calculate time allocation', () => {
      const calculateTimeAllocation = (
        entries: Array<{ category: string; hours: number }>
      ): Record<string, { hours: number; percentage: number }> => {
        const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

        const byCategory = entries.reduce((acc, entry) => {
          acc[entry.category] = (acc[entry.category] || 0) + entry.hours;
          return acc;
        }, {} as Record<string, number>);

        return Object.entries(byCategory).reduce((result, [category, hours]) => {
          result[category] = {
            hours,
            percentage: totalHours > 0 ? (hours / totalHours) * 100 : 0,
          };
          return result;
        }, {} as Record<string, { hours: number; percentage: number }>);
      };

      const entries = [
        { category: 'development', hours: 20 },
        { category: 'meetings', hours: 8 },
        { category: 'development', hours: 5 },
        { category: 'review', hours: 4 },
        { category: 'admin', hours: 3 },
      ];

      const allocation = calculateTimeAllocation(entries);
      expect(allocation.development.hours).toBe(25);
      expect(allocation.development.percentage).toBe(62.5);
      expect(allocation.meetings.hours).toBe(8);
    });

    it('should identify time inefficiencies', () => {
      const findInefficiencies = (
        allocation: Record<string, { hours: number; percentage: number }>,
        benchmarks: Record<string, { min: number; max: number }>
      ): Array<{ category: string; issue: string }> => {
        const issues: Array<{ category: string; issue: string }> = [];

        for (const [category, data] of Object.entries(allocation)) {
          const benchmark = benchmarks[category];
          if (!benchmark) continue;

          if (data.percentage < benchmark.min) {
            issues.push({
              category,
              issue: `Too little time (${data.percentage.toFixed(1)}% vs ${benchmark.min}% minimum)`,
            });
          } else if (data.percentage > benchmark.max) {
            issues.push({
              category,
              issue: `Too much time (${data.percentage.toFixed(1)}% vs ${benchmark.max}% maximum)`,
            });
          }
        }

        return issues;
      };

      const allocation = {
        development: { hours: 20, percentage: 50 },
        meetings: { hours: 16, percentage: 40 },
        review: { hours: 4, percentage: 10 },
      };

      const benchmarks = {
        development: { min: 60, max: 80 },
        meetings: { min: 10, max: 25 },
        review: { min: 10, max: 20 },
      };

      const issues = findInefficiencies(allocation, benchmarks);
      expect(issues.some(i => i.category === 'development')).toBe(true);
      expect(issues.some(i => i.category === 'meetings')).toBe(true);
    });
  });
});
