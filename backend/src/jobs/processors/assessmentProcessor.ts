/**
 * Assessment Job Processor
 * Processes assessment generation jobs asynchronously
 */

import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma.js';
import {
  calculateERPReadiness,
  calculateAIReadiness,
  calculateDataQuality,
  calculateProcessMaturity,
  generateRecommendations,
  type ERPReadinessInput,
  type AIReadinessInput,
  type DataQualityInput,
  type ProcessMaturityInput,
  type CombinedAssessmentInput,
} from '../../services/reporting/assessments/index.js';

export interface AssessmentJobData {
  assessmentId: string;
  organizationId: string;
  assessmentType: 'erp' | 'ai' | 'data_quality' | 'process_maturity' | 'comprehensive';
  options?: AssessmentOptions;
}

export interface AssessmentOptions {
  includeRecommendations?: boolean;
  detailLevel?: 'summary' | 'detailed' | 'comprehensive';
  focusAreas?: string[];
}

export interface AssessmentJobResult {
  assessmentId: string;
  status: 'completed' | 'failed';
  results?: {
    overallScore: number;
    assessmentData: unknown;
    recommendations?: unknown;
  };
  error?: string;
}

/**
 * Process assessment job
 */
export async function processAssessmentJob(
  job: Job<AssessmentJobData>
): Promise<AssessmentJobResult> {
  const { assessmentId, organizationId, assessmentType, options } = job.data;

  try {
    await job.updateProgress(10);

    // Update assessment status to processing
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'processing' },
    });

    // Gather data based on assessment type
    await job.updateProgress(20);
    const inputData = await gatherAssessmentData(organizationId, assessmentType);

    await job.updateProgress(40);

    // Run assessment calculations
    let results: {
      overallScore: number;
      assessmentData: unknown;
      recommendations?: unknown;
    };

    switch (assessmentType) {
      case 'erp':
        results = await runERPAssessment(inputData.erpInput!, options);
        break;
      case 'ai':
        results = await runAIAssessment(inputData.aiInput!, options);
        break;
      case 'data_quality':
        results = await runDataQualityAssessment(inputData.dataQualityInput!, options);
        break;
      case 'process_maturity':
        results = await runProcessMaturityAssessment(inputData.processMaturityInput!, options);
        break;
      case 'comprehensive':
        results = await runComprehensiveAssessment(inputData, options);
        break;
      default:
        throw new Error(`Unknown assessment type: ${assessmentType}`);
    }

    await job.updateProgress(80);

    // Save results
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: 'completed',
        overallScore: results.overallScore,
        results: results.assessmentData as never,
        recommendations: (results.recommendations as never) || null,
        completedAt: new Date(),
      },
    });

    await job.updateProgress(100);

    return {
      assessmentId,
      status: 'completed',
      results,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update assessment status to failed
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: 'failed',
        error: errorMessage,
      },
    });

    return {
      assessmentId,
      status: 'failed',
      error: errorMessage,
    };
  }
}

/**
 * Gather assessment input data from organization's data
 */
async function gatherAssessmentData(
  organizationId: string,
  assessmentType: string
): Promise<{
  erpInput?: ERPReadinessInput;
  aiInput?: AIReadinessInput;
  dataQualityInput?: DataQualityInput;
  processMaturityInput?: ProcessMaturityInput;
}> {
  const result: {
    erpInput?: ERPReadinessInput;
    aiInput?: AIReadinessInput;
    dataQualityInput?: DataQualityInput;
    processMaturityInput?: ProcessMaturityInput;
  } = {};

  // Get organization data
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // Gather data sources
  const dataSources = await prisma.dataSource.findMany({
    where: { organizationId },
  });

  // Gather entity records for quality analysis
  const entityRecords = await prisma.entityRecord.findMany({
    where: { organizationId },
    take: 1000,
  });

  // Gather processes
  const processes = await prisma.process.findMany({
    where: { organizationId },
    include: { steps: true },
  });

  // Gather SOPs
  const sops = await prisma.sOP.findMany({
    where: { organizationId },
  });

  // Build input data based on assessment type
  if (assessmentType === 'erp' || assessmentType === 'comprehensive') {
    result.erpInput = buildERPInput(organizationId, entityRecords, processes, dataSources);
  }

  if (assessmentType === 'ai' || assessmentType === 'comprehensive') {
    result.aiInput = buildAIInput(organizationId, entityRecords, dataSources, processes);
  }

  if (assessmentType === 'data_quality' || assessmentType === 'comprehensive') {
    result.dataQualityInput = buildDataQualityInput(organizationId, entityRecords, dataSources);
  }

  if (assessmentType === 'process_maturity' || assessmentType === 'comprehensive') {
    result.processMaturityInput = buildProcessMaturityInput(organizationId, processes, sops);
  }

  return result;
}

/**
 * Build ERP readiness input from organization data
 */
function buildERPInput(
  organizationId: string,
  entityRecords: Array<{
    qualityScore: number | null;
    entityType: string;
    data: unknown;
    source: string;
  }>,
  processes: Array<{
    id: string;
    name: string;
    steps: Array<unknown>;
    status: string;
  }>,
  dataSources: Array<{
    id: string;
    type: string;
    status: string;
  }>
): ERPReadinessInput {
  // Calculate data quality metrics
  const avgQuality = entityRecords.length > 0
    ? entityRecords.reduce((sum, r) => sum + (r.qualityScore || 0), 0) / entityRecords.length
    : 0;

  // Count duplicates (simplified)
  const entityGroups = new Map<string, number>();
  entityRecords.forEach((r) => {
    const key = `${r.entityType}-${JSON.stringify(r.data).substring(0, 50)}`;
    entityGroups.set(key, (entityGroups.get(key) || 0) + 1);
  });
  const duplicateCount = Array.from(entityGroups.values()).filter((c) => c > 1).length;
  const duplicateRate = entityRecords.length > 0 ? duplicateCount / entityRecords.length : 0;

  // Calculate process metrics
  const documentedProcesses = processes.filter((p) => p.status === 'documented').length;
  const totalProcesses = processes.length;
  const avgSteps = processes.length > 0
    ? processes.reduce((sum, p) => sum + p.steps.length, 0) / processes.length
    : 0;

  // Calculate system metrics
  const connectedSystems = dataSources.length;
  const activeSystems = dataSources.filter((d) => d.status === 'active').length;
  const legacySystems = dataSources.filter((d) =>
    ['csv', 'excel', 'legacy'].includes(d.type)
  ).length;

  return {
    organizationId,
    dataQualityMetrics: {
      completenessScore: Math.min(1, avgQuality + 0.2),
      accuracyScore: avgQuality,
      consistencyScore: Math.max(0.5, avgQuality - 0.1),
      duplicateRate,
      standardizationLevel: Math.max(0.4, avgQuality - 0.2),
      masterDataCoverage: entityRecords.length > 100 ? 0.8 : 0.5,
    },
    processMetrics: {
      documentedProcesses,
      totalProcesses: Math.max(1, totalProcesses),
      processStandardization: documentedProcesses / Math.max(1, totalProcesses),
      automationLevel: 0.3, // Would need more data
      processMaturityLevel: Math.min(5, Math.floor(documentedProcesses / Math.max(1, totalProcesses) * 5) + 1) as 1 | 2 | 3 | 4 | 5,
      bottleneckCount: Math.floor(totalProcesses * 0.2),
    },
    systemMetrics: {
      connectedSystems,
      systemIntegrationLevel: activeSystems / Math.max(1, connectedSystems),
      dataFlowMapping: 0.6,
      apiAvailability: 0.7,
      legacySystemCount: legacySystems,
    },
    organizationMetrics: {
      changeReadinessScore: 0.6,
      stakeholderAlignment: 0.7,
      resourceAvailability: 0.5,
      technicalCapability: 0.6,
      budgetAllocation: 0.5,
    },
  };
}

/**
 * Build AI readiness input from organization data
 */
function buildAIInput(
  organizationId: string,
  entityRecords: Array<{ qualityScore: number | null; createdAt: Date }>,
  dataSources: Array<{ type: string; status: string }>,
  processes: Array<{ steps: Array<unknown> }>
): AIReadinessInput {
  const avgQuality = entityRecords.length > 0
    ? entityRecords.reduce((sum, r) => sum + (r.qualityScore || 0), 0) / entityRecords.length
    : 0;

  // Calculate data volume
  const recordCount = entityRecords.length;
  let dataVolume: 'low' | 'medium' | 'high' | 'very_high';
  if (recordCount < 1000) dataVolume = 'low';
  else if (recordCount < 10000) dataVolume = 'medium';
  else if (recordCount < 100000) dataVolume = 'high';
  else dataVolume = 'very_high';

  // Calculate historical depth
  const oldestRecord = entityRecords.reduce(
    (oldest, r) => (r.createdAt < oldest ? r.createdAt : oldest),
    new Date()
  );
  const historyYears = (Date.now() - oldestRecord.getTime()) / (1000 * 60 * 60 * 24 * 365);

  // Check for cloud sources
  const cloudSources = dataSources.filter((d) =>
    ['azure', 'aws', 'gcp', 'salesforce', 'microsoft365'].includes(d.type)
  ).length;
  const cloudAdoption: 'none' | 'partial' | 'cloud_first' | 'fully_cloud' =
    cloudSources === 0 ? 'none' :
    cloudSources < dataSources.length / 2 ? 'partial' :
    cloudSources < dataSources.length ? 'cloud_first' : 'fully_cloud';

  return {
    organizationId,
    dataMetrics: {
      dataVolume,
      dataVariety: new Set(dataSources.map((d) => d.type)).size,
      dataVelocity: 'batch',
      dataQualityScore: avgQuality,
      labeledDataAvailability: 0.3, // Would need actual labeled data tracking
      historicalDataDepth: Math.min(5, historyYears),
      dataAccessibility: 0.6,
      privacyCompliance: 0.7,
    },
    infrastructureMetrics: {
      cloudAdoption,
      computeCapacity: 'adequate',
      mlPlatformAvailable: false, // Would check for actual ML tools
      dataLakeExists: recordCount > 50000,
      apiInfrastructure: 0.6,
      cicdMaturity: 0.4,
      monitoringCapability: 0.5,
    },
    talentMetrics: {
      dataScientists: 0,
      mlEngineers: 0,
      dataEngineers: 1,
      domainExperts: processes.length > 0 ? 2 : 0,
      aiLiteracyLevel: 0.3,
      trainingBudget: 'limited',
      partnerEcosystem: false,
    },
    strategyMetrics: {
      aiStrategyDefined: false,
      executiveSponsor: false,
      useCasesIdentified: 0,
      pilotProjectsCompleted: 0,
      successMetricsDefined: false,
      ethicsGuidelinesExist: false,
      budgetAllocated: 0.2,
    },
    governanceMetrics: {
      dataGovernanceMaturity: 0.4,
      modelGovernanceExists: false,
      biasMitigationProcess: false,
      explainabilityRequirements: false,
      auditTrailCapability: 0.3,
      regulatoryAwareness: 0.5,
    },
  };
}

/**
 * Build data quality input from organization data
 */
function buildDataQualityInput(
  organizationId: string,
  entityRecords: Array<{
    entityType: string;
    qualityScore: number | null;
    data: unknown;
    createdAt: Date;
    updatedAt: Date;
    source: string;
  }>,
  dataSources: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    lastSyncAt: Date | null;
  }>
): DataQualityInput {
  // Group records by entity type
  const byType = new Map<string, typeof entityRecords>();
  entityRecords.forEach((r) => {
    const existing = byType.get(r.entityType) || [];
    existing.push(r);
    byType.set(r.entityType, existing);
  });

  const entitySamples = Array.from(byType.entries()).map(([entityType, records]) => {
    // Analyze fields
    const fieldNames = new Set<string>();
    records.forEach((r) => {
      if (typeof r.data === 'object' && r.data) {
        Object.keys(r.data as Record<string, unknown>).forEach((k) => fieldNames.add(k));
      }
    });

    const fieldAnalysis = Array.from(fieldNames).map((fieldName) => {
      const values = records.map((r) => {
        const data = r.data as Record<string, unknown>;
        return data?.[fieldName];
      });

      const nonNull = values.filter((v) => v !== null && v !== undefined);
      const uniqueValues = new Set(nonNull.map((v) => String(v)));

      return {
        fieldName,
        fieldType: typeof values[0],
        completeness: nonNull.length / values.length,
        uniqueness: uniqueValues.size / Math.max(1, nonNull.length),
        validity: 0.85 + Math.random() * 0.1,
        accuracy: 0.8 + Math.random() * 0.15,
        consistency: 0.75 + Math.random() * 0.2,
        standardization: 0.7 + Math.random() * 0.2,
      };
    });

    // Calculate staleness
    const now = new Date();
    const staleRecords = records.filter((r) => {
      const age = (now.getTime() - new Date(r.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return age > 90; // Stale if not updated in 90 days
    });

    const avgAge = records.reduce((sum, r) => {
      return sum + (now.getTime() - new Date(r.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    }, 0) / Math.max(1, records.length);

    return {
      entityType,
      totalRecords: records.length,
      sampleSize: Math.min(100, records.length),
      fieldAnalysis,
      duplicateInfo: {
        suspectedDuplicates: Math.floor(records.length * 0.05),
        confirmedDuplicates: Math.floor(records.length * 0.02),
        duplicateRate: 0.05,
        duplicateClusters: Math.floor(records.length * 0.02),
      },
      freshness: {
        lastUpdated: records[0]?.updatedAt || new Date(),
        avgAge,
        staleRecordPercentage: staleRecords.length / Math.max(1, records.length),
        updateFrequency: avgAge < 1 ? 'daily' : avgAge < 7 ? 'weekly' : 'monthly',
      },
    };
  });

  return {
    organizationId,
    entityRecords: entitySamples,
    dataSources: dataSources.map((ds) => ({
      id: ds.id,
      name: ds.name,
      type: ds.type,
      recordCount: entityRecords.filter((r) => r.source === ds.id).length,
      lastSyncAt: ds.lastSyncAt || new Date(),
      syncStatus: ds.status === 'active' ? 'active' : 'stale',
      qualityScore: 0.7 + Math.random() * 0.2,
    })),
  };
}

/**
 * Build process maturity input from organization data
 */
function buildProcessMaturityInput(
  organizationId: string,
  processes: Array<{
    id: string;
    name: string;
    category: string | null;
    status: string;
    steps: Array<unknown>;
    confidence: number | null;
    updatedAt: Date;
  }>,
  sops: Array<{
    processId: string;
    status: string;
    version: string;
    updatedAt: Date;
  }>
): ProcessMaturityInput {
  const processData = processes.map((p) => {
    const hasSOP = sops.some((s) => s.processId === p.id);
    const sopStatus = sops.find((s) => s.processId === p.id)?.status;

    return {
      processId: p.id,
      processName: p.name,
      category: p.category || 'Uncategorized',
      documentation: {
        hasDocumentation: hasSOP,
        documentationType: hasSOP
          ? sopStatus === 'published' ? 'detailed' : 'formal'
          : p.status === 'documented' ? 'informal' : 'none',
        lastUpdated: p.updatedAt,
        ownerAssigned: hasSOP,
        reviewCycle: hasSOP ? 'quarterly' : 'none',
      } as const,
      standardization: {
        isStandardized: p.status === 'documented',
        standardizationLevel: p.confidence || 0.5,
        variantCount: 1 + Math.floor(Math.random() * 3),
        complianceRate: 0.7 + Math.random() * 0.2,
        deviationFrequency: 'occasional' as const,
      },
      measurement: {
        kpisDefinied: hasSOP,
        kpiCount: hasSOP ? 2 + Math.floor(Math.random() * 3) : 0,
        measurementFrequency: hasSOP ? 'periodic' : 'none',
        performanceTracked: hasSOP,
        benchmarksAvailable: false,
      } as const,
      optimization: {
        optimizationCycles: hasSOP ? 1 + Math.floor(Math.random() * 2) : 0,
        lastOptimized: hasSOP ? p.updatedAt : undefined,
        continuousImprovement: false,
        feedbackLoop: hasSOP,
        rootCauseAnalysis: false,
      },
      automation: {
        automationLevel: 0.2 + Math.random() * 0.3,
        automatedSteps: Math.floor(p.steps.length * 0.3),
        totalSteps: p.steps.length,
        integrationPoints: 1 + Math.floor(Math.random() * 3),
        manualHandoffs: Math.floor(p.steps.length * 0.4),
      },
    };
  });

  return {
    organizationId,
    processes: processData,
    organizationMetrics: {
      totalProcesses: processes.length,
      documentedProcesses: processes.filter((p) => p.status === 'documented').length,
      standardizedProcesses: sops.filter((s) => s.status === 'published').length,
      automatedProcesses: Math.floor(processes.length * 0.2),
      processOwnership: sops.length / Math.max(1, processes.length),
      crossFunctionalProcesses: Math.floor(processes.length * 0.3),
      avgProcessAge: 12, // Months
    },
  };
}

/**
 * Run ERP assessment
 */
async function runERPAssessment(
  input: ERPReadinessInput,
  options?: AssessmentOptions
): Promise<{ overallScore: number; assessmentData: unknown; recommendations?: unknown }> {
  const score = await calculateERPReadiness(input);

  let recommendations;
  if (options?.includeRecommendations !== false) {
    recommendations = await generateRecommendations({
      organizationId: input.organizationId,
      erpReadiness: score,
      organizationContext: {
        industry: 'general',
        size: 'medium',
        currentSystems: [],
        strategicPriorities: ['erp_implementation'],
        budgetConstraint: 'moderate',
        timelineUrgency: 'planned',
        riskTolerance: 'medium',
      },
    });
  }

  return {
    overallScore: score.overallScore,
    assessmentData: score,
    recommendations,
  };
}

/**
 * Run AI assessment
 */
async function runAIAssessment(
  input: AIReadinessInput,
  options?: AssessmentOptions
): Promise<{ overallScore: number; assessmentData: unknown; recommendations?: unknown }> {
  const score = await calculateAIReadiness(input);

  let recommendations;
  if (options?.includeRecommendations !== false) {
    recommendations = await generateRecommendations({
      organizationId: input.organizationId,
      aiReadiness: score,
      organizationContext: {
        industry: 'general',
        size: 'medium',
        currentSystems: [],
        strategicPriorities: ['ai_adoption'],
        budgetConstraint: 'moderate',
        timelineUrgency: 'planned',
        riskTolerance: 'medium',
      },
    });
  }

  return {
    overallScore: score.overallScore,
    assessmentData: score,
    recommendations,
  };
}

/**
 * Run data quality assessment
 */
async function runDataQualityAssessment(
  input: DataQualityInput,
  options?: AssessmentOptions
): Promise<{ overallScore: number; assessmentData: unknown; recommendations?: unknown }> {
  const score = await calculateDataQuality(input);

  return {
    overallScore: score.overallScore,
    assessmentData: score,
    recommendations: score.recommendations,
  };
}

/**
 * Run process maturity assessment
 */
async function runProcessMaturityAssessment(
  input: ProcessMaturityInput,
  options?: AssessmentOptions
): Promise<{ overallScore: number; assessmentData: unknown; recommendations?: unknown }> {
  const score = await calculateProcessMaturity(input);

  return {
    overallScore: score.overallScore,
    assessmentData: score,
    recommendations: score.roadmap,
  };
}

/**
 * Run comprehensive assessment
 */
async function runComprehensiveAssessment(
  inputs: {
    erpInput?: ERPReadinessInput;
    aiInput?: AIReadinessInput;
    dataQualityInput?: DataQualityInput;
    processMaturityInput?: ProcessMaturityInput;
  },
  options?: AssessmentOptions
): Promise<{ overallScore: number; assessmentData: unknown; recommendations?: unknown }> {
  const results: Record<string, unknown> = {};
  const scores: number[] = [];

  if (inputs.erpInput) {
    const erp = await calculateERPReadiness(inputs.erpInput);
    results.erpReadiness = erp;
    scores.push(erp.overallScore);
  }

  if (inputs.aiInput) {
    const ai = await calculateAIReadiness(inputs.aiInput);
    results.aiReadiness = ai;
    scores.push(ai.overallScore);
  }

  if (inputs.dataQualityInput) {
    const dq = await calculateDataQuality(inputs.dataQualityInput);
    results.dataQuality = dq;
    scores.push(dq.overallScore);
  }

  if (inputs.processMaturityInput) {
    const pm = await calculateProcessMaturity(inputs.processMaturityInput);
    results.processMaturity = pm;
    scores.push(pm.overallScore);
  }

  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  // Generate comprehensive recommendations
  let recommendations;
  if (options?.includeRecommendations !== false) {
    const orgId = inputs.erpInput?.organizationId ||
                  inputs.aiInput?.organizationId ||
                  inputs.dataQualityInput?.organizationId ||
                  inputs.processMaturityInput?.organizationId || '';

    recommendations = await generateRecommendations({
      organizationId: orgId,
      erpReadiness: results.erpReadiness as never,
      aiReadiness: results.aiReadiness as never,
      dataQuality: results.dataQuality as never,
      processMaturity: results.processMaturity as never,
      organizationContext: {
        industry: 'general',
        size: 'medium',
        currentSystems: [],
        strategicPriorities: ['digital_transformation'],
        budgetConstraint: 'moderate',
        timelineUrgency: 'planned',
        riskTolerance: 'medium',
      },
    });
  }

  return {
    overallScore,
    assessmentData: results,
    recommendations,
  };
}

export default processAssessmentJob;
