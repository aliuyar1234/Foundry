/**
 * Process Change Simulator (T167)
 * Simulates the impact of process changes on the organization
 */

import { PrismaClient } from '@prisma/client';
import { neo4jConnection } from '../../graph/connection';

const prisma = new PrismaClient();

export interface ProcessChange {
  type: 'modification' | 'elimination' | 'automation' | 'merger' | 'split';
  processId: string;
  targetProcessId?: string; // For merger
  modifications?: {
    addSteps?: ProcessStepChange[];
    removeSteps?: string[];
    modifySteps?: ProcessStepChange[];
    changeOwner?: string;
    changeFrequency?: number;
  };
  automationLevel?: number; // 0-100%
}

interface ProcessStepChange {
  id?: string;
  name: string;
  duration?: number;
  assignedTo?: string;
  requiredSkills?: string[];
}

export interface ProcessChangeImpact {
  process: {
    id: string;
    name: string;
    currentSteps: number;
    currentDuration: number;
    frequency: number;
  };
  changeType: string;
  overallImpactScore: number;
  metrics: {
    efficiencyGain: EfficiencyGain;
    resourceImpact: ResourceImpact;
    riskAnalysis: RiskAnalysis;
    qualityImpact: QualityImpact;
    complianceImpact: ComplianceImpact;
  };
  affectedPeople: AffectedPerson[];
  upstreamProcesses: DependentProcess[];
  downstreamProcesses: DependentProcess[];
  implementationRequirements: ImplementationRequirement[];
  costBenefitAnalysis: CostBenefitAnalysis;
  timeline: ImplementationTimeline;
}

interface EfficiencyGain {
  currentCycleTime: number; // minutes
  projectedCycleTime: number;
  timeReduction: number; // percentage
  throughputIncrease: number; // percentage
  bottleneckResolution: string[];
  newBottlenecks: string[];
}

interface ResourceImpact {
  currentFTE: number;
  projectedFTE: number;
  fteChange: number;
  affectedRoles: Array<{
    role: string;
    currentCount: number;
    projectedCount: number;
    action: 'retain' | 'retrain' | 'reassign' | 'reduce';
  }>;
  skillRequirements: Array<{
    skill: string;
    currentAvailability: number;
    requiredLevel: number;
    gap: number;
  }>;
}

interface RiskAnalysis {
  overallRisk: number;
  risks: Array<{
    category: 'operational' | 'technical' | 'organizational' | 'compliance';
    description: string;
    likelihood: number;
    impact: number;
    score: number;
    mitigation: string;
  }>;
  riskReduction: number; // from current process risks
}

interface QualityImpact {
  currentErrorRate: number;
  projectedErrorRate: number;
  qualityImprovement: number;
  consistencyScore: number;
  affectedQualityMetrics: Array<{
    metric: string;
    currentValue: number;
    projectedValue: number;
    improvement: number;
  }>;
}

interface ComplianceImpact {
  affectedRegulations: string[];
  complianceRisks: Array<{
    regulation: string;
    risk: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string;
  }>;
  auditTrailChanges: boolean;
  documentationRequired: string[];
}

interface AffectedPerson {
  id: string;
  name: string;
  currentRole: string;
  impactType: 'workload_increase' | 'workload_decrease' | 'skill_change' | 'role_change' | 'reassignment';
  workloadChange: number; // percentage
  trainingRequired: string[];
  transitionTime: number; // days
}

interface DependentProcess {
  id: string;
  name: string;
  relationship: 'input' | 'output' | 'shared_resource';
  impactSeverity: 'low' | 'medium' | 'high';
  adaptationRequired: string;
}

interface ImplementationRequirement {
  category: 'technology' | 'training' | 'documentation' | 'communication' | 'testing';
  requirement: string;
  effort: 'low' | 'medium' | 'high';
  cost: number;
  duration: number; // days
  dependencies: string[];
}

interface CostBenefitAnalysis {
  implementationCosts: {
    technology: number;
    training: number;
    consulting: number;
    opportunity: number;
    total: number;
  };
  ongoingCosts: {
    monthly: number;
    annual: number;
  };
  benefits: {
    laborSavings: number;
    efficiencyGains: number;
    qualityImprovements: number;
    totalAnnual: number;
  };
  paybackPeriod: number; // months
  roi: number; // percentage
  npv: number; // 3-year NPV
}

interface ImplementationTimeline {
  totalDuration: number; // days
  phases: Array<{
    name: string;
    duration: number;
    startDay: number;
    endDay: number;
    tasks: string[];
    dependencies: string[];
  }>;
  criticalPath: string[];
  milestones: Array<{
    name: string;
    day: number;
    deliverable: string;
  }>;
}

export class ProcessSimulator {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Simulate the impact of a process change
   */
  async simulateChange(change: ProcessChange): Promise<ProcessChangeImpact> {
    // Get current process data
    const processData = await this.getProcessData(change.processId);

    // Analyze different impact areas
    const [
      efficiencyGain,
      resourceImpact,
      riskAnalysis,
      qualityImpact,
      complianceImpact,
    ] = await Promise.all([
      this.analyzeEfficiencyGain(change, processData),
      this.analyzeResourceImpact(change, processData),
      this.analyzeRisks(change, processData),
      this.analyzeQualityImpact(change, processData),
      this.analyzeComplianceImpact(change, processData),
    ]);

    // Get affected entities
    const [affectedPeople, upstreamProcesses, downstreamProcesses] = await Promise.all([
      this.getAffectedPeople(change, processData),
      this.getUpstreamProcesses(change.processId),
      this.getDownstreamProcesses(change.processId),
    ]);

    // Generate implementation requirements
    const implementationRequirements = this.generateImplementationRequirements(
      change,
      resourceImpact,
      complianceImpact
    );

    // Calculate costs and benefits
    const costBenefitAnalysis = this.calculateCostBenefit(
      change,
      efficiencyGain,
      resourceImpact,
      implementationRequirements
    );

    // Generate timeline
    const timeline = this.generateTimeline(
      change,
      implementationRequirements
    );

    // Calculate overall impact score
    const overallImpactScore = this.calculateOverallImpact({
      efficiencyGain,
      resourceImpact,
      riskAnalysis,
      qualityImpact,
    });

    return {
      process: {
        id: processData.id,
        name: processData.name,
        currentSteps: processData.steps.length,
        currentDuration: processData.totalDuration,
        frequency: processData.frequency,
      },
      changeType: change.type,
      overallImpactScore,
      metrics: {
        efficiencyGain,
        resourceImpact,
        riskAnalysis,
        qualityImpact,
        complianceImpact,
      },
      affectedPeople,
      upstreamProcesses,
      downstreamProcesses,
      implementationRequirements,
      costBenefitAnalysis,
      timeline,
    };
  }

  /**
   * Get process data from the graph
   */
  private async getProcessData(processId: string): Promise<{
    id: string;
    name: string;
    steps: Array<{
      id: string;
      name: string;
      duration: number;
      assignee: string;
    }>;
    totalDuration: number;
    frequency: number;
    participants: string[];
    errorRate: number;
  }> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (proc:Process {id: $processId, organizationId: $organizationId})
        OPTIONAL MATCH (proc)-[:HAS_STEP]->(step:ProcessStep)
        OPTIONAL MATCH (step)-[:ASSIGNED_TO]->(person:Person)
        OPTIONAL MATCH (proc)<-[:PARTICIPATES_IN]-(participant:Person)
        WITH proc, step, person, collect(DISTINCT participant.id) as participants
        ORDER BY step.order
        WITH proc, collect({
          id: step.id,
          name: step.name,
          duration: step.duration,
          assignee: person.name
        }) as steps, participants
        RETURN proc.id as id, proc.name as name, proc.frequency as frequency,
               proc.errorRate as errorRate, steps, participants[0..10] as participants
        `,
        { processId, organizationId: this.organizationId }
      );

      if (result.records.length === 0) {
        throw new Error(`Process not found: ${processId}`);
      }

      const record = result.records[0];
      const steps = record.get('steps').filter((s: { id: string | null }) => s.id);
      const totalDuration = steps.reduce((sum: number, s: { duration: number }) => sum + (s.duration || 0), 0);

      return {
        id: record.get('id'),
        name: record.get('name'),
        steps,
        totalDuration,
        frequency: record.get('frequency') || 1,
        participants: record.get('participants') || [],
        errorRate: record.get('errorRate') || 0.05,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze efficiency gains from the change
   */
  private async analyzeEfficiencyGain(
    change: ProcessChange,
    processData: { steps: Array<{ duration: number }>; totalDuration: number }
  ): Promise<EfficiencyGain> {
    let projectedCycleTime = processData.totalDuration;
    const bottleneckResolution: string[] = [];
    const newBottlenecks: string[] = [];

    switch (change.type) {
      case 'automation':
        // Automation reduces duration based on automation level
        const automationFactor = (change.automationLevel || 50) / 100;
        projectedCycleTime = processData.totalDuration * (1 - automationFactor * 0.7);
        bottleneckResolution.push('Manual processing delays');
        if (automationFactor > 0.8) {
          newBottlenecks.push('System availability dependency');
        }
        break;

      case 'elimination':
        // Process elimination - no cycle time
        projectedCycleTime = 0;
        bottleneckResolution.push('Entire process removed');
        break;

      case 'modification':
        // Calculate based on step changes
        if (change.modifications) {
          const addedTime = (change.modifications.addSteps || [])
            .reduce((sum, s) => sum + (s.duration || 10), 0);
          const removedSteps = change.modifications.removeSteps?.length || 0;
          const avgStepDuration = processData.totalDuration / Math.max(processData.steps.length, 1);
          projectedCycleTime = processData.totalDuration + addedTime - (removedSteps * avgStepDuration);
        }
        break;

      case 'merger':
        // Merger typically reduces overhead
        projectedCycleTime = processData.totalDuration * 0.85;
        bottleneckResolution.push('Duplicate handoffs eliminated');
        break;

      case 'split':
        // Split may increase total time but improve parallel processing
        projectedCycleTime = processData.totalDuration * 1.1;
        bottleneckResolution.push('Enables parallel execution');
        break;
    }

    const timeReduction = ((processData.totalDuration - projectedCycleTime) / processData.totalDuration) * 100;
    const throughputIncrease = timeReduction > 0 ? (timeReduction / (100 - timeReduction)) * 100 : 0;

    return {
      currentCycleTime: processData.totalDuration,
      projectedCycleTime: Math.max(0, Math.round(projectedCycleTime)),
      timeReduction: Math.round(timeReduction * 10) / 10,
      throughputIncrease: Math.round(throughputIncrease * 10) / 10,
      bottleneckResolution,
      newBottlenecks,
    };
  }

  /**
   * Analyze resource impact
   */
  private async analyzeResourceImpact(
    change: ProcessChange,
    processData: { participants: string[]; frequency: number }
  ): Promise<ResourceImpact> {
    const currentFTE = processData.participants.length * 0.2; // Assume 20% FTE per participant

    let projectedFTE = currentFTE;
    const affectedRoles: ResourceImpact['affectedRoles'] = [];
    const skillRequirements: ResourceImpact['skillRequirements'] = [];

    switch (change.type) {
      case 'automation':
        const automationLevel = (change.automationLevel || 50) / 100;
        projectedFTE = currentFTE * (1 - automationLevel * 0.6);

        affectedRoles.push({
          role: 'Process Operator',
          currentCount: Math.ceil(currentFTE),
          projectedCount: Math.ceil(projectedFTE),
          action: automationLevel > 0.7 ? 'reassign' : 'retain',
        });

        skillRequirements.push({
          skill: 'System Monitoring',
          currentAvailability: 30,
          requiredLevel: 70,
          gap: 40,
        });
        skillRequirements.push({
          skill: 'Exception Handling',
          currentAvailability: 50,
          requiredLevel: 80,
          gap: 30,
        });
        break;

      case 'elimination':
        projectedFTE = 0;
        affectedRoles.push({
          role: 'All Process Roles',
          currentCount: Math.ceil(currentFTE),
          projectedCount: 0,
          action: 'reassign',
        });
        break;

      case 'modification':
        // Modest change in FTE based on step changes
        const stepChange = (change.modifications?.addSteps?.length || 0) -
          (change.modifications?.removeSteps?.length || 0);
        projectedFTE = currentFTE * (1 + stepChange * 0.1);

        if (change.modifications?.addSteps) {
          for (const step of change.modifications.addSteps) {
            if (step.requiredSkills) {
              for (const skill of step.requiredSkills) {
                skillRequirements.push({
                  skill,
                  currentAvailability: 40,
                  requiredLevel: 70,
                  gap: 30,
                });
              }
            }
          }
        }
        break;
    }

    return {
      currentFTE: Math.round(currentFTE * 10) / 10,
      projectedFTE: Math.round(projectedFTE * 10) / 10,
      fteChange: Math.round((projectedFTE - currentFTE) * 10) / 10,
      affectedRoles,
      skillRequirements,
    };
  }

  /**
   * Analyze risks associated with the change
   */
  private async analyzeRisks(
    change: ProcessChange,
    _processData: { name: string }
  ): Promise<RiskAnalysis> {
    const risks: RiskAnalysis['risks'] = [];

    // Common risks based on change type
    switch (change.type) {
      case 'automation':
        risks.push({
          category: 'technical',
          description: 'System integration failures during automation',
          likelihood: 40,
          impact: 70,
          score: 28,
          mitigation: 'Phased rollout with parallel processing',
        });
        risks.push({
          category: 'organizational',
          description: 'Staff resistance to automation',
          likelihood: 60,
          impact: 50,
          score: 30,
          mitigation: 'Change management program and retraining',
        });
        break;

      case 'elimination':
        risks.push({
          category: 'operational',
          description: 'Loss of process outputs affecting downstream',
          likelihood: 30,
          impact: 80,
          score: 24,
          mitigation: 'Ensure alternative processes cover requirements',
        });
        risks.push({
          category: 'compliance',
          description: 'Regulatory requirements may mandate the process',
          likelihood: 20,
          impact: 90,
          score: 18,
          mitigation: 'Legal review before elimination',
        });
        break;

      case 'modification':
        risks.push({
          category: 'operational',
          description: 'Transition disruption during modification',
          likelihood: 50,
          impact: 40,
          score: 20,
          mitigation: 'Detailed transition plan with rollback capability',
        });
        break;

      case 'merger':
        risks.push({
          category: 'organizational',
          description: 'Confusion during process consolidation',
          likelihood: 55,
          impact: 45,
          score: 25,
          mitigation: 'Clear communication and updated documentation',
        });
        break;

      case 'split':
        risks.push({
          category: 'operational',
          description: 'Coordination overhead between split processes',
          likelihood: 45,
          impact: 50,
          score: 22,
          mitigation: 'Define clear interfaces and handoff points',
        });
        break;
    }

    const overallRisk = risks.reduce((sum, r) => sum + r.score, 0) / Math.max(risks.length, 1);
    const riskReduction = change.type === 'elimination' ? -20 : change.type === 'automation' ? 15 : 0;

    return {
      overallRisk: Math.round(overallRisk),
      risks,
      riskReduction,
    };
  }

  /**
   * Analyze quality impact
   */
  private async analyzeQualityImpact(
    change: ProcessChange,
    processData: { errorRate: number }
  ): Promise<QualityImpact> {
    let projectedErrorRate = processData.errorRate;
    const affectedQualityMetrics: QualityImpact['affectedQualityMetrics'] = [];

    switch (change.type) {
      case 'automation':
        // Automation typically reduces human error
        projectedErrorRate = processData.errorRate * 0.3;
        affectedQualityMetrics.push({
          metric: 'Data Entry Accuracy',
          currentValue: 95,
          projectedValue: 99,
          improvement: 4,
        });
        affectedQualityMetrics.push({
          metric: 'Processing Consistency',
          currentValue: 85,
          projectedValue: 98,
          improvement: 13,
        });
        break;

      case 'modification':
        // Modifications may temporarily increase errors
        projectedErrorRate = processData.errorRate * 1.2;
        affectedQualityMetrics.push({
          metric: 'Process Adherence',
          currentValue: 90,
          projectedValue: 85,
          improvement: -5,
        });
        break;

      case 'elimination':
        projectedErrorRate = 0;
        break;
    }

    const qualityImprovement = ((processData.errorRate - projectedErrorRate) / processData.errorRate) * 100;
    const consistencyScore = change.type === 'automation' ? 95 : 75;

    return {
      currentErrorRate: processData.errorRate,
      projectedErrorRate: Math.round(projectedErrorRate * 1000) / 1000,
      qualityImprovement: Math.round(qualityImprovement),
      consistencyScore,
      affectedQualityMetrics,
    };
  }

  /**
   * Analyze compliance impact
   */
  private async analyzeComplianceImpact(
    change: ProcessChange,
    processData: { name: string }
  ): Promise<ComplianceImpact> {
    const affectedRegulations: string[] = [];
    const complianceRisks: ComplianceImpact['complianceRisks'] = [];
    const documentationRequired: string[] = [];

    // Check for common compliance concerns
    if (change.type === 'automation') {
      affectedRegulations.push('GDPR - Data Processing');
      complianceRisks.push({
        regulation: 'GDPR',
        risk: 'Automated decision-making may require additional disclosures',
        severity: 'medium',
        mitigation: 'Implement human oversight for sensitive decisions',
      });
      documentationRequired.push('Data Processing Impact Assessment');
      documentationRequired.push('Automation Decision Log');
    }

    if (change.type === 'elimination') {
      complianceRisks.push({
        regulation: 'Record Retention',
        risk: 'Process outputs may be required for compliance records',
        severity: 'high',
        mitigation: 'Archive historical data before elimination',
      });
      documentationRequired.push('Process Elimination Justification');
      documentationRequired.push('Alternative Process Documentation');
    }

    // All changes require some documentation
    documentationRequired.push('Updated Process Documentation');
    documentationRequired.push('Change Authorization Record');

    return {
      affectedRegulations,
      complianceRisks,
      auditTrailChanges: change.type !== 'modification',
      documentationRequired,
    };
  }

  /**
   * Get people affected by the change
   */
  private async getAffectedPeople(
    change: ProcessChange,
    processData: { participants: string[] }
  ): Promise<AffectedPerson[]> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (proc:Process {id: $processId, organizationId: $organizationId})
        MATCH (proc)<-[r:PARTICIPATES_IN|OWNS|APPROVES]-(person:Person)
        RETURN person.id as id, person.name as name, person.role as role,
               type(r) as relationship
        `,
        { processId: change.processId, organizationId: this.organizationId }
      );

      return result.records.map((record) => {
        const relationship = record.get('relationship');
        let impactType: AffectedPerson['impactType'] = 'workload_decrease';
        let workloadChange = -20;
        const trainingRequired: string[] = [];

        switch (change.type) {
          case 'automation':
            impactType = 'skill_change';
            workloadChange = -50;
            trainingRequired.push('New System Training');
            trainingRequired.push('Exception Handling');
            break;
          case 'elimination':
            impactType = 'reassignment';
            workloadChange = -100;
            break;
          case 'modification':
            impactType = 'workload_increase';
            workloadChange = 10;
            trainingRequired.push('Process Update Training');
            break;
        }

        return {
          id: record.get('id'),
          name: record.get('name') || 'Unknown',
          currentRole: record.get('role') || relationship,
          impactType,
          workloadChange,
          trainingRequired,
          transitionTime: trainingRequired.length * 3, // 3 days per training
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get upstream dependent processes
   */
  private async getUpstreamProcesses(processId: string): Promise<DependentProcess[]> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (proc:Process {id: $processId, organizationId: $organizationId})
        MATCH (upstream:Process)-[r:PROVIDES_INPUT|TRIGGERS]->(proc)
        RETURN upstream.id as id, upstream.name as name, type(r) as relationship
        `,
        { processId, organizationId: this.organizationId }
      );

      return result.records.map((record) => ({
        id: record.get('id'),
        name: record.get('name'),
        relationship: 'input' as const,
        impactSeverity: 'medium' as const,
        adaptationRequired: 'Update output handling for modified downstream process',
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get downstream dependent processes
   */
  private async getDownstreamProcesses(processId: string): Promise<DependentProcess[]> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (proc:Process {id: $processId, organizationId: $organizationId})
        MATCH (proc)-[r:PROVIDES_INPUT|TRIGGERS]->(downstream:Process)
        RETURN downstream.id as id, downstream.name as name, type(r) as relationship
        `,
        { processId, organizationId: this.organizationId }
      );

      return result.records.map((record) => ({
        id: record.get('id'),
        name: record.get('name'),
        relationship: 'output' as const,
        impactSeverity: 'high' as const,
        adaptationRequired: 'Modify input handling for changed upstream process',
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Generate implementation requirements
   */
  private generateImplementationRequirements(
    change: ProcessChange,
    resourceImpact: ResourceImpact,
    complianceImpact: ComplianceImpact
  ): ImplementationRequirement[] {
    const requirements: ImplementationRequirement[] = [];

    // Documentation requirements
    for (const doc of complianceImpact.documentationRequired) {
      requirements.push({
        category: 'documentation',
        requirement: doc,
        effort: 'medium',
        cost: 500,
        duration: 3,
        dependencies: [],
      });
    }

    // Training requirements
    if (resourceImpact.skillRequirements.length > 0) {
      requirements.push({
        category: 'training',
        requirement: 'Staff training program',
        effort: 'high',
        cost: resourceImpact.skillRequirements.length * 2000,
        duration: resourceImpact.skillRequirements.length * 5,
        dependencies: ['documentation'],
      });
    }

    // Technology requirements for automation
    if (change.type === 'automation') {
      requirements.push({
        category: 'technology',
        requirement: 'Automation platform configuration',
        effort: 'high',
        cost: 15000,
        duration: 20,
        dependencies: [],
      });
      requirements.push({
        category: 'testing',
        requirement: 'UAT and parallel processing verification',
        effort: 'medium',
        cost: 5000,
        duration: 10,
        dependencies: ['technology'],
      });
    }

    // Communication
    requirements.push({
      category: 'communication',
      requirement: 'Stakeholder communication plan',
      effort: 'low',
      cost: 1000,
      duration: 5,
      dependencies: [],
    });

    return requirements;
  }

  /**
   * Calculate cost-benefit analysis
   */
  private calculateCostBenefit(
    change: ProcessChange,
    efficiencyGain: EfficiencyGain,
    resourceImpact: ResourceImpact,
    requirements: ImplementationRequirement[]
  ): CostBenefitAnalysis {
    // Implementation costs
    const technology = requirements
      .filter((r) => r.category === 'technology')
      .reduce((sum, r) => sum + r.cost, 0);
    const training = requirements
      .filter((r) => r.category === 'training')
      .reduce((sum, r) => sum + r.cost, 0);
    const consulting = change.type === 'automation' ? 10000 : 3000;
    const opportunity = Math.abs(resourceImpact.fteChange) * 2000; // Transition cost

    const implementationCosts = {
      technology,
      training,
      consulting,
      opportunity,
      total: technology + training + consulting + opportunity,
    };

    // Ongoing costs
    const monthly = change.type === 'automation' ? 500 : 0; // System maintenance
    const annual = monthly * 12;

    const ongoingCosts = { monthly, annual };

    // Benefits
    const avgSalary = 60000;
    const laborSavings = Math.max(0, -resourceImpact.fteChange) * avgSalary;
    const efficiencyGains = (efficiencyGain.timeReduction / 100) * 50000; // Productivity value
    const qualityImprovements = change.type === 'automation' ? 20000 : 5000;

    const totalAnnual = laborSavings + efficiencyGains + qualityImprovements;

    const benefits = {
      laborSavings,
      efficiencyGains,
      qualityImprovements,
      totalAnnual,
    };

    // Financial metrics
    const netAnnualBenefit = totalAnnual - annual;
    const paybackPeriod = implementationCosts.total / Math.max(netAnnualBenefit / 12, 1);
    const roi = ((netAnnualBenefit * 3 - implementationCosts.total) / implementationCosts.total) * 100;

    // 3-year NPV with 10% discount rate
    const discountRate = 0.1;
    const npv = -implementationCosts.total +
      netAnnualBenefit / (1 + discountRate) +
      netAnnualBenefit / Math.pow(1 + discountRate, 2) +
      netAnnualBenefit / Math.pow(1 + discountRate, 3);

    return {
      implementationCosts,
      ongoingCosts,
      benefits,
      paybackPeriod: Math.round(paybackPeriod),
      roi: Math.round(roi),
      npv: Math.round(npv),
    };
  }

  /**
   * Generate implementation timeline
   */
  private generateTimeline(
    change: ProcessChange,
    requirements: ImplementationRequirement[]
  ): ImplementationTimeline {
    const phases: ImplementationTimeline['phases'] = [];
    const milestones: ImplementationTimeline['milestones'] = [];
    let currentDay = 0;

    // Phase 1: Planning
    phases.push({
      name: 'Planning & Analysis',
      duration: 10,
      startDay: currentDay,
      endDay: currentDay + 10,
      tasks: ['Stakeholder analysis', 'Detailed requirements', 'Risk assessment'],
      dependencies: [],
    });
    milestones.push({
      name: 'Planning Complete',
      day: currentDay + 10,
      deliverable: 'Implementation Plan',
    });
    currentDay += 10;

    // Phase 2: Preparation
    const docRequirements = requirements.filter((r) => r.category === 'documentation');
    const docDuration = docRequirements.reduce((sum, r) => sum + r.duration, 0) || 5;
    phases.push({
      name: 'Documentation & Setup',
      duration: docDuration,
      startDay: currentDay,
      endDay: currentDay + docDuration,
      tasks: docRequirements.map((r) => r.requirement),
      dependencies: ['Planning & Analysis'],
    });
    currentDay += docDuration;

    // Phase 3: Implementation (for automation)
    if (change.type === 'automation') {
      const techRequirements = requirements.filter((r) => r.category === 'technology');
      const techDuration = techRequirements.reduce((sum, r) => sum + r.duration, 0) || 20;
      phases.push({
        name: 'Technical Implementation',
        duration: techDuration,
        startDay: currentDay,
        endDay: currentDay + techDuration,
        tasks: techRequirements.map((r) => r.requirement),
        dependencies: ['Documentation & Setup'],
      });
      milestones.push({
        name: 'System Ready',
        day: currentDay + techDuration,
        deliverable: 'Configured System',
      });
      currentDay += techDuration;
    }

    // Phase 4: Training
    const trainingRequirements = requirements.filter((r) => r.category === 'training');
    const trainingDuration = trainingRequirements.reduce((sum, r) => sum + r.duration, 0) || 5;
    if (trainingDuration > 0) {
      phases.push({
        name: 'Training & Enablement',
        duration: trainingDuration,
        startDay: currentDay,
        endDay: currentDay + trainingDuration,
        tasks: trainingRequirements.map((r) => r.requirement),
        dependencies: change.type === 'automation' ? ['Technical Implementation'] : ['Documentation & Setup'],
      });
      currentDay += trainingDuration;
    }

    // Phase 5: Testing & Rollout
    phases.push({
      name: 'Testing & Rollout',
      duration: 10,
      startDay: currentDay,
      endDay: currentDay + 10,
      tasks: ['User acceptance testing', 'Parallel run', 'Go-live', 'Hypercare'],
      dependencies: ['Training & Enablement'],
    });
    milestones.push({
      name: 'Go-Live',
      day: currentDay + 7,
      deliverable: 'Production Deployment',
    });
    currentDay += 10;

    // Identify critical path
    const criticalPath = phases.map((p) => p.name);

    return {
      totalDuration: currentDay,
      phases,
      criticalPath,
      milestones,
    };
  }

  /**
   * Calculate overall impact score
   */
  private calculateOverallImpact(metrics: {
    efficiencyGain: EfficiencyGain;
    resourceImpact: ResourceImpact;
    riskAnalysis: RiskAnalysis;
    qualityImpact: QualityImpact;
  }): number {
    // Positive factors
    const efficiencyScore = Math.max(0, metrics.efficiencyGain.timeReduction);
    const qualityScore = Math.max(0, metrics.qualityImpact.qualityImprovement);
    const resourceScore = Math.max(0, -metrics.resourceImpact.fteChange * 20);

    // Negative factors
    const riskPenalty = metrics.riskAnalysis.overallRisk * 0.5;

    const score = (efficiencyScore + qualityScore + resourceScore - riskPenalty) / 3;
    return Math.max(0, Math.min(100, Math.round(score + 50)));
  }
}

export default ProcessSimulator;
