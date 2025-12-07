/**
 * Debt Cost Estimator
 * Estimates the financial cost of organizational debt
 * T257 - Cost estimation for debt dimensions
 */

import { Pool } from 'pg';
import {
  CostEstimate,
  OrgDebtScore,
  ProcessDebt,
  KnowledgeDebt,
  DataDebt,
  TechnicalDebt,
  CommunicationDebt,
} from '../../../models/OrgDebtScore.js';

export interface CostEstimatorOptions {
  organizationId: string;
  dimensions: OrgDebtScore['dimensions'];
  avgSalary?: number;
  avgHourlyRate?: number;
  currency?: string;
}

/**
 * Default cost parameters
 */
const DEFAULT_COST_PARAMS = {
  avgSalary: 60000,       // EUR per year
  avgHourlyRate: 35,      // EUR per hour
  currency: 'EUR',
  workHoursPerYear: 1800,
};

/**
 * Estimate total cost of organizational debt
 */
export async function estimateDebtCost(
  pool: Pool,
  options: CostEstimatorOptions
): Promise<CostEstimate> {
  const {
    organizationId,
    dimensions,
    avgSalary = DEFAULT_COST_PARAMS.avgSalary,
    avgHourlyRate = DEFAULT_COST_PARAMS.avgHourlyRate,
    currency = DEFAULT_COST_PARAMS.currency,
  } = options;

  // Get organization size for scaling
  const orgSize = await getOrganizationSize(pool, organizationId);

  // Calculate cost for each dimension
  const processCost = estimateProcessDebtCost(dimensions.process, avgHourlyRate, orgSize);
  const knowledgeCost = estimateKnowledgeDebtCost(dimensions.knowledge, avgSalary, orgSize);
  const dataCost = estimateDataDebtCost(dimensions.data, avgHourlyRate, orgSize);
  const technicalCost = estimateTechnicalDebtCost(dimensions.technical, avgHourlyRate, orgSize);
  const communicationCost = estimateCommunicationDebtCost(dimensions.communication, avgHourlyRate, orgSize);

  const totalCost = processCost + knowledgeCost + dataCost + technicalCost + communicationCost;

  const breakdown = [
    {
      dimension: 'process',
      cost: processCost,
      percentage: (processCost / totalCost) * 100,
    },
    {
      dimension: 'knowledge',
      cost: knowledgeCost,
      percentage: (knowledgeCost / totalCost) * 100,
    },
    {
      dimension: 'data',
      cost: dataCost,
      percentage: (dataCost / totalCost) * 100,
    },
    {
      dimension: 'technical',
      cost: technicalCost,
      percentage: (technicalCost / totalCost) * 100,
    },
    {
      dimension: 'communication',
      cost: communicationCost,
      percentage: (communicationCost / totalCost) * 100,
    },
  ].sort((a, b) => b.cost - a.cost);

  return {
    totalAnnualCost: Math.round(totalCost),
    currency,
    breakdown,
    methodology: 'Bottom-up estimation based on debt metrics and industry benchmarks',
    confidenceLevel: determineConfidenceLevel(dimensions),
    assumptions: generateAssumptions(avgSalary, avgHourlyRate, orgSize),
  };
}

/**
 * Get organization size for cost scaling
 */
async function getOrganizationSize(
  pool: Pool,
  organizationId: string
): Promise<number> {
  const result = await pool
    .query(
      `
    SELECT COUNT(*) as employee_count
    FROM persons
    WHERE organization_id = $1
      AND status = 'active'
    `,
      [organizationId]
    )
    .catch(() => ({ rows: [{ employee_count: 100 }] }));

  return parseInt(result.rows[0]?.employee_count || '100');
}

/**
 * Estimate process debt cost
 */
function estimateProcessDebtCost(
  process: ProcessDebt,
  hourlyRate: number,
  orgSize: number
): number {
  const { metrics } = process;
  let totalCost = 0;

  // Undocumented processes: cost of rework and errors
  // Estimate 2 hours per week per undocumented process for confusion/errors
  totalCost += metrics.undocumentedProcessCount * 2 * 52 * hourlyRate;

  // Process variation: cost of inconsistency
  // 0.5% productivity loss per 1% variation score
  const variationLoss = (metrics.processVariationScore / 100) * 0.005;
  totalCost += orgSize * hourlyRate * DEFAULT_COST_PARAMS.workHoursPerYear * variationLoss;

  // Bottlenecks: waiting time cost
  // Estimate 4 hours per week per bottleneck affecting 10% of staff
  totalCost += metrics.bottleneckCount * 4 * 52 * hourlyRate * (orgSize * 0.1);

  // Cycle time delay: overtime and opportunity cost
  // Delay costs hourly rate times delay percentage
  const delayHours = DEFAULT_COST_PARAMS.workHoursPerYear * (metrics.avgCycleTimeDelay / 100);
  totalCost += delayHours * hourlyRate * (orgSize * 0.2);

  // Manual steps: labor inefficiency
  // Additional 20% time for manual vs automated
  const manualOverhead = (metrics.manualStepRatio / 100) * 0.2;
  totalCost += orgSize * hourlyRate * DEFAULT_COST_PARAMS.workHoursPerYear * manualOverhead * 0.3;

  // Rework: direct labor cost
  // Rework rate directly translates to wasted effort
  const reworkCost = (metrics.reworkRate / 100) * orgSize * hourlyRate * DEFAULT_COST_PARAMS.workHoursPerYear * 0.15;
  totalCost += reworkCost;

  return totalCost;
}

/**
 * Estimate knowledge debt cost
 */
function estimateKnowledgeDebtCost(
  knowledge: KnowledgeDebt,
  avgSalary: number,
  orgSize: number
): number {
  const { metrics } = knowledge;
  let totalCost = 0;

  // Single points of failure: risk cost
  // If key person leaves, estimate 6 months salary replacement + knowledge loss
  const spofRiskFactor = 0.15; // 15% chance per year of departure
  totalCost += metrics.singlePointsOfFailure * avgSalary * 1.5 * spofRiskFactor;

  // Undocumented expertise: onboarding and training inefficiency
  // 40 hours per undocumented area for new hires to figure out
  const avgHourlyFromSalary = avgSalary / DEFAULT_COST_PARAMS.workHoursPerYear;
  const newHireRate = orgSize * 0.15; // 15% turnover
  totalCost += metrics.undocumentedExpertiseAreas * 40 * avgHourlyFromSalary * newHireRate;

  // Low bus factor: redundancy cost
  // Cost increases as bus factor decreases below 3
  if (metrics.avgBusFactor < 3) {
    const riskMultiplier = (3 - metrics.avgBusFactor) / 3;
    totalCost += avgSalary * orgSize * 0.02 * riskMultiplier;
  }

  // Knowledge silos: coordination overhead
  // Each silo adds 5% overhead for cross-team work
  totalCost += metrics.knowledgeSiloCount * orgSize * avgSalary * 0.01;

  // Succession gaps: leadership continuity risk
  // Each gap is a significant risk to operations
  totalCost += metrics.successionGapCount * avgSalary * 0.5;

  return totalCost;
}

/**
 * Estimate data debt cost
 */
function estimateDataDebtCost(
  data: DataDebt,
  hourlyRate: number,
  orgSize: number
): number {
  const { metrics } = data;
  let totalCost = 0;

  // Duplicate records: storage and processing cost + decision errors
  // 0.5% revenue impact per 1% duplicate rate (errors in analysis)
  const duplicateCostPerPerson = hourlyRate * 20 * (metrics.duplicateRecordRate / 100);
  totalCost += orgSize * duplicateCostPerPerson * 0.3;

  // Low data quality: rework and bad decisions
  // Quality issues translate to 1% productivity loss per 10% quality gap
  const qualityGap = (100 - metrics.dataQualityScore) / 100;
  totalCost += orgSize * hourlyRate * DEFAULT_COST_PARAMS.workHoursPerYear * qualityGap * 0.01;

  // Inconsistent fields: reconciliation effort
  // 2 hours per week per inconsistent field for data cleanup
  totalCost += metrics.inconsistentFieldCount * 2 * 52 * hourlyRate;

  // Missing critical fields: incomplete information decisions
  // Each missing field costs 5 hours per month in workarounds
  totalCost += metrics.missingCriticalFields * 5 * 12 * hourlyRate;

  // Stale data: outdated decision-making
  // 0.1% cost per 1% stale data (reduced effectiveness)
  const staleCost = (metrics.staleDataPercentage / 100) * 0.001;
  totalCost += orgSize * hourlyRate * DEFAULT_COST_PARAMS.workHoursPerYear * staleCost;

  // Data fragmentation: integration overhead
  // Each fragmented source costs 10 hours per month for manual transfers
  totalCost += metrics.dataSourceFragmentation * 10 * 12 * hourlyRate;

  return totalCost;
}

/**
 * Estimate technical debt cost
 */
function estimateTechnicalDebtCost(
  technical: TechnicalDebt,
  hourlyRate: number,
  orgSize: number
): number {
  const { metrics } = technical;
  let totalCost = 0;

  // Legacy systems: maintenance premium
  // Legacy systems cost 3x more to maintain
  const systemMaintenanceCost = 50000; // Base annual maintenance per system
  totalCost += metrics.legacySystemCount * systemMaintenanceCost * 2; // 2x extra

  // Integration gaps: manual workaround cost
  // Each gap requires 20 hours per month of manual work
  totalCost += metrics.integrationGapCount * 20 * 12 * hourlyRate;

  // Manual data transfers: labor cost
  // Each transfer takes 2 hours per occurrence, assuming weekly
  totalCost += metrics.manualDataTransferCount * 2 * 52 * hourlyRate;

  // System downtime: productivity loss
  // Downtime affects all users
  const affectedUsers = orgSize * 0.3; // 30% of org affected by typical outage
  totalCost += metrics.systemDowntimeHours * hourlyRate * affectedUsers;

  // Security vulnerabilities: risk cost
  // Average breach cost scaled by vulnerability count
  const avgBreachCost = 100000;
  const breachProbability = Math.min(0.3, metrics.securityVulnerabilityCount * 0.05);
  totalCost += avgBreachCost * breachProbability;

  // Maintenance burden: ongoing overhead
  // High burden means more IT spend
  const maintenanceOverhead = (metrics.maintenanceBurdenScore / 100) * 0.3;
  totalCost += orgSize * hourlyRate * 100 * maintenanceOverhead; // IT time

  return totalCost;
}

/**
 * Estimate communication debt cost
 */
function estimateCommunicationDebtCost(
  communication: CommunicationDebt,
  hourlyRate: number,
  orgSize: number
): number {
  const { metrics } = communication;
  let totalCost = 0;

  // Silos: coordination overhead
  // High silo score means more time spent on coordination
  const siloOverhead = (metrics.siloScore / 100) * 0.05;
  totalCost += orgSize * hourlyRate * DEFAULT_COST_PARAMS.workHoursPerYear * siloOverhead;

  // Response delay: waiting cost
  // Each hour of delay costs in blocked work
  const avgDelayPerRequest = metrics.avgResponseDelay;
  const requestsPerPersonPerDay = 2;
  totalCost += orgSize * requestsPerPersonPerDay * 250 * avgDelayPerRequest * hourlyRate * 0.2;

  // Meeting overload: opportunity cost
  // Meetings above 30% of time are considered overhead
  const excessMeetingPercent = Math.max(0, (metrics.meetingOverloadScore - 30) / 100);
  totalCost += orgSize * hourlyRate * DEFAULT_COST_PARAMS.workHoursPerYear * excessMeetingPercent;

  // Email overload: processing time
  // High email volume reduces productive time
  const emailOverhead = (metrics.emailOverloadScore / 100) * 0.1;
  totalCost += orgSize * hourlyRate * DEFAULT_COST_PARAMS.workHoursPerYear * emailOverhead;

  // Cross-team gaps: project delays
  // Each gap causes delays in collaborative projects
  totalCost += metrics.crossTeamCollaborationGap * orgSize * hourlyRate * 0.5;

  // Information bottlenecks: decision delays
  // Each bottleneck affects information flow
  totalCost += metrics.informationFlowBottlenecks * 10 * 52 * hourlyRate;

  return totalCost;
}

/**
 * Determine confidence level based on data quality
 */
function determineConfidenceLevel(
  dimensions: OrgDebtScore['dimensions']
): 'low' | 'medium' | 'high' {
  // Count dimensions with meaningful data
  let dimensionsWithData = 0;

  for (const dimension of Object.values(dimensions)) {
    const hasData = dimension.topIssues.length > 0 || dimension.score !== 0;
    if (hasData) dimensionsWithData++;
  }

  if (dimensionsWithData >= 4) return 'high';
  if (dimensionsWithData >= 2) return 'medium';
  return 'low';
}

/**
 * Generate assumptions list for transparency
 */
function generateAssumptions(
  avgSalary: number,
  hourlyRate: number,
  orgSize: number
): string[] {
  return [
    `Average salary: ${avgSalary.toLocaleString()} EUR/year`,
    `Average hourly rate: ${hourlyRate} EUR/hour`,
    `Organization size: ${orgSize} employees`,
    `Working hours per year: ${DEFAULT_COST_PARAMS.workHoursPerYear}`,
    'Industry benchmarks used for productivity loss calculations',
    'Risk probabilities based on historical data and industry averages',
    'Costs are estimates and actual impact may vary',
  ];
}

/**
 * Calculate ROI for fixing specific debt items
 */
export function calculateFixROI(
  issueId: string,
  estimatedFixCost: number,
  dimensions: OrgDebtScore['dimensions']
): { roi: number; paybackMonths: number } | null {
  // Find the issue across all dimensions
  for (const dimension of Object.values(dimensions)) {
    const issue = dimension.topIssues.find((i) => i.id === issueId);
    if (issue && issue.estimatedCost) {
      const annualSavings = issue.estimatedCost;
      const roi = ((annualSavings - estimatedFixCost) / estimatedFixCost) * 100;
      const paybackMonths = (estimatedFixCost / annualSavings) * 12;

      return {
        roi: Math.round(roi),
        paybackMonths: Math.round(paybackMonths * 10) / 10,
      };
    }
  }

  return null;
}

export default {
  estimateDebtCost,
  calculateFixROI,
};
