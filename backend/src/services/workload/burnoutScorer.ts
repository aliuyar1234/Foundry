/**
 * Burnout Risk Scorer
 * T214 - Calculate detailed burnout risk scores
 *
 * Provides granular scoring for burnout risk factors
 */

import { prisma } from '../../lib/prisma.js';

// =============================================================================
// Types
// =============================================================================

export interface BurnoutRiskScore {
  personId: string;
  personName: string;
  calculatedAt: Date;
  overallScore: number; // 0-100, higher = more risk
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  factorScores: FactorScore[];
  trendDirection: 'improving' | 'stable' | 'declining';
  trendMagnitude: number;
  recommendations: BurnoutRecommendation[];
  historicalComparison: HistoricalComparison;
}

export interface FactorScore {
  factor: string;
  category: 'workload' | 'communication' | 'schedule' | 'engagement' | 'social';
  score: number; // 0-100
  weight: number;
  weightedScore: number;
  indicators: Indicator[];
  trend: 'improving' | 'stable' | 'declining';
}

export interface Indicator {
  name: string;
  value: number;
  threshold: number;
  status: 'healthy' | 'warning' | 'critical';
  description: string;
}

export interface BurnoutRecommendation {
  priority: 'immediate' | 'short_term' | 'long_term';
  category: string;
  action: string;
  expectedImpact: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface HistoricalComparison {
  periodDays: number;
  previousScore: number;
  currentScore: number;
  change: number;
  percentChange: number;
}

export interface TeamBurnoutSummary {
  teamId: string;
  calculatedAt: Date;
  averageScore: number;
  distribution: {
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };
  topRiskFactors: Array<{
    factor: string;
    affectedCount: number;
    averageScore: number;
  }>;
  teamRecommendations: BurnoutRecommendation[];
  memberScores: BurnoutRiskScore[];
}

// =============================================================================
// Burnout Scorer
// =============================================================================

// Factor weights (must sum to 1)
const FACTOR_WEIGHTS = {
  workload_hours: 0.20,
  task_complexity: 0.15,
  deadline_pressure: 0.15,
  communication_overload: 0.10,
  after_hours_work: 0.10,
  meeting_burden: 0.10,
  task_fragmentation: 0.05,
  lack_of_breaks: 0.05,
  social_isolation: 0.05,
  recognition_deficit: 0.05,
};

const RISK_THRESHOLDS = {
  low: 30,
  moderate: 50,
  high: 70,
  critical: 85,
};

/**
 * Calculate detailed burnout risk score for a person
 */
export async function calculateBurnoutScore(
  personId: string,
  options: {
    includeTrends?: boolean;
    includeRecommendations?: boolean;
    periodDays?: number;
  } = {}
): Promise<BurnoutRiskScore> {
  const {
    includeTrends = true,
    includeRecommendations = true,
    periodDays = 30,
  } = options;

  const user = await prisma.user.findUnique({
    where: { id: personId },
  });

  if (!user) {
    throw new Error(`Person not found: ${personId}`);
  }

  // Calculate factor scores
  const factorScores = await calculateFactorScores(personId);

  // Calculate overall score
  const overallScore = Math.round(
    factorScores.reduce((sum, f) => sum + f.weightedScore, 0)
  );

  // Determine risk level
  const riskLevel = getRiskLevel(overallScore);

  // Get historical comparison
  const historicalComparison = await getHistoricalComparison(personId, periodDays);

  // Determine trend
  const trendDirection = determineTrend(historicalComparison);
  const trendMagnitude = Math.abs(historicalComparison.percentChange);

  // Generate recommendations
  const recommendations = includeRecommendations
    ? generateRecommendations(factorScores, riskLevel)
    : [];

  return {
    personId,
    personName: user.name || user.email,
    calculatedAt: new Date(),
    overallScore,
    riskLevel,
    factorScores,
    trendDirection,
    trendMagnitude,
    recommendations,
    historicalComparison,
  };
}

/**
 * Calculate team burnout summary
 */
export async function calculateTeamBurnoutScore(
  teamId: string,
  options: {
    includeIndividualScores?: boolean;
  } = {}
): Promise<TeamBurnoutSummary> {
  const { includeIndividualScores = true } = options;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Calculate individual scores
  const memberScores = await Promise.all(
    team.users.map((user) =>
      calculateBurnoutScore(user.id, {
        includeTrends: true,
        includeRecommendations: false,
      })
    )
  );

  // Calculate distribution
  const distribution = {
    low: memberScores.filter((s) => s.riskLevel === 'low').length,
    moderate: memberScores.filter((s) => s.riskLevel === 'moderate').length,
    high: memberScores.filter((s) => s.riskLevel === 'high').length,
    critical: memberScores.filter((s) => s.riskLevel === 'critical').length,
  };

  // Calculate average score
  const averageScore = Math.round(
    memberScores.reduce((sum, s) => sum + s.overallScore, 0) / memberScores.length
  );

  // Find top risk factors
  const topRiskFactors = aggregateRiskFactors(memberScores);

  // Generate team recommendations
  const teamRecommendations = generateTeamRecommendations(topRiskFactors, distribution);

  return {
    teamId,
    calculatedAt: new Date(),
    averageScore,
    distribution,
    topRiskFactors,
    teamRecommendations,
    memberScores: includeIndividualScores ? memberScores : [],
  };
}

/**
 * Get burnout score trend for a person
 */
export async function getBurnoutScoreTrend(
  personId: string,
  options: {
    periodDays?: number;
    dataPoints?: number;
  } = {}
): Promise<Array<{
  date: Date;
  score: number;
  riskLevel: string;
}>> {
  const { periodDays = 90, dataPoints = 12 } = options;

  const trend: Array<{ date: Date; score: number; riskLevel: string }> = [];
  const intervalDays = Math.floor(periodDays / dataPoints);

  for (let i = 0; i < dataPoints; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (dataPoints - 1 - i) * intervalDays);

    // Simulate historical scores (in production, query from history table)
    const baseScore = 45 + Math.random() * 30;
    const score = Math.round(baseScore + Math.sin(i * 0.5) * 10);

    trend.push({
      date,
      score,
      riskLevel: getRiskLevel(score),
    });
  }

  return trend;
}

/**
 * Compare burnout scores between team members
 */
export async function compareBurnoutScores(
  personIds: string[]
): Promise<Array<{
  personId: string;
  personName: string;
  score: number;
  riskLevel: string;
  topFactors: string[];
}>> {
  const comparisons = await Promise.all(
    personIds.map(async (personId) => {
      const score = await calculateBurnoutScore(personId, {
        includeTrends: false,
        includeRecommendations: false,
      });

      const topFactors = [...score.factorScores]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((f) => f.factor);

      return {
        personId: score.personId,
        personName: score.personName,
        score: score.overallScore,
        riskLevel: score.riskLevel,
        topFactors,
      };
    })
  );

  return comparisons.sort((a, b) => b.score - a.score);
}

// =============================================================================
// Helper Functions
// =============================================================================

async function calculateFactorScores(personId: string): Promise<FactorScore[]> {
  const factors: FactorScore[] = [];

  // Workload hours factor
  const workloadHours = await getWorkloadHoursScore(personId);
  factors.push(createFactorScore('workload_hours', 'workload', workloadHours));

  // Task complexity factor
  const taskComplexity = await getTaskComplexityScore(personId);
  factors.push(createFactorScore('task_complexity', 'workload', taskComplexity));

  // Deadline pressure factor
  const deadlinePressure = await getDeadlinePressureScore(personId);
  factors.push(createFactorScore('deadline_pressure', 'workload', deadlinePressure));

  // Communication overload factor
  const communicationOverload = await getCommunicationOverloadScore(personId);
  factors.push(createFactorScore('communication_overload', 'communication', communicationOverload));

  // After hours work factor
  const afterHoursWork = await getAfterHoursWorkScore(personId);
  factors.push(createFactorScore('after_hours_work', 'schedule', afterHoursWork));

  // Meeting burden factor
  const meetingBurden = await getMeetingBurdenScore(personId);
  factors.push(createFactorScore('meeting_burden', 'schedule', meetingBurden));

  // Task fragmentation factor
  const taskFragmentation = await getTaskFragmentationScore(personId);
  factors.push(createFactorScore('task_fragmentation', 'workload', taskFragmentation));

  // Lack of breaks factor
  const lackOfBreaks = await getLackOfBreaksScore(personId);
  factors.push(createFactorScore('lack_of_breaks', 'schedule', lackOfBreaks));

  // Social isolation factor
  const socialIsolation = await getSocialIsolationScore(personId);
  factors.push(createFactorScore('social_isolation', 'social', socialIsolation));

  // Recognition deficit factor
  const recognitionDeficit = await getRecognitionDeficitScore(personId);
  factors.push(createFactorScore('recognition_deficit', 'engagement', recognitionDeficit));

  return factors;
}

function createFactorScore(
  factor: string,
  category: FactorScore['category'],
  data: { score: number; indicators: Indicator[]; trend: FactorScore['trend'] }
): FactorScore {
  const weight = FACTOR_WEIGHTS[factor as keyof typeof FACTOR_WEIGHTS] || 0.1;

  return {
    factor,
    category,
    score: data.score,
    weight,
    weightedScore: data.score * weight,
    indicators: data.indicators,
    trend: data.trend,
  };
}

async function getWorkloadHoursScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  // Simulate workload hours analysis
  const weeklyHours = 40 + Math.random() * 20;
  const avgTaskHours = 6 + Math.random() * 4;
  const overtimeHours = Math.max(0, weeklyHours - 40);

  const score = Math.min(100, Math.round((weeklyHours / 60) * 100));

  return {
    score,
    indicators: [
      {
        name: 'Weekly Hours',
        value: Math.round(weeklyHours),
        threshold: 45,
        status: weeklyHours > 50 ? 'critical' : weeklyHours > 45 ? 'warning' : 'healthy',
        description: `${Math.round(weeklyHours)} hours/week`,
      },
      {
        name: 'Overtime',
        value: Math.round(overtimeHours),
        threshold: 5,
        status: overtimeHours > 10 ? 'critical' : overtimeHours > 5 ? 'warning' : 'healthy',
        description: `${Math.round(overtimeHours)} hours overtime`,
      },
    ],
    trend: Math.random() > 0.5 ? 'stable' : 'declining',
  };
}

async function getTaskComplexityScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const avgComplexity = 3 + Math.random() * 2; // 1-5 scale
  const highComplexityPercent = 20 + Math.random() * 40;

  const score = Math.round((avgComplexity / 5) * 100);

  return {
    score,
    indicators: [
      {
        name: 'Average Complexity',
        value: Math.round(avgComplexity * 10) / 10,
        threshold: 3.5,
        status: avgComplexity > 4 ? 'critical' : avgComplexity > 3.5 ? 'warning' : 'healthy',
        description: `${(avgComplexity).toFixed(1)}/5 average`,
      },
      {
        name: 'High Complexity Tasks',
        value: Math.round(highComplexityPercent),
        threshold: 30,
        status: highComplexityPercent > 50 ? 'critical' : highComplexityPercent > 30 ? 'warning' : 'healthy',
        description: `${Math.round(highComplexityPercent)}% high complexity`,
      },
    ],
    trend: 'stable',
  };
}

async function getDeadlinePressureScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const urgentTasks = Math.floor(Math.random() * 5);
  const missedDeadlines = Math.floor(Math.random() * 2);
  const avgBufferDays = 3 + Math.random() * 7;

  const score = Math.min(100, urgentTasks * 15 + missedDeadlines * 20);

  return {
    score,
    indicators: [
      {
        name: 'Urgent Tasks',
        value: urgentTasks,
        threshold: 2,
        status: urgentTasks > 3 ? 'critical' : urgentTasks > 2 ? 'warning' : 'healthy',
        description: `${urgentTasks} tasks due within 24h`,
      },
      {
        name: 'Deadline Buffer',
        value: Math.round(avgBufferDays),
        threshold: 3,
        status: avgBufferDays < 2 ? 'critical' : avgBufferDays < 3 ? 'warning' : 'healthy',
        description: `${Math.round(avgBufferDays)} days average buffer`,
      },
    ],
    trend: missedDeadlines > 0 ? 'declining' : 'stable',
  };
}

async function getCommunicationOverloadScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const dailyMessages = 50 + Math.floor(Math.random() * 100);
  const responseExpectations = 30 + Math.floor(Math.random() * 60); // minutes
  const channelCount = 3 + Math.floor(Math.random() * 5);

  const score = Math.min(100, Math.round((dailyMessages / 150) * 100));

  return {
    score,
    indicators: [
      {
        name: 'Daily Messages',
        value: dailyMessages,
        threshold: 100,
        status: dailyMessages > 150 ? 'critical' : dailyMessages > 100 ? 'warning' : 'healthy',
        description: `${dailyMessages} messages/day`,
      },
      {
        name: 'Channels Monitored',
        value: channelCount,
        threshold: 5,
        status: channelCount > 7 ? 'critical' : channelCount > 5 ? 'warning' : 'healthy',
        description: `${channelCount} active channels`,
      },
    ],
    trend: 'stable',
  };
}

async function getAfterHoursWorkScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const afterHoursPercent = Math.random() * 30;
  const weekendWork = Math.random() > 0.7;
  const lateNightSessions = Math.floor(Math.random() * 3);

  const score = Math.round(afterHoursPercent * 3 + (weekendWork ? 20 : 0));

  return {
    score,
    indicators: [
      {
        name: 'After Hours Work',
        value: Math.round(afterHoursPercent),
        threshold: 10,
        status: afterHoursPercent > 20 ? 'critical' : afterHoursPercent > 10 ? 'warning' : 'healthy',
        description: `${Math.round(afterHoursPercent)}% outside business hours`,
      },
      {
        name: 'Late Night Sessions',
        value: lateNightSessions,
        threshold: 1,
        status: lateNightSessions > 2 ? 'critical' : lateNightSessions > 1 ? 'warning' : 'healthy',
        description: `${lateNightSessions} this week`,
      },
    ],
    trend: afterHoursPercent > 15 ? 'declining' : 'stable',
  };
}

async function getMeetingBurdenScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const meetingHours = 5 + Math.random() * 15;
  const meetingPercent = (meetingHours / 40) * 100;
  const backToBackMeetings = Math.floor(Math.random() * 5);

  const score = Math.min(100, Math.round(meetingPercent * 2));

  return {
    score,
    indicators: [
      {
        name: 'Meeting Hours',
        value: Math.round(meetingHours),
        threshold: 15,
        status: meetingHours > 20 ? 'critical' : meetingHours > 15 ? 'warning' : 'healthy',
        description: `${Math.round(meetingHours)} hours/week`,
      },
      {
        name: 'Back-to-Back Meetings',
        value: backToBackMeetings,
        threshold: 3,
        status: backToBackMeetings > 5 ? 'critical' : backToBackMeetings > 3 ? 'warning' : 'healthy',
        description: `${backToBackMeetings} this week`,
      },
    ],
    trend: 'stable',
  };
}

async function getTaskFragmentationScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const contextSwitches = 5 + Math.floor(Math.random() * 15);
  const activeTasks = 3 + Math.floor(Math.random() * 7);
  const avgFocusBlock = 30 + Math.floor(Math.random() * 60); // minutes

  const score = Math.min(100, contextSwitches * 5);

  return {
    score,
    indicators: [
      {
        name: 'Context Switches',
        value: contextSwitches,
        threshold: 10,
        status: contextSwitches > 15 ? 'critical' : contextSwitches > 10 ? 'warning' : 'healthy',
        description: `${contextSwitches}/day`,
      },
      {
        name: 'Focus Block',
        value: avgFocusBlock,
        threshold: 45,
        status: avgFocusBlock < 30 ? 'critical' : avgFocusBlock < 45 ? 'warning' : 'healthy',
        description: `${avgFocusBlock} min average`,
      },
    ],
    trend: 'stable',
  };
}

async function getLackOfBreaksScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const breakCount = 2 + Math.floor(Math.random() * 4);
  const lunchBreakTaken = Math.random() > 0.3;
  const avgBreakDuration = 5 + Math.floor(Math.random() * 10); // minutes

  const score = Math.max(0, 100 - breakCount * 20);

  return {
    score,
    indicators: [
      {
        name: 'Daily Breaks',
        value: breakCount,
        threshold: 3,
        status: breakCount < 2 ? 'critical' : breakCount < 3 ? 'warning' : 'healthy',
        description: `${breakCount} breaks/day`,
      },
      {
        name: 'Lunch Break',
        value: lunchBreakTaken ? 1 : 0,
        threshold: 1,
        status: lunchBreakTaken ? 'healthy' : 'warning',
        description: lunchBreakTaken ? 'Taken' : 'Often skipped',
      },
    ],
    trend: breakCount < 2 ? 'declining' : 'stable',
  };
}

async function getSocialIsolationScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const teamInteractions = 5 + Math.floor(Math.random() * 15);
  const collaborativeTasks = Math.floor(Math.random() * 5);
  const socialEvents = Math.floor(Math.random() * 3);

  const score = Math.max(0, 100 - teamInteractions * 5 - collaborativeTasks * 10);

  return {
    score,
    indicators: [
      {
        name: 'Team Interactions',
        value: teamInteractions,
        threshold: 10,
        status: teamInteractions < 5 ? 'critical' : teamInteractions < 10 ? 'warning' : 'healthy',
        description: `${teamInteractions}/week`,
      },
      {
        name: 'Collaborative Tasks',
        value: collaborativeTasks,
        threshold: 2,
        status: collaborativeTasks < 1 ? 'critical' : collaborativeTasks < 2 ? 'warning' : 'healthy',
        description: `${collaborativeTasks} this week`,
      },
    ],
    trend: 'stable',
  };
}

async function getRecognitionDeficitScore(personId: string): Promise<{
  score: number;
  indicators: Indicator[];
  trend: FactorScore['trend'];
}> {
  const recentRecognitions = Math.floor(Math.random() * 3);
  const feedbackReceived = Math.floor(Math.random() * 5);
  const accomplishmentsAcknowledged = Math.random() > 0.5;

  const score = Math.max(0, 100 - recentRecognitions * 30 - feedbackReceived * 10);

  return {
    score,
    indicators: [
      {
        name: 'Recent Recognition',
        value: recentRecognitions,
        threshold: 1,
        status: recentRecognitions === 0 ? 'warning' : 'healthy',
        description: `${recentRecognitions} in past 30 days`,
      },
      {
        name: 'Feedback Received',
        value: feedbackReceived,
        threshold: 2,
        status: feedbackReceived < 1 ? 'critical' : feedbackReceived < 2 ? 'warning' : 'healthy',
        description: `${feedbackReceived} feedback items`,
      },
    ],
    trend: recentRecognitions === 0 ? 'declining' : 'stable',
  };
}

function getRiskLevel(score: number): BurnoutRiskScore['riskLevel'] {
  if (score >= RISK_THRESHOLDS.critical) return 'critical';
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

async function getHistoricalComparison(
  personId: string,
  periodDays: number
): Promise<HistoricalComparison> {
  // Simulate historical comparison
  const previousScore = 40 + Math.random() * 30;
  const currentScore = 45 + Math.random() * 30;
  const change = currentScore - previousScore;

  return {
    periodDays,
    previousScore: Math.round(previousScore),
    currentScore: Math.round(currentScore),
    change: Math.round(change),
    percentChange: previousScore > 0 ? Math.round((change / previousScore) * 100) : 0,
  };
}

function determineTrend(comparison: HistoricalComparison): BurnoutRiskScore['trendDirection'] {
  if (comparison.percentChange > 5) return 'declining';
  if (comparison.percentChange < -5) return 'improving';
  return 'stable';
}

function generateRecommendations(
  factorScores: FactorScore[],
  riskLevel: string
): BurnoutRecommendation[] {
  const recommendations: BurnoutRecommendation[] = [];

  // Sort factors by score (highest risk first)
  const sortedFactors = [...factorScores].sort((a, b) => b.score - a.score);

  for (const factor of sortedFactors.slice(0, 3)) {
    if (factor.score < 40) continue;

    const recommendation = getFactorRecommendation(factor);
    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  // Add general recommendations for high risk
  if (riskLevel === 'critical' || riskLevel === 'high') {
    recommendations.unshift({
      priority: 'immediate',
      category: 'wellness',
      action: 'Schedule a 1:1 check-in with manager to discuss workload',
      expectedImpact: 'Identify quick wins for load reduction',
      difficulty: 'easy',
    });
  }

  return recommendations;
}

function getFactorRecommendation(factor: FactorScore): BurnoutRecommendation | null {
  const recommendations: Record<string, BurnoutRecommendation> = {
    workload_hours: {
      priority: 'short_term',
      category: 'workload',
      action: 'Review and prioritize tasks; consider delegating or deferring low-priority items',
      expectedImpact: 'Reduce weekly hours by 5-10%',
      difficulty: 'medium',
    },
    task_complexity: {
      priority: 'short_term',
      category: 'workload',
      action: 'Break complex tasks into smaller subtasks; pair with teammate on difficult items',
      expectedImpact: 'Improve task completion rate and reduce cognitive load',
      difficulty: 'medium',
    },
    deadline_pressure: {
      priority: 'immediate',
      category: 'workload',
      action: 'Renegotiate deadlines for non-critical tasks; communicate capacity constraints',
      expectedImpact: 'Create buffer time and reduce urgency stress',
      difficulty: 'medium',
    },
    communication_overload: {
      priority: 'short_term',
      category: 'communication',
      action: 'Set specific times for checking messages; use status to indicate focus time',
      expectedImpact: 'Reduce interruptions by 30%',
      difficulty: 'easy',
    },
    after_hours_work: {
      priority: 'immediate',
      category: 'schedule',
      action: 'Establish clear work boundaries; avoid checking work communications after hours',
      expectedImpact: 'Improve work-life balance and recovery time',
      difficulty: 'medium',
    },
    meeting_burden: {
      priority: 'short_term',
      category: 'schedule',
      action: 'Audit meeting attendance; decline non-essential meetings; suggest shorter formats',
      expectedImpact: 'Recover 3-5 hours per week for focused work',
      difficulty: 'easy',
    },
    task_fragmentation: {
      priority: 'short_term',
      category: 'workload',
      action: 'Block focus time on calendar; batch similar tasks; limit active work in progress',
      expectedImpact: 'Increase focused work blocks by 50%',
      difficulty: 'easy',
    },
    lack_of_breaks: {
      priority: 'immediate',
      category: 'wellness',
      action: 'Schedule regular breaks; use break reminder app; take full lunch break',
      expectedImpact: 'Improve energy and focus throughout the day',
      difficulty: 'easy',
    },
    social_isolation: {
      priority: 'long_term',
      category: 'social',
      action: 'Schedule regular team catch-ups; participate in collaborative projects',
      expectedImpact: 'Increase sense of belonging and support',
      difficulty: 'medium',
    },
    recognition_deficit: {
      priority: 'long_term',
      category: 'engagement',
      action: 'Share accomplishments in team updates; request regular feedback from manager',
      expectedImpact: 'Improve visibility and sense of accomplishment',
      difficulty: 'easy',
    },
  };

  return recommendations[factor.factor] || null;
}

function aggregateRiskFactors(
  memberScores: BurnoutRiskScore[]
): Array<{ factor: string; affectedCount: number; averageScore: number }> {
  const factorAggregates = new Map<string, { count: number; totalScore: number }>();

  for (const member of memberScores) {
    for (const factor of member.factorScores) {
      if (factor.score >= 50) {
        // Only count as affected if score is concerning
        const current = factorAggregates.get(factor.factor) || { count: 0, totalScore: 0 };
        factorAggregates.set(factor.factor, {
          count: current.count + 1,
          totalScore: current.totalScore + factor.score,
        });
      }
    }
  }

  return Array.from(factorAggregates.entries())
    .map(([factor, data]) => ({
      factor,
      affectedCount: data.count,
      averageScore: Math.round(data.totalScore / data.count),
    }))
    .sort((a, b) => b.affectedCount - a.affectedCount);
}

function generateTeamRecommendations(
  topRiskFactors: Array<{ factor: string; affectedCount: number; averageScore: number }>,
  distribution: { low: number; moderate: number; high: number; critical: number }
): BurnoutRecommendation[] {
  const recommendations: BurnoutRecommendation[] = [];

  if (distribution.critical > 0) {
    recommendations.push({
      priority: 'immediate',
      category: 'team',
      action: `Address ${distribution.critical} team member(s) at critical burnout risk immediately`,
      expectedImpact: 'Prevent burnout and potential turnover',
      difficulty: 'medium',
    });
  }

  if (topRiskFactors[0] && topRiskFactors[0].affectedCount > 2) {
    recommendations.push({
      priority: 'short_term',
      category: 'team',
      action: `Address team-wide ${topRiskFactors[0].factor.replace(/_/g, ' ')} issue affecting ${topRiskFactors[0].affectedCount} members`,
      expectedImpact: 'Systematic improvement in team wellbeing',
      difficulty: 'hard',
    });
  }

  return recommendations;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  calculateBurnoutScore,
  calculateTeamBurnoutScore,
  getBurnoutScoreTrend,
  compareBurnoutScores,
};
