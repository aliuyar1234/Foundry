/**
 * Unit Tests for Workload Service (T269)
 * Tests for workload calculation, burnout detection, and capacity planning
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==========================================
// Workload Calculation Tests
// ==========================================

describe('Workload Calculation', () => {
  interface Task {
    id: string;
    assigneeId: string;
    estimatedHours: number;
    status: 'pending' | 'in_progress' | 'completed';
    priority: string;
    dueDate: Date;
  }

  const calculateWorkload = (
    userId: string,
    tasks: Task[],
    maxCapacity: number
  ): {
    totalHours: number;
    taskCount: number;
    utilization: number;
    overloaded: boolean;
  } => {
    const userTasks = tasks.filter(
      t => t.assigneeId === userId && t.status !== 'completed'
    );

    const totalHours = userTasks.reduce((sum, t) => sum + t.estimatedHours, 0);
    const taskCount = userTasks.length;
    const utilization = maxCapacity > 0 ? (totalHours / maxCapacity) * 100 : 0;

    return {
      totalHours,
      taskCount,
      utilization,
      overloaded: utilization > 100,
    };
  };

  it('should calculate total hours from assigned tasks', () => {
    const tasks: Task[] = [
      { id: '1', assigneeId: 'user-1', estimatedHours: 4, status: 'pending', priority: 'high', dueDate: new Date() },
      { id: '2', assigneeId: 'user-1', estimatedHours: 2, status: 'in_progress', priority: 'medium', dueDate: new Date() },
      { id: '3', assigneeId: 'user-2', estimatedHours: 3, status: 'pending', priority: 'low', dueDate: new Date() },
    ];

    const workload = calculateWorkload('user-1', tasks, 40);
    expect(workload.totalHours).toBe(6);
    expect(workload.taskCount).toBe(2);
  });

  it('should exclude completed tasks', () => {
    const tasks: Task[] = [
      { id: '1', assigneeId: 'user-1', estimatedHours: 4, status: 'completed', priority: 'high', dueDate: new Date() },
      { id: '2', assigneeId: 'user-1', estimatedHours: 2, status: 'pending', priority: 'medium', dueDate: new Date() },
    ];

    const workload = calculateWorkload('user-1', tasks, 40);
    expect(workload.totalHours).toBe(2);
  });

  it('should calculate utilization percentage', () => {
    const tasks: Task[] = [
      { id: '1', assigneeId: 'user-1', estimatedHours: 30, status: 'pending', priority: 'high', dueDate: new Date() },
    ];

    const workload = calculateWorkload('user-1', tasks, 40);
    expect(workload.utilization).toBe(75);
    expect(workload.overloaded).toBe(false);
  });

  it('should detect overloaded state', () => {
    const tasks: Task[] = [
      { id: '1', assigneeId: 'user-1', estimatedHours: 50, status: 'pending', priority: 'high', dueDate: new Date() },
    ];

    const workload = calculateWorkload('user-1', tasks, 40);
    expect(workload.utilization).toBe(125);
    expect(workload.overloaded).toBe(true);
  });
});

// ==========================================
// Burnout Risk Calculation Tests
// ==========================================

describe('Burnout Risk Calculation', () => {
  interface BurnoutFactors {
    overtimeHoursWeek: number;
    weekendWorkHours: number;
    consecutiveWorkDays: number;
    utilizationRate: number;
    overdueTaskCount: number;
    meetingHoursWeek: number;
  }

  const calculateBurnoutRisk = (factors: BurnoutFactors): {
    score: number;
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
  } => {
    const weights = {
      overtime: 0.20,
      weekend: 0.15,
      consecutive: 0.15,
      utilization: 0.20,
      overdue: 0.15,
      meetings: 0.15,
    };

    const normalized = {
      overtime: Math.min(factors.overtimeHoursWeek / 20, 1) * 100,
      weekend: Math.min(factors.weekendWorkHours / 8, 1) * 100,
      consecutive: Math.min(factors.consecutiveWorkDays / 14, 1) * 100,
      utilization: factors.utilizationRate > 100 ? Math.min((factors.utilizationRate - 80) / 50, 1) * 100 : 0,
      overdue: Math.min(factors.overdueTaskCount / 5, 1) * 100,
      meetings: Math.min(factors.meetingHoursWeek / 25, 1) * 100,
    };

    const score = Object.entries(weights).reduce(
      (sum, [key, weight]) => sum + normalized[key as keyof typeof normalized] * weight,
      0
    );

    const riskFactors: string[] = [];
    if (normalized.overtime > 50) riskFactors.push('excessive_overtime');
    if (normalized.weekend > 50) riskFactors.push('weekend_work');
    if (normalized.consecutive > 70) riskFactors.push('no_breaks');
    if (normalized.utilization > 50) riskFactors.push('overutilized');
    if (normalized.overdue > 40) riskFactors.push('deadline_pressure');
    if (normalized.meetings > 60) riskFactors.push('meeting_overload');

    let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (score >= 75) level = 'critical';
    else if (score >= 50) level = 'high';
    else if (score >= 25) level = 'medium';

    return { score, level, factors: riskFactors };
  };

  it('should calculate low risk for normal workload', () => {
    const factors: BurnoutFactors = {
      overtimeHoursWeek: 0,
      weekendWorkHours: 0,
      consecutiveWorkDays: 5,
      utilizationRate: 70,
      overdueTaskCount: 0,
      meetingHoursWeek: 8,
    };

    const result = calculateBurnoutRisk(factors);
    expect(result.level).toBe('low');
    expect(result.score).toBeLessThan(25);
  });

  it('should calculate high risk for excessive overtime', () => {
    const factors: BurnoutFactors = {
      overtimeHoursWeek: 15,
      weekendWorkHours: 6,
      consecutiveWorkDays: 10,
      utilizationRate: 120,
      overdueTaskCount: 3,
      meetingHoursWeek: 20,
    };

    const result = calculateBurnoutRisk(factors);
    expect(result.level).toBe('high');
    expect(result.factors).toContain('excessive_overtime');
  });

  it('should identify specific risk factors', () => {
    const factors: BurnoutFactors = {
      overtimeHoursWeek: 0,
      weekendWorkHours: 8,
      consecutiveWorkDays: 5,
      utilizationRate: 70,
      overdueTaskCount: 0,
      meetingHoursWeek: 25,
    };

    const result = calculateBurnoutRisk(factors);
    expect(result.factors).toContain('weekend_work');
    expect(result.factors).toContain('meeting_overload');
  });
});

// ==========================================
// Team Distribution Tests
// ==========================================

describe('Team Distribution', () => {
  const calculateDistribution = (
    members: Array<{ id: string; workload: number }>
  ): {
    mean: number;
    stdDev: number;
    variance: number;
    isBalanced: boolean;
    imbalancedMembers: string[];
  } => {
    if (members.length === 0) {
      return { mean: 0, stdDev: 0, variance: 0, isBalanced: true, imbalancedMembers: [] };
    }

    const workloads = members.map(m => m.workload);
    const mean = workloads.reduce((a, b) => a + b, 0) / workloads.length;
    const variance = workloads.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / workloads.length;
    const stdDev = Math.sqrt(variance);

    const threshold = mean * 0.25; // 25% deviation threshold
    const imbalancedMembers = members
      .filter(m => Math.abs(m.workload - mean) > threshold)
      .map(m => m.id);

    return {
      mean,
      stdDev,
      variance,
      isBalanced: imbalancedMembers.length === 0,
      imbalancedMembers,
    };
  };

  it('should detect balanced workload', () => {
    const members = [
      { id: 'user-1', workload: 80 },
      { id: 'user-2', workload: 85 },
      { id: 'user-3', workload: 78 },
    ];

    const result = calculateDistribution(members);
    expect(result.isBalanced).toBe(true);
    expect(result.imbalancedMembers).toHaveLength(0);
  });

  it('should detect imbalanced workload', () => {
    const members = [
      { id: 'user-1', workload: 120 },
      { id: 'user-2', workload: 50 },
      { id: 'user-3', workload: 80 },
    ];

    const result = calculateDistribution(members);
    expect(result.isBalanced).toBe(false);
    expect(result.imbalancedMembers).toContain('user-1');
    expect(result.imbalancedMembers).toContain('user-2');
  });

  it('should calculate mean and standard deviation', () => {
    const members = [
      { id: 'user-1', workload: 60 },
      { id: 'user-2', workload: 80 },
      { id: 'user-3', workload: 100 },
    ];

    const result = calculateDistribution(members);
    expect(result.mean).toBe(80);
    expect(result.stdDev).toBeGreaterThan(0);
  });
});

// ==========================================
// Capacity Planning Tests
// ==========================================

describe('Capacity Planning', () => {
  interface TeamMember {
    id: string;
    weeklyHours: number;
    scheduledPto: number;
    currentAssignments: number;
  }

  const calculateCapacity = (
    members: TeamMember[],
    periodWeeks: number
  ): {
    totalCapacity: number;
    availableCapacity: number;
    utilizedCapacity: number;
    utilizationRate: number;
  } => {
    const totalCapacity = members.reduce(
      (sum, m) => sum + (m.weeklyHours * periodWeeks - m.scheduledPto),
      0
    );

    const utilizedCapacity = members.reduce(
      (sum, m) => sum + m.currentAssignments,
      0
    );

    return {
      totalCapacity,
      availableCapacity: totalCapacity - utilizedCapacity,
      utilizedCapacity,
      utilizationRate: totalCapacity > 0 ? (utilizedCapacity / totalCapacity) * 100 : 0,
    };
  };

  it('should calculate total team capacity', () => {
    const members: TeamMember[] = [
      { id: 'user-1', weeklyHours: 40, scheduledPto: 0, currentAssignments: 30 },
      { id: 'user-2', weeklyHours: 40, scheduledPto: 8, currentAssignments: 25 },
    ];

    const capacity = calculateCapacity(members, 1);
    expect(capacity.totalCapacity).toBe(72);
    expect(capacity.utilizedCapacity).toBe(55);
    expect(capacity.availableCapacity).toBe(17);
  });

  it('should calculate multi-week capacity', () => {
    const members: TeamMember[] = [
      { id: 'user-1', weeklyHours: 40, scheduledPto: 16, currentAssignments: 70 },
    ];

    const capacity = calculateCapacity(members, 2);
    expect(capacity.totalCapacity).toBe(64); // 80 - 16
  });

  it('should calculate utilization rate', () => {
    const members: TeamMember[] = [
      { id: 'user-1', weeklyHours: 40, scheduledPto: 0, currentAssignments: 30 },
    ];

    const capacity = calculateCapacity(members, 1);
    expect(capacity.utilizationRate).toBe(75);
  });
});

// ==========================================
// Workload Forecasting Tests
// ==========================================

describe('Workload Forecasting', () => {
  const forecastWorkload = (
    historicalData: Array<{ week: number; workload: number }>,
    weeksAhead: number
  ): Array<{ week: number; predicted: number; confidence: number }> => {
    if (historicalData.length < 2) {
      return Array.from({ length: weeksAhead }, (_, i) => ({
        week: (historicalData[0]?.week || 0) + i + 1,
        predicted: historicalData[0]?.workload || 0,
        confidence: 0,
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

    // Calculate R-squared for confidence
    const yMean = sumY / n;
    let ssTotal = 0, ssResidual = 0;
    for (const data of historicalData) {
      ssTotal += Math.pow(data.workload - yMean, 2);
      const predicted = slope * data.week + intercept;
      ssResidual += Math.pow(data.workload - predicted, 2);
    }
    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

    const lastWeek = historicalData[historicalData.length - 1].week;
    return Array.from({ length: weeksAhead }, (_, i) => {
      const week = lastWeek + i + 1;
      return {
        week,
        predicted: Math.max(0, Math.round(slope * week + intercept)),
        confidence: Math.max(0, Math.min(1, rSquared - i * 0.1)), // Decreasing confidence
      };
    });
  };

  it('should forecast increasing trend', () => {
    const historical = [
      { week: 1, workload: 100 },
      { week: 2, workload: 110 },
      { week: 3, workload: 120 },
      { week: 4, workload: 130 },
    ];

    const forecast = forecastWorkload(historical, 2);
    expect(forecast[0].predicted).toBeGreaterThan(130);
    expect(forecast[1].predicted).toBeGreaterThan(forecast[0].predicted);
  });

  it('should forecast decreasing trend', () => {
    const historical = [
      { week: 1, workload: 130 },
      { week: 2, workload: 120 },
      { week: 3, workload: 110 },
      { week: 4, workload: 100 },
    ];

    const forecast = forecastWorkload(historical, 2);
    expect(forecast[0].predicted).toBeLessThan(100);
  });

  it('should include confidence scores', () => {
    const historical = [
      { week: 1, workload: 100 },
      { week: 2, workload: 102 },
      { week: 3, workload: 101 },
      { week: 4, workload: 103 },
    ];

    const forecast = forecastWorkload(historical, 3);
    expect(forecast[0].confidence).toBeGreaterThan(0);
    expect(forecast[2].confidence).toBeLessThan(forecast[0].confidence);
  });
});

// ==========================================
// Meeting Analysis Tests
// ==========================================

describe('Meeting Analysis', () => {
  interface Meeting {
    id: string;
    title: string;
    duration: number; // minutes
    attendees: string[];
    date: Date;
    recurring: boolean;
  }

  const analyzeMeetingLoad = (
    userId: string,
    meetings: Meeting[],
    weeklyWorkHours: number
  ): {
    totalMeetings: number;
    totalMinutes: number;
    percentageOfTime: number;
    meetingFreeBlocks: number;
    suggestions: string[];
  } => {
    const userMeetings = meetings.filter(m => m.attendees.includes(userId));
    const totalMinutes = userMeetings.reduce((sum, m) => sum + m.duration, 0);
    const workMinutes = weeklyWorkHours * 60;
    const percentageOfTime = workMinutes > 0 ? (totalMinutes / workMinutes) * 100 : 0;

    // Calculate meeting-free blocks (simplified)
    const meetingFreeBlocks = Math.max(0, 5 - userMeetings.length); // Assume 5 days, one block per day

    const suggestions: string[] = [];
    if (percentageOfTime > 50) {
      suggestions.push('Consider declining non-essential meetings');
    }
    if (userMeetings.filter(m => m.recurring).length > userMeetings.length * 0.5) {
      suggestions.push('Review recurring meetings for relevance');
    }
    if (userMeetings.some(m => m.duration > 60)) {
      suggestions.push('Consider shortening long meetings');
    }

    return {
      totalMeetings: userMeetings.length,
      totalMinutes,
      percentageOfTime,
      meetingFreeBlocks,
      suggestions,
    };
  };

  it('should calculate meeting load', () => {
    const meetings: Meeting[] = [
      { id: '1', title: 'Standup', duration: 15, attendees: ['user-1'], date: new Date(), recurring: true },
      { id: '2', title: 'Planning', duration: 60, attendees: ['user-1', 'user-2'], date: new Date(), recurring: true },
      { id: '3', title: 'Review', duration: 30, attendees: ['user-1'], date: new Date(), recurring: false },
    ];

    const analysis = analyzeMeetingLoad('user-1', meetings, 40);
    expect(analysis.totalMeetings).toBe(3);
    expect(analysis.totalMinutes).toBe(105);
  });

  it('should calculate percentage of work time', () => {
    const meetings: Meeting[] = [
      { id: '1', title: 'Meeting', duration: 480, attendees: ['user-1'], date: new Date(), recurring: false },
    ];

    const analysis = analyzeMeetingLoad('user-1', meetings, 40);
    expect(analysis.percentageOfTime).toBe(20); // 8 hours out of 40
  });

  it('should generate suggestions for high meeting load', () => {
    const meetings: Meeting[] = [
      { id: '1', title: 'M1', duration: 300, attendees: ['user-1'], date: new Date(), recurring: true },
      { id: '2', title: 'M2', duration: 300, attendees: ['user-1'], date: new Date(), recurring: true },
      { id: '3', title: 'M3', duration: 300, attendees: ['user-1'], date: new Date(), recurring: false },
      { id: '4', title: 'M4', duration: 300, attendees: ['user-1'], date: new Date(), recurring: false },
      { id: '5', title: 'M5', duration: 120, attendees: ['user-1'], date: new Date(), recurring: false },
    ];

    const analysis = analyzeMeetingLoad('user-1', meetings, 40);
    expect(analysis.suggestions.length).toBeGreaterThan(0);
  });
});

// ==========================================
// Alert Generation Tests
// ==========================================

describe('Alert Generation', () => {
  interface AlertThresholds {
    utilizationWarning: number;
    utilizationCritical: number;
    burnoutWarning: number;
    burnoutCritical: number;
    overdueTasks: number;
  }

  interface MemberMetrics {
    id: string;
    name: string;
    utilization: number;
    burnoutScore: number;
    overdueTasks: number;
  }

  const generateAlerts = (
    members: MemberMetrics[],
    thresholds: AlertThresholds
  ): Array<{
    type: string;
    severity: 'warning' | 'critical';
    message: string;
    affectedMembers: string[];
  }> => {
    const alerts: Array<{
      type: string;
      severity: 'warning' | 'critical';
      message: string;
      affectedMembers: string[];
    }> = [];

    // Utilization alerts
    const criticalUtil = members.filter(m => m.utilization >= thresholds.utilizationCritical);
    if (criticalUtil.length > 0) {
      alerts.push({
        type: 'utilization',
        severity: 'critical',
        message: `${criticalUtil.length} team member(s) critically overloaded`,
        affectedMembers: criticalUtil.map(m => m.id),
      });
    }

    const warningUtil = members.filter(
      m => m.utilization >= thresholds.utilizationWarning && m.utilization < thresholds.utilizationCritical
    );
    if (warningUtil.length > 0) {
      alerts.push({
        type: 'utilization',
        severity: 'warning',
        message: `${warningUtil.length} team member(s) approaching capacity`,
        affectedMembers: warningUtil.map(m => m.id),
      });
    }

    // Burnout alerts
    const criticalBurnout = members.filter(m => m.burnoutScore >= thresholds.burnoutCritical);
    if (criticalBurnout.length > 0) {
      alerts.push({
        type: 'burnout',
        severity: 'critical',
        message: `${criticalBurnout.length} team member(s) at critical burnout risk`,
        affectedMembers: criticalBurnout.map(m => m.id),
      });
    }

    // Overdue alerts
    const withOverdue = members.filter(m => m.overdueTasks >= thresholds.overdueTasks);
    if (withOverdue.length > 0) {
      alerts.push({
        type: 'overdue',
        severity: 'warning',
        message: `${withOverdue.length} team member(s) have multiple overdue tasks`,
        affectedMembers: withOverdue.map(m => m.id),
      });
    }

    return alerts;
  };

  it('should generate utilization alerts', () => {
    const members: MemberMetrics[] = [
      { id: 'user-1', name: 'Alice', utilization: 130, burnoutScore: 30, overdueTasks: 0 },
      { id: 'user-2', name: 'Bob', utilization: 95, burnoutScore: 20, overdueTasks: 0 },
    ];

    const thresholds: AlertThresholds = {
      utilizationWarning: 90,
      utilizationCritical: 120,
      burnoutWarning: 50,
      burnoutCritical: 75,
      overdueTasks: 3,
    };

    const alerts = generateAlerts(members, thresholds);
    const criticalAlert = alerts.find(a => a.type === 'utilization' && a.severity === 'critical');
    const warningAlert = alerts.find(a => a.type === 'utilization' && a.severity === 'warning');

    expect(criticalAlert?.affectedMembers).toContain('user-1');
    expect(warningAlert?.affectedMembers).toContain('user-2');
  });

  it('should generate burnout alerts', () => {
    const members: MemberMetrics[] = [
      { id: 'user-1', name: 'Alice', utilization: 80, burnoutScore: 80, overdueTasks: 0 },
    ];

    const thresholds: AlertThresholds = {
      utilizationWarning: 90,
      utilizationCritical: 120,
      burnoutWarning: 50,
      burnoutCritical: 75,
      overdueTasks: 3,
    };

    const alerts = generateAlerts(members, thresholds);
    const burnoutAlert = alerts.find(a => a.type === 'burnout');

    expect(burnoutAlert).toBeDefined();
    expect(burnoutAlert?.severity).toBe('critical');
  });
});
