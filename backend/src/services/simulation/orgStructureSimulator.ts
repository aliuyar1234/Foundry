/**
 * Organization Structure Simulator (T168)
 * Simulates the impact of organizational structure changes
 */

import { prisma } from '../../lib/prisma.js';
import { neo4jConnection } from '../../graph/connection';

export interface OrgStructureChange {
  type: 'team_merge' | 'team_split' | 'reporting_change' | 'department_restructure' | 'role_consolidation';
  sourceTeamId?: string;
  targetTeamId?: string;
  sourceDepartmentId?: string;
  targetDepartmentId?: string;
  affectedPersonIds?: string[];
  newManagerId?: string;
  newStructure?: {
    name: string;
    teams?: string[];
    manager?: string;
  };
}

export interface OrgStructureImpact {
  change: {
    type: string;
    description: string;
  };
  overallImpactScore: number;
  spanOfControlAnalysis: SpanOfControlAnalysis;
  communicationImpact: CommunicationImpact;
  teamDynamicsImpact: TeamDynamicsImpact;
  processImpact: ProcessImpact;
  knowledgeTransferImpact: KnowledgeTransferImpact;
  cultureRisk: CultureRisk;
  affectedPersonnel: AffectedPersonnel[];
  implementationPlan: ImplementationPlan;
  successMetrics: SuccessMetric[];
}

interface SpanOfControlAnalysis {
  currentSpan: Record<string, number>;
  projectedSpan: Record<string, number>;
  optimalRange: { min: number; max: number };
  outOfRangeManagers: Array<{
    managerId: string;
    managerName: string;
    currentDirects: number;
    projectedDirects: number;
    recommendation: string;
  }>;
  overallHealthScore: number;
}

interface CommunicationImpact {
  currentPathLength: number; // Average hops between people
  projectedPathLength: number;
  crossTeamDependencies: Array<{
    team1: string;
    team2: string;
    interactionFrequency: number;
    projectedImpact: 'improved' | 'unchanged' | 'degraded';
  }>;
  informationFlowRisk: number;
  bottleneckRisk: Array<{
    person: string;
    currentLoad: number;
    projectedLoad: number;
    risk: 'low' | 'medium' | 'high';
  }>;
}

interface TeamDynamicsImpact {
  teamsAffected: number;
  teamSizeChanges: Array<{
    teamId: string;
    teamName: string;
    currentSize: number;
    projectedSize: number;
    optimalSize: { min: number; max: number };
    healthIndicator: 'healthy' | 'at_risk' | 'critical';
  }>;
  teamCohesionRisk: number;
  leadershipGaps: string[];
  culturalIntegrationChallenges: string[];
}

interface ProcessImpact {
  affectedProcesses: Array<{
    processId: string;
    processName: string;
    currentOwnerTeam: string;
    projectedOwnerTeam: string;
    ownershipClarity: 'clear' | 'ambiguous' | 'orphaned';
    transitionRisk: 'low' | 'medium' | 'high';
  }>;
  crossFunctionalProcesses: number;
  handoffComplexityIncrease: number;
}

interface KnowledgeTransferImpact {
  knowledgeAreas: Array<{
    area: string;
    currentTeam: string;
    projectedTeam: string;
    transferComplexity: 'low' | 'medium' | 'high';
    documentationStatus: 'complete' | 'partial' | 'none';
    estimatedTransferTime: number; // days
  }>;
  criticalKnowledgeAtRisk: string[];
  transferPlan: Array<{
    from: string;
    to: string;
    knowledge: string;
    method: 'documentation' | 'shadowing' | 'training' | 'mentoring';
    duration: number;
  }>;
}

interface CultureRisk {
  overallRisk: number;
  factors: Array<{
    factor: string;
    risk: 'low' | 'medium' | 'high';
    mitigation: string;
  }>;
  engagementImpact: number; // -100 to +100
  turnoverRisk: number;
  changeReadiness: number;
}

interface AffectedPersonnel {
  id: string;
  name: string;
  currentTeam: string;
  projectedTeam: string;
  currentManager: string;
  projectedManager: string;
  roleChange: 'none' | 'minor' | 'significant';
  impactLevel: 'low' | 'medium' | 'high';
  supportNeeded: string[];
}

interface ImplementationPlan {
  phases: Array<{
    name: string;
    duration: number;
    activities: string[];
    stakeholders: string[];
    risks: string[];
  }>;
  totalDuration: number;
  criticalSuccessFactors: string[];
  communicationPlan: Array<{
    audience: string;
    message: string;
    channel: string;
    timing: string;
  }>;
  changeManagementActions: string[];
}

interface SuccessMetric {
  metric: string;
  baseline: number;
  target: number;
  measurementFrequency: string;
  owner: string;
}

export class OrgStructureSimulator {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Simulate the impact of an organizational structure change
   */
  async simulateChange(change: OrgStructureChange): Promise<OrgStructureImpact> {
    // Get current org structure data
    const orgData = await this.getOrgStructureData(change);

    // Analyze different impact areas
    const [
      spanOfControlAnalysis,
      communicationImpact,
      teamDynamicsImpact,
      processImpact,
      knowledgeTransferImpact,
      cultureRisk,
    ] = await Promise.all([
      this.analyzeSpanOfControl(change, orgData),
      this.analyzeCommunicationImpact(change, orgData),
      this.analyzeTeamDynamics(change, orgData),
      this.analyzeProcessImpact(change, orgData),
      this.analyzeKnowledgeTransfer(change, orgData),
      this.analyzeCultureRisk(change, orgData),
    ]);

    // Get affected personnel details
    const affectedPersonnel = await this.getAffectedPersonnel(change, orgData);

    // Generate implementation plan
    const implementationPlan = this.generateImplementationPlan(
      change,
      affectedPersonnel,
      cultureRisk
    );

    // Define success metrics
    const successMetrics = this.defineSuccessMetrics(change);

    // Calculate overall impact score
    const overallImpactScore = this.calculateOverallImpact({
      spanOfControlAnalysis,
      communicationImpact,
      teamDynamicsImpact,
      processImpact,
      cultureRisk,
    });

    return {
      change: {
        type: change.type,
        description: this.getChangeDescription(change),
      },
      overallImpactScore,
      spanOfControlAnalysis,
      communicationImpact,
      teamDynamicsImpact,
      processImpact,
      knowledgeTransferImpact,
      cultureRisk,
      affectedPersonnel,
      implementationPlan,
      successMetrics,
    };
  }

  /**
   * Get current organization structure data
   */
  private async getOrgStructureData(change: OrgStructureChange): Promise<{
    teams: Array<{ id: string; name: string; size: number; managerId: string }>;
    departments: Array<{ id: string; name: string; teams: string[] }>;
    managers: Array<{ id: string; name: string; directReports: number }>;
    reportingLines: Array<{ from: string; to: string }>;
  }> {
    const session = neo4jConnection.getSession();

    try {
      // Get teams
      const teamsResult = await session.run(
        `
        MATCH (t:Team {organizationId: $organizationId})
        OPTIONAL MATCH (p:Person)-[:BELONGS_TO]->(t)
        OPTIONAL MATCH (t)-[:MANAGED_BY]->(m:Person)
        WITH t, count(DISTINCT p) as size, m.id as managerId
        RETURN t.id as id, t.name as name, size, managerId
        `,
        { organizationId: this.organizationId }
      );

      const teams = teamsResult.records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        size: r.get('size').toNumber(),
        managerId: r.get('managerId'),
      }));

      // Get departments
      const deptsResult = await session.run(
        `
        MATCH (d:Department {organizationId: $organizationId})
        OPTIONAL MATCH (t:Team)-[:PART_OF]->(d)
        WITH d, collect(t.id) as teams
        RETURN d.id as id, d.name as name, teams
        `,
        { organizationId: this.organizationId }
      );

      const departments = deptsResult.records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        teams: r.get('teams') || [],
      }));

      // Get managers and their span of control
      const managersResult = await session.run(
        `
        MATCH (m:Person {organizationId: $organizationId})
        WHERE EXISTS { MATCH (p:Person)-[:REPORTS_TO]->(m) }
        OPTIONAL MATCH (p:Person)-[:REPORTS_TO]->(m)
        WITH m, count(DISTINCT p) as directReports
        RETURN m.id as id, m.name as name, directReports
        `,
        { organizationId: this.organizationId }
      );

      const managers = managersResult.records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        directReports: r.get('directReports').toNumber(),
      }));

      // Get reporting lines
      const reportingResult = await session.run(
        `
        MATCH (p:Person {organizationId: $organizationId})-[:REPORTS_TO]->(m:Person)
        RETURN p.id as from, m.id as to
        `,
        { organizationId: this.organizationId }
      );

      const reportingLines = reportingResult.records.map((r) => ({
        from: r.get('from'),
        to: r.get('to'),
      }));

      return { teams, departments, managers, reportingLines };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze span of control impact
   */
  private async analyzeSpanOfControl(
    change: OrgStructureChange,
    orgData: { managers: Array<{ id: string; name: string; directReports: number }> }
  ): Promise<SpanOfControlAnalysis> {
    const optimalRange = { min: 5, max: 10 };
    const currentSpan: Record<string, number> = {};
    const projectedSpan: Record<string, number> = {};
    const outOfRangeManagers: SpanOfControlAnalysis['outOfRangeManagers'] = [];

    // Calculate current span
    for (const manager of orgData.managers) {
      currentSpan[manager.id] = manager.directReports;
      projectedSpan[manager.id] = manager.directReports;
    }

    // Adjust projected span based on change type
    switch (change.type) {
      case 'team_merge':
        // Merged team manager gets more reports
        if (change.targetTeamId && orgData.managers.length > 0) {
          const targetManager = orgData.managers.find((m) => m.id === change.newManagerId);
          if (targetManager) {
            projectedSpan[targetManager.id] = (projectedSpan[targetManager.id] || 0) + 5;
          }
        }
        break;

      case 'team_split':
        // Original manager loses reports, new manager gains them
        if (change.sourceTeamId && change.newManagerId) {
          const currentManager = orgData.managers[0];
          if (currentManager) {
            projectedSpan[currentManager.id] = Math.floor((projectedSpan[currentManager.id] || 5) / 2);
            projectedSpan[change.newManagerId] = Math.ceil((currentSpan[currentManager.id] || 5) / 2);
          }
        }
        break;

      case 'reporting_change':
        // Direct reassignment of reports
        if (change.affectedPersonIds && change.newManagerId) {
          const affected = change.affectedPersonIds.length;
          // Reduce from current managers
          for (const managerId of Object.keys(currentSpan)) {
            projectedSpan[managerId] = Math.max(0, (projectedSpan[managerId] || 0) - Math.ceil(affected / orgData.managers.length));
          }
          // Add to new manager
          projectedSpan[change.newManagerId] = (projectedSpan[change.newManagerId] || 0) + affected;
        }
        break;
    }

    // Identify managers out of optimal range
    for (const manager of orgData.managers) {
      const projected = projectedSpan[manager.id] || 0;
      if (projected < optimalRange.min || projected > optimalRange.max) {
        outOfRangeManagers.push({
          managerId: manager.id,
          managerName: manager.name,
          currentDirects: currentSpan[manager.id] || 0,
          projectedDirects: projected,
          recommendation: projected < optimalRange.min
            ? 'Consider expanding responsibilities or team consolidation'
            : 'Consider adding team leads or splitting team',
        });
      }
    }

    // Calculate health score
    const healthyManagers = orgData.managers.filter((m) => {
      const span = projectedSpan[m.id] || 0;
      return span >= optimalRange.min && span <= optimalRange.max;
    }).length;
    const overallHealthScore = (healthyManagers / Math.max(orgData.managers.length, 1)) * 100;

    return {
      currentSpan,
      projectedSpan,
      optimalRange,
      outOfRangeManagers,
      overallHealthScore: Math.round(overallHealthScore),
    };
  }

  /**
   * Analyze communication impact
   */
  private async analyzeCommunicationImpact(
    change: OrgStructureChange,
    orgData: { teams: Array<{ id: string; name: string }> }
  ): Promise<CommunicationImpact> {
    const session = neo4jConnection.getSession();

    try {
      // Get cross-team communication patterns
      const commResult = await session.run(
        `
        MATCH (t1:Team {organizationId: $organizationId})<-[:BELONGS_TO]-(p1:Person)
              -[c:COMMUNICATES_WITH]-(p2:Person)-[:BELONGS_TO]->(t2:Team)
        WHERE t1 <> t2
        WITH t1, t2, count(c) as interactions
        RETURN t1.name as team1, t2.name as team2, interactions
        ORDER BY interactions DESC
        LIMIT 10
        `,
        { organizationId: this.organizationId }
      );

      const crossTeamDependencies: CommunicationImpact['crossTeamDependencies'] = [];
      for (const record of commResult.records) {
        let projectedImpact: 'improved' | 'unchanged' | 'degraded' = 'unchanged';

        // Determine impact based on change type
        if (change.type === 'team_merge') {
          // If teams being merged communicate frequently, impact is improved
          if (record.get('team1') === change.sourceTeamId || record.get('team2') === change.sourceTeamId) {
            projectedImpact = 'improved';
          }
        } else if (change.type === 'team_split') {
          // Splitting may degrade communication within original team
          if (record.get('team1') === change.sourceTeamId || record.get('team2') === change.sourceTeamId) {
            projectedImpact = 'degraded';
          }
        }

        crossTeamDependencies.push({
          team1: record.get('team1'),
          team2: record.get('team2'),
          interactionFrequency: record.get('interactions').toNumber(),
          projectedImpact,
        });
      }

      // Estimate communication path changes
      const currentPathLength = 2.5; // Average hops (simplified)
      let projectedPathLength = currentPathLength;

      switch (change.type) {
        case 'team_merge':
          projectedPathLength = currentPathLength * 0.9; // Shorter paths
          break;
        case 'team_split':
          projectedPathLength = currentPathLength * 1.15; // Longer paths
          break;
        case 'department_restructure':
          projectedPathLength = currentPathLength * 1.1; // Moderate increase
          break;
      }

      // Information flow risk
      const informationFlowRisk = change.type === 'department_restructure' ? 60 :
        change.type === 'team_split' ? 45 : 25;

      // Bottleneck analysis
      const bottleneckRisk: CommunicationImpact['bottleneckRisk'] = [];
      if (change.newManagerId) {
        bottleneckRisk.push({
          person: change.newManagerId,
          currentLoad: 50,
          projectedLoad: 75,
          risk: 'medium',
        });
      }

      return {
        currentPathLength,
        projectedPathLength: Math.round(projectedPathLength * 10) / 10,
        crossTeamDependencies,
        informationFlowRisk,
        bottleneckRisk,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze team dynamics impact
   */
  private async analyzeTeamDynamics(
    change: OrgStructureChange,
    orgData: { teams: Array<{ id: string; name: string; size: number }> }
  ): Promise<TeamDynamicsImpact> {
    const optimalTeamSize = { min: 5, max: 12 };
    const teamSizeChanges: TeamDynamicsImpact['teamSizeChanges'] = [];
    const leadershipGaps: string[] = [];
    const culturalIntegrationChallenges: string[] = [];

    // Analyze team size changes
    for (const team of orgData.teams) {
      let projectedSize = team.size;

      if (change.type === 'team_merge' && team.id === change.targetTeamId) {
        const sourceTeam = orgData.teams.find((t) => t.id === change.sourceTeamId);
        projectedSize = team.size + (sourceTeam?.size || 0);
      } else if (change.type === 'team_split' && team.id === change.sourceTeamId) {
        projectedSize = Math.floor(team.size / 2);
      }

      const healthIndicator = projectedSize >= optimalTeamSize.min && projectedSize <= optimalTeamSize.max
        ? 'healthy'
        : projectedSize < optimalTeamSize.min - 2 || projectedSize > optimalTeamSize.max + 5
        ? 'critical'
        : 'at_risk';

      teamSizeChanges.push({
        teamId: team.id,
        teamName: team.name,
        currentSize: team.size,
        projectedSize,
        optimalSize: optimalTeamSize,
        healthIndicator,
      });
    }

    // Identify leadership gaps and culture challenges
    switch (change.type) {
      case 'team_merge':
        leadershipGaps.push('Need to define leadership structure for merged team');
        culturalIntegrationChallenges.push('Different team cultures need to be reconciled');
        culturalIntegrationChallenges.push('Potential loss of team identity');
        break;

      case 'team_split':
        leadershipGaps.push('New team requires leadership appointment');
        culturalIntegrationChallenges.push('Split team members may feel disconnected');
        break;

      case 'department_restructure':
        leadershipGaps.push('Department leadership alignment needed');
        culturalIntegrationChallenges.push('Cross-functional coordination patterns disrupted');
        culturalIntegrationChallenges.push('Reporting relationships uncertainty');
        break;
    }

    // Calculate team cohesion risk
    const atRiskTeams = teamSizeChanges.filter((t) => t.healthIndicator !== 'healthy').length;
    const teamCohesionRisk = (atRiskTeams / Math.max(teamSizeChanges.length, 1)) * 100;

    return {
      teamsAffected: teamSizeChanges.filter((t) => t.currentSize !== t.projectedSize).length,
      teamSizeChanges,
      teamCohesionRisk: Math.round(teamCohesionRisk),
      leadershipGaps,
      culturalIntegrationChallenges,
    };
  }

  /**
   * Analyze process impact
   */
  private async analyzeProcessImpact(
    change: OrgStructureChange,
    orgData: { teams: Array<{ id: string; name: string }> }
  ): Promise<ProcessImpact> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (t:Team {organizationId: $organizationId})<-[:BELONGS_TO]-(p:Person)
              -[:OWNS|PARTICIPATES_IN]->(proc:Process)
        WITH t, proc, count(DISTINCT p) as participants
        RETURN t.id as teamId, t.name as teamName, proc.id as processId,
               proc.name as processName, participants
        ORDER BY participants DESC
        `,
        { organizationId: this.organizationId }
      );

      const affectedProcesses: ProcessImpact['affectedProcesses'] = [];
      const processTeamMap = new Map<string, string>();

      for (const record of result.records) {
        const processId = record.get('processId');
        const teamId = record.get('teamId');

        if (!processTeamMap.has(processId)) {
          processTeamMap.set(processId, teamId);

          let projectedOwnerTeam = teamId;
          let ownershipClarity: 'clear' | 'ambiguous' | 'orphaned' = 'clear';
          let transitionRisk: 'low' | 'medium' | 'high' = 'low';

          // Determine impact based on change
          if (change.type === 'team_merge' && teamId === change.sourceTeamId) {
            projectedOwnerTeam = change.targetTeamId || teamId;
            ownershipClarity = 'ambiguous';
            transitionRisk = 'medium';
          } else if (change.type === 'team_split' && teamId === change.sourceTeamId) {
            ownershipClarity = 'ambiguous';
            transitionRisk = 'high';
          }

          affectedProcesses.push({
            processId,
            processName: record.get('processName'),
            currentOwnerTeam: record.get('teamName'),
            projectedOwnerTeam,
            ownershipClarity,
            transitionRisk,
          });
        }
      }

      // Count cross-functional processes
      const crossFunctionalProcesses = affectedProcesses.filter(
        (p) => p.ownershipClarity === 'ambiguous'
      ).length;

      // Calculate handoff complexity
      const handoffComplexityIncrease = change.type === 'team_split' ? 30 :
        change.type === 'department_restructure' ? 20 : 10;

      return {
        affectedProcesses,
        crossFunctionalProcesses,
        handoffComplexityIncrease,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze knowledge transfer impact
   */
  private async analyzeKnowledgeTransfer(
    change: OrgStructureChange,
    orgData: { teams: Array<{ id: string; name: string }> }
  ): Promise<KnowledgeTransferImpact> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (t:Team {organizationId: $organizationId})<-[:BELONGS_TO]-(p:Person)
              -[:HAS_EXPERTISE]->(k:Knowledge)
        WITH t, k, count(DISTINCT p) as experts
        RETURN t.id as teamId, t.name as teamName, k.name as knowledge,
               k.documented as documented, experts
        `,
        { organizationId: this.organizationId }
      );

      const knowledgeAreas: KnowledgeTransferImpact['knowledgeAreas'] = [];
      const criticalKnowledgeAtRisk: string[] = [];
      const transferPlan: KnowledgeTransferImpact['transferPlan'] = [];

      for (const record of result.records) {
        const teamId = record.get('teamId');
        const knowledge = record.get('knowledge');
        const documented = record.get('documented');
        const experts = record.get('experts').toNumber();

        let projectedTeam = teamId;
        let transferComplexity: 'low' | 'medium' | 'high' = 'low';

        if (change.type === 'team_merge' && teamId === change.sourceTeamId) {
          projectedTeam = change.targetTeamId || teamId;
          transferComplexity = documented ? 'medium' : 'high';
        } else if (change.type === 'team_split' && teamId === change.sourceTeamId) {
          transferComplexity = experts === 1 ? 'high' : 'medium';
        }

        knowledgeAreas.push({
          area: knowledge,
          currentTeam: record.get('teamName'),
          projectedTeam,
          transferComplexity,
          documentationStatus: documented ? 'complete' : experts > 1 ? 'partial' : 'none',
          estimatedTransferTime: transferComplexity === 'high' ? 30 : transferComplexity === 'medium' ? 14 : 5,
        });

        // Identify critical knowledge at risk
        if (experts === 1 && !documented && transferComplexity === 'high') {
          criticalKnowledgeAtRisk.push(knowledge);

          transferPlan.push({
            from: record.get('teamName'),
            to: projectedTeam,
            knowledge,
            method: 'shadowing',
            duration: 20,
          });
        }
      }

      return {
        knowledgeAreas,
        criticalKnowledgeAtRisk,
        transferPlan,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze culture risk
   */
  private async analyzeCultureRisk(
    change: OrgStructureChange,
    _orgData: { teams: Array<{ id: string; name: string; size: number }> }
  ): Promise<CultureRisk> {
    const factors: CultureRisk['factors'] = [];

    // Common risk factors based on change type
    switch (change.type) {
      case 'team_merge':
        factors.push({
          factor: 'Team identity loss',
          risk: 'high',
          mitigation: 'Create inclusive team-building activities and shared goals',
        });
        factors.push({
          factor: 'Power dynamics shift',
          risk: 'medium',
          mitigation: 'Clear role definitions and equitable opportunity distribution',
        });
        break;

      case 'team_split':
        factors.push({
          factor: 'Relationship disruption',
          risk: 'medium',
          mitigation: 'Maintain informal communication channels',
        });
        factors.push({
          factor: 'New team culture uncertainty',
          risk: 'medium',
          mitigation: 'Early culture-setting activities for new team',
        });
        break;

      case 'department_restructure':
        factors.push({
          factor: 'Strategic direction uncertainty',
          risk: 'high',
          mitigation: 'Clear communication of vision and goals',
        });
        factors.push({
          factor: 'Career path concerns',
          risk: 'high',
          mitigation: 'Individual career discussions and development plans',
        });
        factors.push({
          factor: 'Job security fears',
          risk: 'medium',
          mitigation: 'Transparent communication about roles',
        });
        break;

      case 'reporting_change':
        factors.push({
          factor: 'Manager relationship change',
          risk: 'medium',
          mitigation: 'Structured transition and onboarding with new manager',
        });
        break;
    }

    // Calculate overall risk
    const riskScores = factors.map((f) => f.risk === 'high' ? 3 : f.risk === 'medium' ? 2 : 1);
    const overallRisk = (riskScores.reduce((a, b) => a + b, 0) / (factors.length * 3)) * 100;

    // Engagement and turnover impact
    const engagementImpact = change.type === 'department_restructure' ? -25 :
      change.type === 'team_merge' ? -15 : -10;
    const turnoverRisk = overallRisk * 0.4;
    const changeReadiness = 100 - overallRisk;

    return {
      overallRisk: Math.round(overallRisk),
      factors,
      engagementImpact,
      turnoverRisk: Math.round(turnoverRisk),
      changeReadiness: Math.round(changeReadiness),
    };
  }

  /**
   * Get affected personnel details
   */
  private async getAffectedPersonnel(
    change: OrgStructureChange,
    orgData: { teams: Array<{ id: string; name: string }> }
  ): Promise<AffectedPersonnel[]> {
    const session = neo4jConnection.getSession();

    try {
      let teamFilter = '';
      const params: Record<string, string> = { organizationId: this.organizationId };

      if (change.sourceTeamId) {
        teamFilter = 'AND t.id = $teamId';
        params.teamId = change.sourceTeamId;
      }

      const result = await session.run(
        `
        MATCH (p:Person {organizationId: $organizationId})-[:BELONGS_TO]->(t:Team)
        WHERE 1=1 ${teamFilter}
        OPTIONAL MATCH (p)-[:REPORTS_TO]->(m:Person)
        RETURN p.id as id, p.name as name, t.name as teamName,
               m.id as managerId, m.name as managerName
        `,
        params
      );

      return result.records.map((record) => {
        const currentTeam = record.get('teamName');
        let projectedTeam = currentTeam;
        let projectedManager = record.get('managerName') || 'TBD';
        let roleChange: 'none' | 'minor' | 'significant' = 'none';
        let impactLevel: 'low' | 'medium' | 'high' = 'low';
        const supportNeeded: string[] = [];

        switch (change.type) {
          case 'team_merge':
            projectedTeam = change.newStructure?.name || 'Merged Team';
            if (change.newManagerId) {
              projectedManager = 'New Manager';
              roleChange = 'minor';
              impactLevel = 'medium';
              supportNeeded.push('Team integration support');
            }
            break;

          case 'team_split':
            roleChange = 'minor';
            impactLevel = 'medium';
            supportNeeded.push('New team onboarding');
            break;

          case 'department_restructure':
            roleChange = 'significant';
            impactLevel = 'high';
            supportNeeded.push('Role clarification');
            supportNeeded.push('Career path discussion');
            break;

          case 'reporting_change':
            if (change.newManagerId) {
              projectedManager = 'New Manager';
              impactLevel = 'medium';
              supportNeeded.push('Manager transition support');
            }
            break;
        }

        return {
          id: record.get('id'),
          name: record.get('name') || 'Unknown',
          currentTeam,
          projectedTeam,
          currentManager: record.get('managerName') || 'Unknown',
          projectedManager,
          roleChange,
          impactLevel,
          supportNeeded,
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Generate implementation plan
   */
  private generateImplementationPlan(
    change: OrgStructureChange,
    affectedPersonnel: AffectedPersonnel[],
    cultureRisk: CultureRisk
  ): ImplementationPlan {
    const phases: ImplementationPlan['phases'] = [];

    // Phase 1: Planning
    phases.push({
      name: 'Planning & Preparation',
      duration: 14,
      activities: [
        'Finalize organizational design',
        'Define roles and responsibilities',
        'Develop communication plan',
        'Prepare FAQs and talking points',
      ],
      stakeholders: ['HR', 'Leadership', 'Affected Managers'],
      risks: ['Premature information leak'],
    });

    // Phase 2: Communication
    phases.push({
      name: 'Announcement & Communication',
      duration: 7,
      activities: [
        'Leadership alignment meeting',
        'All-hands announcement',
        'Team-specific discussions',
        'Q&A sessions',
      ],
      stakeholders: ['All affected employees', 'HR', 'Communications'],
      risks: ['Negative reaction', 'Misinformation'],
    });

    // Phase 3: Transition
    const transitionDuration = change.type === 'department_restructure' ? 30 :
      change.type === 'team_merge' ? 21 : 14;
    phases.push({
      name: 'Transition',
      duration: transitionDuration,
      activities: [
        'Update systems and access',
        'Transfer responsibilities',
        'Knowledge transfer sessions',
        'New team integration activities',
      ],
      stakeholders: ['IT', 'Affected teams', 'HR'],
      risks: ['Knowledge loss', 'Productivity dip'],
    });

    // Phase 4: Stabilization
    phases.push({
      name: 'Stabilization & Support',
      duration: 30,
      activities: [
        'Regular check-ins',
        'Address emerging issues',
        'Reinforce new ways of working',
        'Celebrate early wins',
      ],
      stakeholders: ['Managers', 'HR', 'Employees'],
      risks: ['Reversion to old patterns'],
    });

    // Calculate total duration
    const totalDuration = phases.reduce((sum, p) => sum + p.duration, 0);

    // Critical success factors
    const criticalSuccessFactors = [
      'Clear and consistent communication',
      'Leadership visibility and support',
      'Quick wins identification',
      'Regular feedback collection',
      'Address concerns promptly',
    ];

    // Communication plan
    const communicationPlan: ImplementationPlan['communicationPlan'] = [
      {
        audience: 'All employees',
        message: 'Overview of changes and rationale',
        channel: 'All-hands meeting + Email',
        timing: 'Day 1 of announcement phase',
      },
      {
        audience: 'Directly affected teams',
        message: 'Specific impacts and support available',
        channel: 'Team meetings',
        timing: 'Day 1-2 of announcement phase',
      },
      {
        audience: 'Managers',
        message: 'Leading through change guidance',
        channel: 'Manager workshop',
        timing: 'Before announcement',
      },
    ];

    // Change management actions
    const changeManagementActions = cultureRisk.factors.map((f) => f.mitigation);

    return {
      phases,
      totalDuration,
      criticalSuccessFactors,
      communicationPlan,
      changeManagementActions,
    };
  }

  /**
   * Define success metrics
   */
  private defineSuccessMetrics(change: OrgStructureChange): SuccessMetric[] {
    const metrics: SuccessMetric[] = [
      {
        metric: 'Employee Engagement Score',
        baseline: 70,
        target: 68, // Allow slight dip
        measurementFrequency: 'Quarterly',
        owner: 'HR',
      },
      {
        metric: 'Voluntary Turnover Rate',
        baseline: 12,
        target: 15, // Allow slight increase
        measurementFrequency: 'Monthly',
        owner: 'HR',
      },
      {
        metric: 'Process Cycle Time',
        baseline: 100,
        target: 95, // 5% improvement target
        measurementFrequency: 'Monthly',
        owner: 'Operations',
      },
    ];

    if (change.type === 'team_merge') {
      metrics.push({
        metric: 'Team Collaboration Score',
        baseline: 0,
        target: 70,
        measurementFrequency: 'Monthly',
        owner: 'Team Lead',
      });
    }

    if (change.type === 'department_restructure') {
      metrics.push({
        metric: 'Strategic Alignment Score',
        baseline: 60,
        target: 80,
        measurementFrequency: 'Quarterly',
        owner: 'Leadership',
      });
    }

    return metrics;
  }

  /**
   * Get change description
   */
  private getChangeDescription(change: OrgStructureChange): string {
    switch (change.type) {
      case 'team_merge':
        return 'Merge teams into a single unit';
      case 'team_split':
        return 'Split team into multiple units';
      case 'reporting_change':
        return 'Change reporting relationships';
      case 'department_restructure':
        return 'Restructure department organization';
      case 'role_consolidation':
        return 'Consolidate overlapping roles';
      default:
        return 'Organizational structure change';
    }
  }

  /**
   * Calculate overall impact score
   */
  private calculateOverallImpact(metrics: {
    spanOfControlAnalysis: SpanOfControlAnalysis;
    communicationImpact: CommunicationImpact;
    teamDynamicsImpact: TeamDynamicsImpact;
    processImpact: ProcessImpact;
    cultureRisk: CultureRisk;
  }): number {
    // Weight different factors
    const spanWeight = 0.15;
    const commWeight = 0.20;
    const teamWeight = 0.25;
    const processWeight = 0.15;
    const cultureWeight = 0.25;

    // Normalize scores (lower is better for risks)
    const spanScore = metrics.spanOfControlAnalysis.overallHealthScore;
    const commScore = 100 - metrics.communicationImpact.informationFlowRisk;
    const teamScore = 100 - metrics.teamDynamicsImpact.teamCohesionRisk;
    const processScore = 100 - (metrics.processImpact.handoffComplexityIncrease);
    const cultureScore = 100 - metrics.cultureRisk.overallRisk;

    const weightedScore =
      spanScore * spanWeight +
      commScore * commWeight +
      teamScore * teamWeight +
      processScore * processWeight +
      cultureScore * cultureWeight;

    return Math.round(weightedScore);
  }
}

export default OrgStructureSimulator;
