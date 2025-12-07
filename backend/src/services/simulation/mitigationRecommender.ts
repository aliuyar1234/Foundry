/**
 * Mitigation Strategy Recommender (T170)
 * Generates mitigation strategies for identified risks from simulations
 */

import type { QuantifiedImpact } from './impactQuantifier';

export interface MitigationPlan {
  overallStrategy: OverallStrategy;
  riskMitigations: RiskMitigation[];
  contingencyPlans: ContingencyPlan[];
  communicationPlan: CommunicationPlan;
  monitoringPlan: MonitoringPlan;
  resourceRequirements: ResourceRequirements;
  timeline: MitigationTimeline;
  successCriteria: SuccessCriterion[];
}

interface OverallStrategy {
  approach: 'accept' | 'mitigate' | 'transfer' | 'avoid';
  rationale: string;
  keyPrinciples: string[];
  priorityAreas: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  estimatedCost: number;
}

interface RiskMitigation {
  riskId: string;
  riskDescription: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentScore: number;
  targetScore: number;
  strategies: Array<{
    strategy: string;
    type: 'preventive' | 'detective' | 'corrective';
    effectiveness: number;
    cost: number;
    effort: 'low' | 'medium' | 'high';
    timeToImplement: number;
    owner: string;
    dependencies: string[];
  }>;
  residualRisk: number;
  acceptanceCriteria: string;
}

interface ContingencyPlan {
  trigger: string;
  scenario: string;
  probability: number;
  impact: number;
  response: {
    immediateActions: string[];
    shortTermActions: string[];
    longTermActions: string[];
    escalationPath: string[];
    communicationProtocol: string;
  };
  resources: {
    budget: number;
    personnel: string[];
    tools: string[];
  };
  recoveryTimeObjective: number;
  testingFrequency: string;
}

interface CommunicationPlan {
  stakeholders: Array<{
    group: string;
    concerns: string[];
    messageFraming: string;
    channels: string[];
    frequency: string;
    owner: string;
  }>;
  keyMessages: Array<{
    message: string;
    audience: string;
    timing: string;
    deliveryMethod: string;
  }>;
  escalationMatrix: Array<{
    issue: string;
    level1: string;
    level2: string;
    level3: string;
    timeframe: string;
  }>;
  feedbackMechanisms: string[];
}

interface MonitoringPlan {
  kpis: Array<{
    name: string;
    baseline: number;
    target: number;
    threshold: number;
    frequency: string;
    dataSource: string;
    owner: string;
  }>;
  earlyWarningIndicators: Array<{
    indicator: string;
    threshold: string;
    action: string;
    owner: string;
  }>;
  reportingCadence: {
    daily: string[];
    weekly: string[];
    monthly: string[];
  };
  dashboardRequirements: string[];
}

interface ResourceRequirements {
  personnel: Array<{
    role: string;
    fteAllocation: number;
    duration: string;
    skills: string[];
    internalExternal: 'internal' | 'external' | 'either';
  }>;
  budget: {
    personnel: number;
    technology: number;
    training: number;
    consulting: number;
    contingency: number;
    total: number;
  };
  tools: Array<{
    name: string;
    purpose: string;
    cost: number;
    existingOrNew: 'existing' | 'new';
  }>;
  training: Array<{
    topic: string;
    audience: string;
    duration: number;
    format: string;
    provider: string;
  }>;
}

interface MitigationTimeline {
  totalDuration: number;
  phases: Array<{
    name: string;
    startDay: number;
    endDay: number;
    activities: string[];
    deliverables: string[];
    gates: string[];
  }>;
  criticalPath: string[];
  dependencies: Array<{
    activity: string;
    dependsOn: string;
    lag: number;
  }>;
  milestones: Array<{
    name: string;
    day: number;
    criteria: string;
    owner: string;
  }>;
}

interface SuccessCriterion {
  criterion: string;
  metric: string;
  target: string;
  measurementMethod: string;
  reviewDate: string;
}

export class MitigationRecommender {
  /**
   * Generate comprehensive mitigation plan from quantified impact
   */
  generateMitigationPlan(impact: QuantifiedImpact): MitigationPlan {
    const overallStrategy = this.determineOverallStrategy(impact);
    const riskMitigations = this.generateRiskMitigations(impact);
    const contingencyPlans = this.generateContingencyPlans(impact);
    const communicationPlan = this.generateCommunicationPlan(impact);
    const monitoringPlan = this.generateMonitoringPlan(impact);
    const resourceRequirements = this.calculateResourceRequirements(impact, riskMitigations);
    const timeline = this.generateMitigationTimeline(riskMitigations);
    const successCriteria = this.defineSuccessCriteria(impact);

    return {
      overallStrategy,
      riskMitigations,
      contingencyPlans,
      communicationPlan,
      monitoringPlan,
      resourceRequirements,
      timeline,
      successCriteria,
    };
  }

  /**
   * Determine overall mitigation strategy
   */
  private determineOverallStrategy(impact: QuantifiedImpact): OverallStrategy {
    const riskScore = impact.risk.overallRiskScore;
    const netBenefit = impact.financial.netFinancialImpact.fiveYear;

    let approach: OverallStrategy['approach'];
    let rationale: string;
    let keyPrinciples: string[];
    let estimatedEffort: 'low' | 'medium' | 'high';

    if (riskScore < 30 && netBenefit > 0) {
      approach = 'accept';
      rationale = 'Low risk with positive financial outcome justifies proceeding with minimal intervention';
      keyPrinciples = [
        'Monitor key indicators passively',
        'Prepare light contingency plans',
        'Focus resources on execution',
      ];
      estimatedEffort = 'low';
    } else if (riskScore > 70) {
      approach = 'avoid';
      rationale = 'Risk level exceeds acceptable threshold; recommend delaying or reconsidering';
      keyPrinciples = [
        'Conduct thorough risk reassessment',
        'Explore alternative approaches',
        'Require executive sign-off if proceeding',
      ];
      estimatedEffort = 'high';
    } else if (riskScore > 50 || netBenefit < 0) {
      approach = 'mitigate';
      rationale = 'Moderate to high risk requires active intervention to achieve acceptable outcomes';
      keyPrinciples = [
        'Address highest risks first',
        'Implement preventive controls',
        'Establish clear escalation paths',
        'Regular progress reviews',
      ];
      estimatedEffort = 'high';
    } else {
      approach = 'transfer';
      rationale = 'Consider transferring specific risks through insurance, partnerships, or outsourcing';
      keyPrinciples = [
        'Identify transferable risks',
        'Evaluate transfer mechanisms',
        'Maintain oversight of transferred risks',
      ];
      estimatedEffort = 'medium';
    }

    const priorityAreas = impact.risk.topRisks
      .filter((r) => r.score > 30)
      .map((r) => r.category)
      .filter((v, i, a) => a.indexOf(v) === i);

    const estimatedCost = this.estimateMitigationCost(riskScore, impact.financial.oneTimeCosts.total);

    return {
      approach,
      rationale,
      keyPrinciples,
      priorityAreas,
      estimatedEffort,
      estimatedCost,
    };
  }

  /**
   * Generate specific risk mitigations
   */
  private generateRiskMitigations(impact: QuantifiedImpact): RiskMitigation[] {
    return impact.risk.topRisks.map((risk, index) => {
      const strategies = this.generateMitigationStrategies(risk);
      const residualRisk = this.calculateResidualRisk(risk.score, strategies);

      return {
        riskId: `RISK-${String(index + 1).padStart(3, '0')}`,
        riskDescription: risk.risk,
        severity: this.getSeverityLevel(risk.score),
        currentScore: risk.score,
        targetScore: Math.max(10, risk.score * 0.4),
        strategies,
        residualRisk,
        acceptanceCriteria: `Risk score reduced below ${Math.round(risk.score * 0.5)} with documented controls`,
      };
    });
  }

  /**
   * Generate mitigation strategies for a specific risk
   */
  private generateMitigationStrategies(risk: {
    risk: string;
    category: string;
    probability: number;
    impact: number;
    score: number;
    mitigation: string;
  }): RiskMitigation['strategies'] {
    const strategies: RiskMitigation['strategies'] = [];

    // Primary mitigation from impact analysis
    strategies.push({
      strategy: risk.mitigation,
      type: 'preventive',
      effectiveness: 60,
      cost: this.estimateStrategyCost(risk.score, 'preventive'),
      effort: risk.score > 40 ? 'high' : 'medium',
      timeToImplement: risk.score > 40 ? 14 : 7,
      owner: this.assignOwner(risk.category),
      dependencies: [],
    });

    // Add detective control
    strategies.push({
      strategy: `Implement monitoring for ${risk.risk.toLowerCase()}`,
      type: 'detective',
      effectiveness: 30,
      cost: this.estimateStrategyCost(risk.score, 'detective'),
      effort: 'medium',
      timeToImplement: 7,
      owner: 'Operations',
      dependencies: [],
    });

    // Add corrective control for high-severity risks
    if (risk.score > 40) {
      strategies.push({
        strategy: `Establish recovery procedure for ${risk.risk.toLowerCase()}`,
        type: 'corrective',
        effectiveness: 40,
        cost: this.estimateStrategyCost(risk.score, 'corrective'),
        effort: 'medium',
        timeToImplement: 10,
        owner: this.assignOwner(risk.category),
        dependencies: ['Detective control in place'],
      });
    }

    return strategies;
  }

  /**
   * Generate contingency plans
   */
  private generateContingencyPlans(impact: QuantifiedImpact): ContingencyPlan[] {
    const plans: ContingencyPlan[] = [];

    // Plan for top risks
    for (const risk of impact.risk.topRisks.filter((r) => r.score > 30).slice(0, 5)) {
      plans.push({
        trigger: `${risk.risk} materializes or indicator reaches critical threshold`,
        scenario: `${risk.category} disruption affecting operations`,
        probability: risk.probability,
        impact: risk.impact,
        response: {
          immediateActions: [
            'Activate incident response team',
            'Notify key stakeholders',
            'Document incident details',
          ],
          shortTermActions: [
            'Implement workarounds',
            'Assess damage scope',
            'Communicate status updates',
          ],
          longTermActions: [
            'Root cause analysis',
            'Implement permanent fixes',
            'Update procedures',
          ],
          escalationPath: ['Team Lead', 'Department Head', 'Executive Sponsor'],
          communicationProtocol: 'Immediate notification within 1 hour, updates every 4 hours',
        },
        resources: {
          budget: risk.score * 100,
          personnel: ['Incident Manager', 'Subject Matter Expert', 'Communications Lead'],
          tools: ['Incident tracking system', 'Communication platform'],
        },
        recoveryTimeObjective: risk.score > 50 ? 24 : 48,
        testingFrequency: 'Quarterly tabletop exercise',
      });
    }

    // General rollback plan
    plans.push({
      trigger: 'Overall implementation fails to meet success criteria',
      scenario: 'Need to revert to previous state',
      probability: 20,
      impact: 60,
      response: {
        immediateActions: [
          'Halt current implementation',
          'Activate rollback procedure',
          'Notify all stakeholders',
        ],
        shortTermActions: [
          'Execute rollback steps',
          'Verify system stability',
          'Document lessons learned',
        ],
        longTermActions: [
          'Conduct retrospective',
          'Revise implementation plan',
          'Obtain approval before retry',
        ],
        escalationPath: ['Project Manager', 'Sponsor', 'Steering Committee'],
        communicationProtocol: 'Same-day communication to all affected parties',
      },
      resources: {
        budget: impact.financial.oneTimeCosts.total * 0.2,
        personnel: ['Implementation Team', 'IT Support', 'Business Owners'],
        tools: ['Backup systems', 'Rollback scripts'],
      },
      recoveryTimeObjective: 72,
      testingFrequency: 'Before go-live',
    });

    return plans;
  }

  /**
   * Generate communication plan
   */
  private generateCommunicationPlan(impact: QuantifiedImpact): CommunicationPlan {
    return {
      stakeholders: [
        {
          group: 'Executive Leadership',
          concerns: ['Business impact', 'Risk level', 'Resource requirements'],
          messageFraming: 'Strategic rationale and expected outcomes',
          channels: ['Executive briefing', 'Written summary'],
          frequency: 'Weekly during transition, monthly after',
          owner: 'Project Sponsor',
        },
        {
          group: 'Affected Employees',
          concerns: ['Job security', 'Role changes', 'Support available'],
          messageFraming: 'Focus on support, clarity, and opportunities',
          channels: ['Team meetings', 'One-on-ones', 'FAQ document'],
          frequency: 'Daily during announcement, weekly during transition',
          owner: 'HR and Line Managers',
        },
        {
          group: 'IT/Operations',
          concerns: ['System changes', 'Timeline', 'Technical requirements'],
          messageFraming: 'Technical details and implementation plan',
          channels: ['Technical briefings', 'Documentation'],
          frequency: 'As needed based on implementation schedule',
          owner: 'Technical Lead',
        },
        {
          group: 'Customers/External',
          concerns: ['Service continuity', 'Contact changes'],
          messageFraming: 'Assurance of continued service quality',
          channels: ['Email notification', 'Account manager outreach'],
          frequency: 'Before and after major milestones',
          owner: 'Customer Success',
        },
      ],
      keyMessages: [
        {
          message: 'Rationale for change and expected benefits',
          audience: 'All stakeholders',
          timing: 'Day 1 of announcement',
          deliveryMethod: 'All-hands meeting + written communication',
        },
        {
          message: 'Specific impacts and support resources',
          audience: 'Affected employees',
          timing: 'Day 1-2 of announcement',
          deliveryMethod: 'Small group meetings',
        },
        {
          message: 'Timeline and what to expect',
          audience: 'All stakeholders',
          timing: 'Week 1',
          deliveryMethod: 'Project newsletter/portal',
        },
        {
          message: 'Progress updates and success stories',
          audience: 'All stakeholders',
          timing: 'Ongoing weekly',
          deliveryMethod: 'Email updates and team meetings',
        },
      ],
      escalationMatrix: [
        {
          issue: 'Employee resistance or concerns',
          level1: 'Line Manager',
          level2: 'HR Business Partner',
          level3: 'HR Director',
          timeframe: '24-48 hours per level',
        },
        {
          issue: 'Technical implementation issues',
          level1: 'Technical Lead',
          level2: 'IT Director',
          level3: 'CTO',
          timeframe: '4-24 hours per level',
        },
        {
          issue: 'Schedule or budget concerns',
          level1: 'Project Manager',
          level2: 'Project Sponsor',
          level3: 'Steering Committee',
          timeframe: '24-48 hours per level',
        },
      ],
      feedbackMechanisms: [
        'Anonymous feedback form',
        'Regular pulse surveys',
        'Open office hours with leadership',
        'Dedicated email/chat channel for questions',
      ],
    };
  }

  /**
   * Generate monitoring plan
   */
  private generateMonitoringPlan(impact: QuantifiedImpact): MonitoringPlan {
    return {
      kpis: [
        {
          name: 'Employee Engagement Score',
          baseline: 70,
          target: 65,
          threshold: 55,
          frequency: 'Weekly pulse, Monthly full survey',
          dataSource: 'HR Survey Tool',
          owner: 'HR',
        },
        {
          name: 'Process Cycle Time',
          baseline: 100,
          target: 95,
          threshold: 120,
          frequency: 'Daily',
          dataSource: 'Process monitoring system',
          owner: 'Operations',
        },
        {
          name: 'Error Rate',
          baseline: impact.operational.quality.errorRateChange,
          target: impact.operational.quality.errorRateChange * 0.8,
          threshold: impact.operational.quality.errorRateChange * 1.5,
          frequency: 'Daily',
          dataSource: 'Quality management system',
          owner: 'Quality',
        },
        {
          name: 'Implementation Milestone Completion',
          baseline: 0,
          target: 100,
          threshold: 80,
          frequency: 'Weekly',
          dataSource: 'Project management tool',
          owner: 'Project Manager',
        },
        {
          name: 'Risk Register Status',
          baseline: impact.risk.overallRiskScore,
          target: impact.risk.overallRiskScore * 0.6,
          threshold: impact.risk.overallRiskScore * 1.2,
          frequency: 'Weekly',
          dataSource: 'Risk register',
          owner: 'Risk Manager',
        },
      ],
      earlyWarningIndicators: [
        {
          indicator: 'Voluntary turnover increase',
          threshold: '>5% above baseline',
          action: 'Conduct stay interviews, review support programs',
          owner: 'HR',
        },
        {
          indicator: 'Customer complaints increase',
          threshold: '>20% above baseline',
          action: 'Review service levels, communicate with customers',
          owner: 'Customer Success',
        },
        {
          indicator: 'Missed project milestones',
          threshold: '2+ consecutive misses',
          action: 'Reassess timeline, escalate blockers',
          owner: 'Project Manager',
        },
        {
          indicator: 'Team productivity decline',
          threshold: '>15% below baseline',
          action: 'Assess workload, provide additional support',
          owner: 'Line Managers',
        },
      ],
      reportingCadence: {
        daily: ['Implementation progress', 'Critical issues'],
        weekly: ['KPI dashboard', 'Risk status', 'Stakeholder concerns'],
        monthly: ['Executive summary', 'Financial tracking', 'Lessons learned'],
      },
      dashboardRequirements: [
        'Real-time KPI visualization',
        'Risk heat map',
        'Milestone tracking Gantt chart',
        'Stakeholder sentiment tracker',
        'Issue log and resolution status',
      ],
    };
  }

  /**
   * Calculate resource requirements
   */
  private calculateResourceRequirements(
    impact: QuantifiedImpact,
    mitigations: RiskMitigation[]
  ): ResourceRequirements {
    const totalMitigationCost = mitigations.reduce(
      (sum, m) => sum + m.strategies.reduce((s, st) => s + st.cost, 0),
      0
    );

    return {
      personnel: [
        {
          role: 'Project Manager',
          fteAllocation: 1.0,
          duration: `${impact.timeline.totalDuration} days`,
          skills: ['Project management', 'Stakeholder management', 'Risk management'],
          internalExternal: 'internal',
        },
        {
          role: 'Change Management Lead',
          fteAllocation: 0.5,
          duration: `${impact.timeline.totalDuration} days`,
          skills: ['Change management', 'Communication', 'Training'],
          internalExternal: 'either',
        },
        {
          role: 'HR Business Partner',
          fteAllocation: 0.3,
          duration: `${impact.timeline.totalDuration} days`,
          skills: ['Employee relations', 'Organizational development'],
          internalExternal: 'internal',
        },
        {
          role: 'Subject Matter Expert',
          fteAllocation: 0.5,
          duration: `${Math.round(impact.timeline.totalDuration * 0.6)} days`,
          skills: ['Domain expertise', 'Process knowledge'],
          internalExternal: 'internal',
        },
      ],
      budget: {
        personnel: impact.financial.oneTimeCosts.total * 0.3,
        technology: impact.financial.oneTimeCosts.technology,
        training: impact.financial.oneTimeCosts.training,
        consulting: impact.financial.oneTimeCosts.consulting,
        contingency: totalMitigationCost * 0.2,
        total: impact.financial.oneTimeCosts.total + totalMitigationCost,
      },
      tools: [
        {
          name: 'Project Management Software',
          purpose: 'Track progress and milestones',
          cost: 0,
          existingOrNew: 'existing',
        },
        {
          name: 'Survey Tool',
          purpose: 'Collect employee feedback',
          cost: 500,
          existingOrNew: 'existing',
        },
        {
          name: 'Communication Platform',
          purpose: 'Stakeholder communication',
          cost: 0,
          existingOrNew: 'existing',
        },
        {
          name: 'Dashboard/Reporting Tool',
          purpose: 'KPI visualization',
          cost: 1000,
          existingOrNew: 'existing',
        },
      ],
      training: [
        {
          topic: 'Change Leadership',
          audience: 'Managers',
          duration: 4,
          format: 'Workshop',
          provider: 'Internal L&D or External',
        },
        {
          topic: 'New Process/System Training',
          audience: 'Affected employees',
          duration: 8,
          format: 'Hands-on training',
          provider: 'Internal SMEs',
        },
        {
          topic: 'Communication Skills',
          audience: 'People managers',
          duration: 2,
          format: 'Online module',
          provider: 'Internal L&D',
        },
      ],
    };
  }

  /**
   * Generate mitigation timeline
   */
  private generateMitigationTimeline(mitigations: RiskMitigation[]): MitigationTimeline {
    const phases: MitigationTimeline['phases'] = [];
    let currentDay = 0;

    // Phase 1: Planning and Setup
    phases.push({
      name: 'Planning and Setup',
      startDay: currentDay,
      endDay: currentDay + 7,
      activities: [
        'Finalize mitigation strategies',
        'Assign owners and resources',
        'Set up monitoring tools',
        'Develop communication materials',
      ],
      deliverables: [
        'Detailed mitigation plan',
        'Resource allocation',
        'Monitoring dashboard',
      ],
      gates: ['Plan approved by sponsor'],
    });
    currentDay += 7;

    // Phase 2: Preventive Controls
    const preventiveTime = Math.max(...mitigations.flatMap((m) =>
      m.strategies.filter((s) => s.type === 'preventive').map((s) => s.timeToImplement)
    ), 14);

    phases.push({
      name: 'Preventive Controls Implementation',
      startDay: currentDay,
      endDay: currentDay + preventiveTime,
      activities: mitigations.flatMap((m) =>
        m.strategies.filter((s) => s.type === 'preventive').map((s) => s.strategy)
      ),
      deliverables: ['Preventive controls operational'],
      gates: ['Controls tested and verified'],
    });
    currentDay += preventiveTime;

    // Phase 3: Detective Controls
    phases.push({
      name: 'Detective Controls Implementation',
      startDay: currentDay,
      endDay: currentDay + 7,
      activities: mitigations.flatMap((m) =>
        m.strategies.filter((s) => s.type === 'detective').map((s) => s.strategy)
      ),
      deliverables: ['Monitoring systems active'],
      gates: ['Alert thresholds configured'],
    });
    currentDay += 7;

    // Phase 4: Corrective Procedures
    phases.push({
      name: 'Corrective Procedures Setup',
      startDay: currentDay,
      endDay: currentDay + 10,
      activities: [
        'Document response procedures',
        'Train response team',
        'Test contingency plans',
      ],
      deliverables: ['Response playbooks', 'Trained response team'],
      gates: ['Procedures tested via tabletop'],
    });
    currentDay += 10;

    // Phase 5: Ongoing Monitoring
    phases.push({
      name: 'Transition to Ongoing Monitoring',
      startDay: currentDay,
      endDay: currentDay + 7,
      activities: [
        'Hand off to operations',
        'Establish reporting rhythm',
        'Close mitigation project',
      ],
      deliverables: ['Operations handover complete'],
      gates: ['Operations team accepting ownership'],
    });

    const totalDuration = currentDay + 7;

    // Dependencies
    const dependencies: MitigationTimeline['dependencies'] = [
      { activity: 'Preventive Controls', dependsOn: 'Planning and Setup', lag: 0 },
      { activity: 'Detective Controls', dependsOn: 'Planning and Setup', lag: 0 },
      { activity: 'Corrective Procedures', dependsOn: 'Detective Controls', lag: 0 },
      { activity: 'Ongoing Monitoring', dependsOn: 'Corrective Procedures', lag: 0 },
    ];

    // Milestones
    const milestones: MitigationTimeline['milestones'] = [
      {
        name: 'Plan Approved',
        day: 7,
        criteria: 'Sponsor sign-off received',
        owner: 'Project Manager',
      },
      {
        name: 'Preventive Controls Live',
        day: 7 + preventiveTime,
        criteria: 'All preventive controls operational',
        owner: 'Risk Manager',
      },
      {
        name: 'Full Mitigation Operational',
        day: totalDuration - 7,
        criteria: 'All controls active and monitored',
        owner: 'Risk Manager',
      },
      {
        name: 'Handover Complete',
        day: totalDuration,
        criteria: 'Operations team has full ownership',
        owner: 'Project Manager',
      },
    ];

    // Critical path
    const criticalPath = phases.map((p) => p.name);

    return {
      totalDuration,
      phases,
      criticalPath,
      dependencies,
      milestones,
    };
  }

  /**
   * Define success criteria
   */
  private defineSuccessCriteria(impact: QuantifiedImpact): SuccessCriterion[] {
    return [
      {
        criterion: 'Risk score reduction',
        metric: 'Overall risk score',
        target: `<${Math.round(impact.risk.overallRiskScore * 0.6)}`,
        measurementMethod: 'Risk assessment tool',
        reviewDate: 'Monthly for 6 months',
      },
      {
        criterion: 'No critical risk materialization',
        metric: 'Critical incident count',
        target: '0',
        measurementMethod: 'Incident tracking system',
        reviewDate: 'Ongoing',
      },
      {
        criterion: 'Stakeholder satisfaction',
        metric: 'Stakeholder survey score',
        target: '>70%',
        measurementMethod: 'Survey',
        reviewDate: 'At 30, 60, 90 days',
      },
      {
        criterion: 'Implementation on schedule',
        metric: 'Milestone completion',
        target: '100% within 10% of plan',
        measurementMethod: 'Project tracking',
        reviewDate: 'Weekly',
      },
      {
        criterion: 'Budget adherence',
        metric: 'Actual vs. planned spend',
        target: 'Within 15% of budget',
        measurementMethod: 'Financial tracking',
        reviewDate: 'Monthly',
      },
    ];
  }

  // Helper methods

  private estimateMitigationCost(riskScore: number, baseCost: number): number {
    const riskMultiplier = riskScore > 70 ? 0.3 : riskScore > 40 ? 0.2 : 0.1;
    return Math.round(baseCost * riskMultiplier);
  }

  private estimateStrategyCost(riskScore: number, type: string): number {
    const baseCosts = {
      preventive: 5000,
      detective: 2000,
      corrective: 3000,
    };
    const base = baseCosts[type as keyof typeof baseCosts] || 3000;
    return Math.round(base * (riskScore / 50));
  }

  private getSeverityLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
    if (score >= 60) return 'critical';
    if (score >= 40) return 'high';
    if (score >= 20) return 'medium';
    return 'low';
  }

  private assignOwner(category: string): string {
    const ownerMap: Record<string, string> = {
      Operational: 'Operations Manager',
      People: 'HR Manager',
      Technical: 'IT Manager',
      Compliance: 'Compliance Officer',
      Strategic: 'Business Unit Head',
    };
    return ownerMap[category] || 'Project Manager';
  }

  private calculateResidualRisk(
    currentScore: number,
    strategies: RiskMitigation['strategies']
  ): number {
    let residual = currentScore;
    for (const strategy of strategies) {
      residual = residual * (1 - strategy.effectiveness / 100);
    }
    return Math.max(5, Math.round(residual));
  }
}

export default MitigationRecommender;
