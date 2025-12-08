/**
 * Seasonal Pattern Detector
 * T209 - Detect and analyze seasonal workload patterns
 *
 * Identifies recurring patterns in workload data
 */

// =============================================================================
// Types
// =============================================================================

export interface SeasonalPattern {
  type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  strength: number; // 0-100, how strong the pattern is
  peaks: PatternPeak[];
  troughs: PatternTrough[];
  description: string;
}

export interface PatternPeak {
  period: string; // e.g., "Monday", "Q4", "December"
  averageIncrease: number; // percentage above baseline
  confidence: number;
  factors: string[];
}

export interface PatternTrough {
  period: string;
  averageDecrease: number;
  confidence: number;
  factors: string[];
}

export interface SeasonalAnalysis {
  personId?: string;
  teamId?: string;
  analyzedPeriod: {
    startDate: Date;
    endDate: Date;
  };
  patterns: SeasonalPattern[];
  recommendations: SeasonalRecommendation[];
  dataQuality: {
    score: number;
    issues: string[];
  };
}

export interface SeasonalRecommendation {
  type: 'capacity_planning' | 'scheduling' | 'staffing' | 'process';
  priority: 'high' | 'medium' | 'low';
  description: string;
  timing: string;
  expectedImpact: string;
}

export interface WorkloadDataPoint {
  date: Date;
  load: number;
  hours: number;
  taskCount: number;
}

// =============================================================================
// Seasonal Pattern Detector
// =============================================================================

/**
 * Analyze seasonal patterns for a person
 */
export async function analyzeSeasonalPatterns(
  personId: string,
  options: {
    historyMonths?: number;
  } = {}
): Promise<SeasonalAnalysis> {
  const { historyMonths = 12 } = options;

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - historyMonths * 30 * 24 * 60 * 60 * 1000);

  // Get historical data (simulated)
  const data = await getHistoricalData(personId, startDate, endDate);

  // Analyze different pattern types
  const patterns: SeasonalPattern[] = [];

  const weeklyPattern = detectWeeklyPattern(data);
  if (weeklyPattern.strength > 30) {
    patterns.push(weeklyPattern);
  }

  const monthlyPattern = detectMonthlyPattern(data);
  if (monthlyPattern.strength > 30) {
    patterns.push(monthlyPattern);
  }

  if (historyMonths >= 12) {
    const yearlyPattern = detectYearlyPattern(data);
    if (yearlyPattern.strength > 30) {
      patterns.push(yearlyPattern);
    }
  }

  // Generate recommendations
  const recommendations = generateSeasonalRecommendations(patterns);

  // Assess data quality
  const dataQuality = assessDataQuality(data, historyMonths);

  return {
    personId,
    analyzedPeriod: { startDate, endDate },
    patterns,
    recommendations,
    dataQuality,
  };
}

/**
 * Analyze seasonal patterns for a team
 */
export async function analyzeTeamSeasonalPatterns(
  teamId: string,
  options: {
    historyMonths?: number;
  } = {}
): Promise<SeasonalAnalysis> {
  const { historyMonths = 12 } = options;

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - historyMonths * 30 * 24 * 60 * 60 * 1000);

  // Get aggregated team data (simulated)
  const data = await getHistoricalData(teamId, startDate, endDate, true);

  const patterns: SeasonalPattern[] = [];

  const weeklyPattern = detectWeeklyPattern(data);
  if (weeklyPattern.strength > 30) {
    patterns.push(weeklyPattern);
  }

  const monthlyPattern = detectMonthlyPattern(data);
  if (monthlyPattern.strength > 30) {
    patterns.push(monthlyPattern);
  }

  if (historyMonths >= 12) {
    const yearlyPattern = detectYearlyPattern(data);
    if (yearlyPattern.strength > 30) {
      patterns.push(yearlyPattern);
    }
  }

  const recommendations = generateSeasonalRecommendations(patterns);
  const dataQuality = assessDataQuality(data, historyMonths);

  return {
    teamId,
    analyzedPeriod: { startDate, endDate },
    patterns,
    recommendations,
    dataQuality,
  };
}

/**
 * Get expected workload for a specific date based on patterns
 */
export function getExpectedWorkload(
  patterns: SeasonalPattern[],
  date: Date
): {
  expectedLoad: number;
  factors: Array<{ pattern: string; effect: number }>;
} {
  let expectedLoad = 75; // Baseline
  const factors: Array<{ pattern: string; effect: number }> = [];

  for (const pattern of patterns) {
    const effect = calculatePatternEffect(pattern, date);
    expectedLoad += effect;
    factors.push({ pattern: pattern.type, effect });
  }

  return {
    expectedLoad: Math.max(0, Math.min(150, expectedLoad)),
    factors,
  };
}

// =============================================================================
// Pattern Detection
// =============================================================================

async function getHistoricalData(
  id: string,
  startDate: Date,
  endDate: Date,
  _isTeam: boolean = false
): Promise<WorkloadDataPoint[]> {
  // In production, query actual historical data
  const data: WorkloadDataPoint[] = [];
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  for (let d = 0; d < days; d++) {
    const date = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    const dayOfWeek = date.getDay();
    const month = date.getMonth();

    // Create realistic patterns
    let baseLoad = 70;

    // Weekly pattern (lower on weekends)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      baseLoad *= 0.2;
    } else if (dayOfWeek === 1) {
      baseLoad *= 1.1; // Monday spike
    } else if (dayOfWeek === 5) {
      baseLoad *= 0.9; // Friday dip
    }

    // Monthly pattern (end of month spike)
    const dayOfMonth = date.getDate();
    if (dayOfMonth > 25) {
      baseLoad *= 1.15;
    }

    // Yearly pattern (Q4 busy, summer slow)
    if (month >= 9 && month <= 11) {
      baseLoad *= 1.2; // Q4
    } else if (month >= 5 && month <= 7) {
      baseLoad *= 0.85; // Summer
    }

    // Add randomness
    baseLoad *= 0.85 + Math.random() * 0.3;

    data.push({
      date,
      load: Math.round(baseLoad),
      hours: Math.round((baseLoad / 100) * 8 * 10) / 10,
      taskCount: Math.floor(baseLoad / 10),
    });
  }

  return data;
}

function detectWeeklyPattern(data: WorkloadDataPoint[]): SeasonalPattern {
  const dayAverages = new Array(7).fill(0);
  const dayCounts = new Array(7).fill(0);

  for (const point of data) {
    const day = point.date.getDay();
    dayAverages[day] += point.load;
    dayCounts[day]++;
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const normalizedAverages = dayAverages.map((sum, i) => dayCounts[i] > 0 ? sum / dayCounts[i] : 0);
  const overallAverage = normalizedAverages.reduce((a, b) => a + b, 0) / 7;

  const peaks: PatternPeak[] = [];
  const troughs: PatternTrough[] = [];

  normalizedAverages.forEach((avg, i) => {
    const deviation = ((avg - overallAverage) / overallAverage) * 100;

    if (deviation > 10) {
      peaks.push({
        period: dayNames[i],
        averageIncrease: Math.round(deviation),
        confidence: Math.min(90, 50 + dayCounts[i]),
        factors: i === 1 ? ['Start of week catchup'] : ['Regular work pattern'],
      });
    } else if (deviation < -10) {
      troughs.push({
        period: dayNames[i],
        averageDecrease: Math.round(Math.abs(deviation)),
        confidence: Math.min(90, 50 + dayCounts[i]),
        factors: i === 0 || i === 6 ? ['Weekend'] : ['End of week wind-down'],
      });
    }
  });

  // Calculate pattern strength based on variance
  const variance = normalizedAverages.reduce((sum, avg) => sum + Math.pow(avg - overallAverage, 2), 0) / 7;
  const strength = Math.min(100, Math.sqrt(variance) * 3);

  return {
    type: 'weekly',
    strength: Math.round(strength),
    peaks,
    troughs,
    description: `Workload varies throughout the week with ${peaks.length} peak period(s)`,
  };
}

function detectMonthlyPattern(data: WorkloadDataPoint[]): SeasonalPattern {
  // Group by week of month (1-4)
  const weekAverages = new Array(4).fill(0);
  const weekCounts = new Array(4).fill(0);

  for (const point of data) {
    const weekOfMonth = Math.min(3, Math.floor((point.date.getDate() - 1) / 7));
    weekAverages[weekOfMonth] += point.load;
    weekCounts[weekOfMonth]++;
  }

  const weekNames = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  const normalizedAverages = weekAverages.map((sum, i) => weekCounts[i] > 0 ? sum / weekCounts[i] : 0);
  const overallAverage = normalizedAverages.reduce((a, b) => a + b, 0) / 4;

  const peaks: PatternPeak[] = [];
  const troughs: PatternTrough[] = [];

  normalizedAverages.forEach((avg, i) => {
    const deviation = ((avg - overallAverage) / overallAverage) * 100;

    if (deviation > 5) {
      peaks.push({
        period: weekNames[i],
        averageIncrease: Math.round(deviation),
        confidence: Math.min(90, 50 + weekCounts[i] / 2),
        factors: i === 3 ? ['End of month deadlines'] : ['Regular pattern'],
      });
    } else if (deviation < -5) {
      troughs.push({
        period: weekNames[i],
        averageDecrease: Math.round(Math.abs(deviation)),
        confidence: Math.min(90, 50 + weekCounts[i] / 2),
        factors: ['Post-deadline cooldown'],
      });
    }
  });

  const variance = normalizedAverages.reduce((sum, avg) => sum + Math.pow(avg - overallAverage, 2), 0) / 4;
  const strength = Math.min(100, Math.sqrt(variance) * 4);

  return {
    type: 'monthly',
    strength: Math.round(strength),
    peaks,
    troughs,
    description: `Workload varies by week of month with ${peaks.length} peak period(s)`,
  };
}

function detectYearlyPattern(data: WorkloadDataPoint[]): SeasonalPattern {
  const monthAverages = new Array(12).fill(0);
  const monthCounts = new Array(12).fill(0);

  for (const point of data) {
    const month = point.date.getMonth();
    monthAverages[month] += point.load;
    monthCounts[month]++;
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const normalizedAverages = monthAverages.map((sum, i) => monthCounts[i] > 0 ? sum / monthCounts[i] : 0);
  const validAverages = normalizedAverages.filter((a) => a > 0);
  const overallAverage = validAverages.length > 0 ? validAverages.reduce((a, b) => a + b, 0) / validAverages.length : 0;

  const peaks: PatternPeak[] = [];
  const troughs: PatternTrough[] = [];

  normalizedAverages.forEach((avg, i) => {
    if (avg === 0) return;

    const deviation = ((avg - overallAverage) / overallAverage) * 100;

    if (deviation > 10) {
      peaks.push({
        period: monthNames[i],
        averageIncrease: Math.round(deviation),
        confidence: Math.min(90, 50 + monthCounts[i] * 2),
        factors: getMonthFactors(i, true),
      });
    } else if (deviation < -10) {
      troughs.push({
        period: monthNames[i],
        averageDecrease: Math.round(Math.abs(deviation)),
        confidence: Math.min(90, 50 + monthCounts[i] * 2),
        factors: getMonthFactors(i, false),
      });
    }
  });

  const variance = validAverages.reduce((sum, avg) => sum + Math.pow(avg - overallAverage, 2), 0) / validAverages.length;
  const strength = Math.min(100, Math.sqrt(variance) * 2);

  return {
    type: 'yearly',
    strength: Math.round(strength),
    peaks,
    troughs,
    description: `Workload varies seasonally with ${peaks.length} peak month(s)`,
  };
}

function getMonthFactors(month: number, isPeak: boolean): string[] {
  const factors: string[] = [];

  if (isPeak) {
    if (month >= 9 && month <= 11) factors.push('Q4 business cycle');
    if (month === 0) factors.push('New year initiatives');
    if (month === 2) factors.push('End of Q1');
    if (month === 11) factors.push('Year-end deadlines');
  } else {
    if (month >= 5 && month <= 7) factors.push('Summer slowdown');
    if (month === 11) factors.push('Holiday season');
    if (month === 0) factors.push('Post-holiday recovery');
  }

  if (factors.length === 0) {
    factors.push('Historical pattern');
  }

  return factors;
}

function calculatePatternEffect(pattern: SeasonalPattern, date: Date): number {
  let effect = 0;

  switch (pattern.type) {
    case 'weekly': {
      const dayOfWeek = date.getDay();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const peak = pattern.peaks.find((p) => p.period === dayNames[dayOfWeek]);
      const trough = pattern.troughs.find((t) => t.period === dayNames[dayOfWeek]);
      if (peak) effect = peak.averageIncrease;
      if (trough) effect = -trough.averageDecrease;
      break;
    }
    case 'monthly': {
      const weekOfMonth = Math.min(3, Math.floor((date.getDate() - 1) / 7));
      const weekName = `Week ${weekOfMonth + 1}`;
      const peak = pattern.peaks.find((p) => p.period === weekName);
      const trough = pattern.troughs.find((t) => t.period === weekName);
      if (peak) effect = peak.averageIncrease;
      if (trough) effect = -trough.averageDecrease;
      break;
    }
    case 'yearly': {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthName = monthNames[date.getMonth()];
      const peak = pattern.peaks.find((p) => p.period === monthName);
      const trough = pattern.troughs.find((t) => t.period === monthName);
      if (peak) effect = peak.averageIncrease;
      if (trough) effect = -trough.averageDecrease;
      break;
    }
  }

  // Scale effect by pattern strength
  return (effect * pattern.strength) / 100;
}

function generateSeasonalRecommendations(patterns: SeasonalPattern[]): SeasonalRecommendation[] {
  const recommendations: SeasonalRecommendation[] = [];

  for (const pattern of patterns) {
    if (pattern.peaks.length > 0) {
      const topPeak = pattern.peaks[0];
      recommendations.push({
        type: 'capacity_planning',
        priority: topPeak.averageIncrease > 20 ? 'high' : 'medium',
        description: `Plan additional capacity for ${topPeak.period} when workload typically increases ${topPeak.averageIncrease}%`,
        timing: `Before ${topPeak.period}`,
        expectedImpact: 'Better workload management during peak periods',
      });
    }

    if (pattern.troughs.length > 0) {
      const topTrough = pattern.troughs[0];
      recommendations.push({
        type: 'scheduling',
        priority: 'medium',
        description: `Schedule non-urgent work, training, or projects for ${topTrough.period}`,
        timing: topTrough.period,
        expectedImpact: 'Maximize productivity during lower-demand periods',
      });
    }
  }

  return recommendations;
}

function assessDataQuality(
  data: WorkloadDataPoint[],
  expectedMonths: number
): SeasonalAnalysis['dataQuality'] {
  const issues: string[] = [];
  let score = 100;

  const expectedDays = expectedMonths * 30;
  const coverage = data.length / expectedDays;

  if (coverage < 0.8) {
    score -= 20;
    issues.push(`Only ${Math.round(coverage * 100)}% data coverage`);
  }

  // Check for gaps
  const gaps = findDataGaps(data);
  if (gaps > 5) {
    score -= 10;
    issues.push(`${gaps} significant data gaps detected`);
  }

  if (expectedMonths < 12) {
    score -= 10;
    issues.push('Less than 12 months of data for yearly patterns');
  }

  return { score: Math.max(0, score), issues };
}

function findDataGaps(data: WorkloadDataPoint[]): number {
  let gaps = 0;
  for (let i = 1; i < data.length; i++) {
    const dayDiff = (data[i].date.getTime() - data[i - 1].date.getTime()) / (24 * 60 * 60 * 1000);
    if (dayDiff > 3) gaps++;
  }
  return gaps;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  analyzeSeasonalPatterns,
  analyzeTeamSeasonalPatterns,
  getExpectedWorkload,
};
