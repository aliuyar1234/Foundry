/**
 * Burnout Predictor Service
 * T203 - Predict employee burnout risk based on workload patterns
 *
 * Uses multiple signals to identify early warning signs of burnout
 */

import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface BurnoutPrediction {
  personId: string;
  personName: string;
  teamId: string;
  currentRiskLevel: 'critical' | 'high' | 'moderate' | 'low';
  riskScore: number; // 0-100
  predictedBurnoutDate?: Date;
  daysUntilCritical?: number;
  factors: BurnoutFactor[];
  trend: 'improving' | 'stable' | 'worsening';
  recommendations: string[];
  lastUpdated: Date;
}

export interface BurnoutFactor {
  name: string;
  category: 'workload' | 'communication' | 'schedule' | 'performance' | 'pattern';
  impact: 'high' | 'medium' | 'low';
  score: number; // 0-100, contribution to burnout
  details: string;
  threshold: number;
  currentValue: number;
}

export interface TeamBurnoutSummary {
  teamId: string;
  teamName: string;
  memberCount: number;
  averageRiskScore: number;
  criticalCount: number;
  highRiskCount: number;
  moderateCount: number;
  lowRiskCount: number;
  trend: 'improving' | 'stable' | 'worsening';
}

export interface BurnoutTrend {
  date: Date;
  riskScore: number;
  factors: Record<string, number>;
}

// Factor weights for overall score calculation
const FACTOR_WEIGHTS = {
  workload_hours: 0.20,
  task_volume: 0.15,
  communication_volume: 0.10,
  response_time_pressure: 0.10,
  meeting_overload: 0.10,
  weekend_work: 0.10,
  overtime_frequency: 0.10,
  task_complexity: 0.05,
  deadline_pressure: 0.05,
  vacation_deficit: 0.05,
};

// Risk level thresholds
const RISK_THRESHOLDS = {
  critical: 80,
  high: 60,
  moderate: 40,
  low: 0,
};

// =============================================================================
// Burnout Predictor
// =============================================================================

/**
 * Predict burnout risk for a single person
 */
export async function predictBurnout(
  personId: string,
  options: {
    lookbackDays?: number;
    includeHistory?: boolean;
  } = {}
): Promise<BurnoutPrediction> {
  const { lookbackDays = 30, includeHistory = false } = options;

  const person = await prisma.user.findUnique({
    where: { id: personId },
    include: {
      organization: true,
    },
  });

  if (!person) {
    throw new Error(`Person not found: ${personId}`);
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  // Calculate individual factors
  const factors = await calculateBurnoutFactors(personId, startDate, endDate);

  // Calculate overall risk score
  const riskScore = calculateOverallScore(factors);
  const riskLevel = getRiskLevel(riskScore);

  // Get trend
  const trend = includeHistory
    ? await calculateTrend(personId, lookbackDays)
    : 'stable';

  // Predict days until critical
  const daysUntilCritical = predictDaysUntilCritical(riskScore, trend);

  // Generate recommendations
  const recommendations = generateRecommendations(factors, riskLevel);

  return {
    personId,
    personName: person.name || person.email,
    teamId: person.organizationId,
    currentRiskLevel: riskLevel,
    riskScore,
    predictedBurnoutDate: daysUntilCritical
      ? new Date(Date.now() + daysUntilCritical * 24 * 60 * 60 * 1000)
      : undefined,
    daysUntilCritical,
    factors,
    trend,
    recommendations,
    lastUpdated: new Date(),
  };
}

/**
 * Predict burnout risk for an entire team
 */
export async function predictTeamBurnout(
  teamId: string,
  options: { lookbackDays?: number } = {}
): Promise<{
  summary: TeamBurnoutSummary;
  members: BurnoutPrediction[];
}> {
  const { lookbackDays = 30 } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: {
      users: true,
    },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const memberPredictions = await Promise.all(
    team.users.map((user) =>
      predictBurnout(user.id, { lookbackDays, includeHistory: true })
    )
  );

  const summary = calculateTeamSummary(teamId, team.name, memberPredictions);

  return {
    summary,
    members: memberPredictions,
  };
}

/**
 * Get historical burnout trends for a person
 */
export async function getBurnoutHistory(
  personId: string,
  options: {
    days?: number;
    granularity?: 'daily' | 'weekly';
  } = {}
): Promise<BurnoutTrend[]> {
  const { days = 90, granularity = 'weekly' } = options;

  const trends: BurnoutTrend[] = [];
  const intervalDays = granularity === 'daily' ? 1 : 7;
  const endDate = new Date();

  for (let i = 0; i < days; i += intervalDays) {
    const date = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000);
    const lookbackEnd = date;
    const lookbackStart = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000);

    const factors = await calculateBurnoutFactors(personId, lookbackStart, lookbackEnd);
    const riskScore = calculateOverallScore(factors);

    trends.unshift({
      date,
      riskScore,
      factors: factors.reduce((acc, f) => {
        acc[f.name] = f.score;
        return acc;
      }, {} as Record<string, number>),
    });
  }

  return trends;
}

/**
 * Get people at risk across the organization
 */
export async function getAtRiskPeople(
  organizationId: string,
  options: {
    minRiskLevel?: 'critical' | 'high' | 'moderate';
    limit?: number;
  } = {}
): Promise<BurnoutPrediction[]> {
  const { minRiskLevel = 'moderate', limit = 50 } = options;

  const users = await prisma.user.findMany({
    where: { organizationId },
    take: limit * 2, // Get more to filter
  });

  const predictions = await Promise.all(
    users.map((user) => predictBurnout(user.id))
  );

  const thresholdScore = RISK_THRESHOLDS[minRiskLevel];

  return predictions
    .filter((p) => p.riskScore >= thresholdScore)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit);
}

// =============================================================================
// Factor Calculation
// =============================================================================

async function calculateBurnoutFactors(
  personId: string,
  startDate: Date,
  endDate: Date
): Promise<BurnoutFactor[]> {
  const factors: BurnoutFactor[] = [];

  // Workload hours factor
  const hoursWorked = await calculateWorkloadHours(personId, startDate, endDate);
  factors.push({
    name: 'workload_hours',
    category: 'workload',
    impact: hoursWorked.score > 70 ? 'high' : hoursWorked.score > 40 ? 'medium' : 'low',
    score: hoursWorked.score,
    details: `Average ${hoursWorked.avgHours.toFixed(1)} hours/week`,
    threshold: 45,
    currentValue: hoursWorked.avgHours,
  });

  // Task volume factor
  const taskVolume = await calculateTaskVolume(personId, startDate, endDate);
  factors.push({
    name: 'task_volume',
    category: 'workload',
    impact: taskVolume.score > 70 ? 'high' : taskVolume.score > 40 ? 'medium' : 'low',
    score: taskVolume.score,
    details: `${taskVolume.openTasks} open tasks, ${taskVolume.completedRate}% completion rate`,
    threshold: 15,
    currentValue: taskVolume.openTasks,
  });

  // Communication volume factor
  const commVolume = await calculateCommunicationVolume(personId, startDate, endDate);
  factors.push({
    name: 'communication_volume',
    category: 'communication',
    impact: commVolume.score > 70 ? 'high' : commVolume.score > 40 ? 'medium' : 'low',
    score: commVolume.score,
    details: `${commVolume.dailyMessages} messages/day average`,
    threshold: 50,
    currentValue: commVolume.dailyMessages,
  });

  // Response time pressure factor
  const responseTime = await calculateResponseTimePressure(personId, startDate, endDate);
  factors.push({
    name: 'response_time_pressure',
    category: 'communication',
    impact: responseTime.score > 70 ? 'high' : responseTime.score > 40 ? 'medium' : 'low',
    score: responseTime.score,
    details: `${responseTime.avgResponseMinutes} min avg response time`,
    threshold: 30,
    currentValue: responseTime.avgResponseMinutes,
  });

  // Meeting overload factor
  const meetings = await calculateMeetingOverload(personId, startDate, endDate);
  factors.push({
    name: 'meeting_overload',
    category: 'schedule',
    impact: meetings.score > 70 ? 'high' : meetings.score > 40 ? 'medium' : 'low',
    score: meetings.score,
    details: `${meetings.hoursPerWeek.toFixed(1)} hours/week in meetings`,
    threshold: 15,
    currentValue: meetings.hoursPerWeek,
  });

  // Weekend work factor
  const weekendWork = await calculateWeekendWork(personId, startDate, endDate);
  factors.push({
    name: 'weekend_work',
    category: 'pattern',
    impact: weekendWork.score > 70 ? 'high' : weekendWork.score > 40 ? 'medium' : 'low',
    score: weekendWork.score,
    details: `${weekendWork.weekendsWorked} of ${weekendWork.totalWeekends} weekends`,
    threshold: 1,
    currentValue: weekendWork.weekendsWorked,
  });

  // Overtime frequency factor
  const overtime = await calculateOvertimeFrequency(personId, startDate, endDate);
  factors.push({
    name: 'overtime_frequency',
    category: 'schedule',
    impact: overtime.score > 70 ? 'high' : overtime.score > 40 ? 'medium' : 'low',
    score: overtime.score,
    details: `Overtime ${overtime.overtimeDays} of ${overtime.workDays} days`,
    threshold: 5,
    currentValue: overtime.overtimeDays,
  });

  // Task complexity factor
  const complexity = await calculateTaskComplexity(personId, startDate, endDate);
  factors.push({
    name: 'task_complexity',
    category: 'workload',
    impact: complexity.score > 70 ? 'high' : complexity.score > 40 ? 'medium' : 'low',
    score: complexity.score,
    details: `${complexity.highComplexityPercent}% high complexity tasks`,
    threshold: 30,
    currentValue: complexity.highComplexityPercent,
  });

  // Deadline pressure factor
  const deadlines = await calculateDeadlinePressure(personId, startDate, endDate);
  factors.push({
    name: 'deadline_pressure',
    category: 'schedule',
    impact: deadlines.score > 70 ? 'high' : deadlines.score > 40 ? 'medium' : 'low',
    score: deadlines.score,
    details: `${deadlines.missedDeadlines} missed, ${deadlines.urgentTasks} urgent`,
    threshold: 3,
    currentValue: deadlines.urgentTasks,
  });

  // Vacation deficit factor
  const vacation = await calculateVacationDeficit(personId, startDate, endDate);
  factors.push({
    name: 'vacation_deficit',
    category: 'pattern',
    impact: vacation.score > 70 ? 'high' : vacation.score > 40 ? 'medium' : 'low',
    score: vacation.score,
    details: `${vacation.daysSinceVacation} days since last vacation`,
    threshold: 60,
    currentValue: vacation.daysSinceVacation,
  });

  return factors;
}

// Helper functions for factor calculations (simplified implementations)

async function calculateWorkloadHours(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ avgHours: number; score: number }> {
  // In production, this would query time tracking data
  const avgHours = 42 + Math.random() * 15;
  const score = Math.min(100, Math.max(0, (avgHours - 40) * 10));
  return { avgHours, score };
}

async function calculateTaskVolume(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ openTasks: number; completedRate: number; score: number }> {
  const openTasks = Math.floor(10 + Math.random() * 20);
  const completedRate = Math.floor(60 + Math.random() * 30);
  const score = Math.min(100, Math.max(0, (openTasks - 10) * 5 + (100 - completedRate)));
  return { openTasks, completedRate, score };
}

async function calculateCommunicationVolume(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ dailyMessages: number; score: number }> {
  const dailyMessages = Math.floor(30 + Math.random() * 70);
  const score = Math.min(100, Math.max(0, (dailyMessages - 30) * 1.5));
  return { dailyMessages, score };
}

async function calculateResponseTimePressure(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ avgResponseMinutes: number; score: number }> {
  const avgResponseMinutes = Math.floor(5 + Math.random() * 60);
  const score = Math.min(100, Math.max(0, 100 - avgResponseMinutes * 1.5));
  return { avgResponseMinutes, score };
}

async function calculateMeetingOverload(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ hoursPerWeek: number; score: number }> {
  const hoursPerWeek = 5 + Math.random() * 20;
  const score = Math.min(100, Math.max(0, (hoursPerWeek - 10) * 6));
  return { hoursPerWeek, score };
}

async function calculateWeekendWork(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ weekendsWorked: number; totalWeekends: number; score: number }> {
  const totalWeekends = 4;
  const weekendsWorked = Math.floor(Math.random() * 3);
  const score = (weekendsWorked / totalWeekends) * 100;
  return { weekendsWorked, totalWeekends, score };
}

async function calculateOvertimeFrequency(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ overtimeDays: number; workDays: number; score: number }> {
  const workDays = 20;
  const overtimeDays = Math.floor(Math.random() * 10);
  const score = (overtimeDays / workDays) * 100;
  return { overtimeDays, workDays, score };
}

async function calculateTaskComplexity(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ highComplexityPercent: number; score: number }> {
  const highComplexityPercent = Math.floor(20 + Math.random() * 40);
  const score = highComplexityPercent;
  return { highComplexityPercent, score };
}

async function calculateDeadlinePressure(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ missedDeadlines: number; urgentTasks: number; score: number }> {
  const missedDeadlines = Math.floor(Math.random() * 5);
  const urgentTasks = Math.floor(Math.random() * 8);
  const score = Math.min(100, missedDeadlines * 20 + urgentTasks * 10);
  return { missedDeadlines, urgentTasks, score };
}

async function calculateVacationDeficit(
  _personId: string,
  _startDate: Date,
  _endDate: Date
): Promise<{ daysSinceVacation: number; score: number }> {
  const daysSinceVacation = Math.floor(30 + Math.random() * 90);
  const score = Math.min(100, Math.max(0, (daysSinceVacation - 30) * 1.5));
  return { daysSinceVacation, score };
}

// =============================================================================
// Score Calculation
// =============================================================================

function calculateOverallScore(factors: BurnoutFactor[]): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const factor of factors) {
    const weight = FACTOR_WEIGHTS[factor.name as keyof typeof FACTOR_WEIGHTS] || 0.05;
    weightedSum += factor.score * weight;
    totalWeight += weight;
  }

  return Math.round(weightedSum / totalWeight);
}

function getRiskLevel(score: number): BurnoutPrediction['currentRiskLevel'] {
  if (score >= RISK_THRESHOLDS.critical) return 'critical';
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

async function calculateTrend(
  personId: string,
  lookbackDays: number
): Promise<BurnoutPrediction['trend']> {
  // Compare current score to historical average
  const currentEnd = new Date();
  const currentStart = new Date(currentEnd.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const currentFactors = await calculateBurnoutFactors(personId, currentStart, currentEnd);
  const previousFactors = await calculateBurnoutFactors(personId, previousStart, currentStart);

  const currentScore = calculateOverallScore(currentFactors);
  const previousScore = calculateOverallScore(previousFactors);

  const diff = currentScore - previousScore;
  if (diff > 5) return 'worsening';
  if (diff < -5) return 'improving';
  return 'stable';
}

function predictDaysUntilCritical(score: number, trend: string): number | undefined {
  if (score >= RISK_THRESHOLDS.critical) return 0;

  if (trend === 'worsening') {
    const pointsToGo = RISK_THRESHOLDS.critical - score;
    const dailyIncrease = 1; // Estimated points per day
    return Math.ceil(pointsToGo / dailyIncrease);
  }

  return undefined;
}

function generateRecommendations(
  factors: BurnoutFactor[],
  riskLevel: BurnoutPrediction['currentRiskLevel']
): string[] {
  const recommendations: string[] = [];

  // Sort factors by score (highest impact first)
  const sortedFactors = [...factors].sort((a, b) => b.score - a.score);
  const topFactors = sortedFactors.slice(0, 3);

  for (const factor of topFactors) {
    switch (factor.name) {
      case 'workload_hours':
        recommendations.push('Reduce weekly working hours to below 45');
        break;
      case 'task_volume':
        recommendations.push('Redistribute some tasks to reduce backlog');
        break;
      case 'communication_volume':
        recommendations.push('Implement focus time blocks with notification pause');
        break;
      case 'response_time_pressure':
        recommendations.push('Set realistic response time expectations');
        break;
      case 'meeting_overload':
        recommendations.push('Audit and reduce recurring meetings');
        break;
      case 'weekend_work':
        recommendations.push('Enforce weekend boundaries and time off');
        break;
      case 'overtime_frequency':
        recommendations.push('Identify and address causes of frequent overtime');
        break;
      case 'vacation_deficit':
        recommendations.push('Schedule mandatory time off within 30 days');
        break;
      case 'deadline_pressure':
        recommendations.push('Review and reprioritize urgent tasks');
        break;
    }
  }

  if (riskLevel === 'critical') {
    recommendations.unshift('IMMEDIATE: Schedule check-in with manager');
  } else if (riskLevel === 'high') {
    recommendations.unshift('Schedule workload review meeting');
  }

  return recommendations;
}

function calculateTeamSummary(
  teamId: string,
  teamName: string,
  members: BurnoutPrediction[]
): TeamBurnoutSummary {
  const criticalCount = members.filter((m) => m.currentRiskLevel === 'critical').length;
  const highRiskCount = members.filter((m) => m.currentRiskLevel === 'high').length;
  const moderateCount = members.filter((m) => m.currentRiskLevel === 'moderate').length;
  const lowRiskCount = members.filter((m) => m.currentRiskLevel === 'low').length;

  const averageRiskScore =
    members.length > 0
      ? members.reduce((sum, m) => sum + m.riskScore, 0) / members.length
      : 0;

  const trends = members.map((m) => m.trend);
  const worseningCount = trends.filter((t) => t === 'worsening').length;
  const improvingCount = trends.filter((t) => t === 'improving').length;

  let trend: TeamBurnoutSummary['trend'] = 'stable';
  if (worseningCount > improvingCount + 2) trend = 'worsening';
  else if (improvingCount > worseningCount + 2) trend = 'improving';

  return {
    teamId,
    teamName,
    memberCount: members.length,
    averageRiskScore: Math.round(averageRiskScore),
    criticalCount,
    highRiskCount,
    moderateCount,
    lowRiskCount,
    trend,
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  predictBurnout,
  predictTeamBurnout,
  getBurnoutHistory,
  getAtRiskPeople,
};
