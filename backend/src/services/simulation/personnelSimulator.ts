/**
 * Personnel Change Simulator (T166)
 * Simulates the impact of personnel changes on the organization
 */

import { PrismaClient } from '@prisma/client';
import { neo4jConnection } from '../../graph/connection';

const prisma = new PrismaClient();

export interface PersonnelChange {
  type: 'departure' | 'absence' | 'role_change' | 'team_transfer';
  personId: string;
  targetRoleId?: string;
  targetTeamId?: string;
  startDate?: Date;
  endDate?: Date;
  probability?: number; // For scenario planning
}

export interface PersonnelImpact {
  person: {
    id: string;
    name: string;
    email: string;
    role: string;
    department: string;
  };
  changeType: string;
  overallRiskScore: number;
  impactAreas: {
    knowledgeLoss: KnowledgeLossImpact;
    processDisruption: ProcessDisruptionImpact;
    teamDynamics: TeamDynamicsImpact;
    projectRisk: ProjectRiskImpact;
    communicationGaps: CommunicationGapImpact;
  };
  affectedProcesses: AffectedProcess[];
  affectedTeamMembers: AffectedTeamMember[];
  criticalDependencies: CriticalDependency[];
  estimatedRecoveryTime: {
    minimum: number; // days
    expected: number;
    maximum: number;
  };
  costEstimate: {
    directCosts: number;
    indirectCosts: number;
    opportunityCosts: number;
    total: number;
    currency: string;
  };
}

interface KnowledgeLossImpact {
  score: number;
  uniqueKnowledgeAreas: string[];
  documentedKnowledge: number; // percentage
  transferableKnowledge: number; // percentage
  criticalUndocumented: string[];
}

interface ProcessDisruptionImpact {
  score: number;
  affectedProcessCount: number;
  criticalProcesses: string[];
  bottleneckRisk: number;
  estimatedDelays: Record<string, number>; // process -> days
}

interface TeamDynamicsImpact {
  score: number;
  teamSize: number;
  teamMoraleRisk: number;
  workloadIncrease: Record<string, number>; // person -> percentage
  coverageGaps: string[];
}

interface ProjectRiskImpact {
  score: number;
  activeProjects: number;
  delayedProjects: string[];
  atRiskDeliverables: string[];
  estimatedDelays: Record<string, number>; // project -> days
}

interface CommunicationGapImpact {
  score: number;
  bridgingRoles: number;
  disconnectedTeams: string[];
  externalRelationships: number;
  internalNetworkCentrality: number;
}

interface AffectedProcess {
  id: string;
  name: string;
  role: 'owner' | 'participant' | 'reviewer' | 'approver';
  frequency: number;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  alternativeCoverage: boolean;
}

interface AffectedTeamMember {
  id: string;
  name: string;
  relationship: 'direct_report' | 'manager' | 'peer' | 'collaborator';
  interactionStrength: number;
  additionalLoadPercent: number;
}

interface CriticalDependency {
  type: 'knowledge' | 'approval' | 'access' | 'relationship';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigationAvailable: boolean;
  mitigationCost?: number;
}

export class PersonnelSimulator {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Simulate the impact of one or more personnel changes
   */
  async simulateChanges(changes: PersonnelChange[]): Promise<PersonnelImpact[]> {
    const impacts: PersonnelImpact[] = [];

    for (const change of changes) {
      const impact = await this.simulateSingleChange(change);
      impacts.push(impact);
    }

    return impacts;
  }

  /**
   * Simulate a single personnel change
   */
  async simulateSingleChange(change: PersonnelChange): Promise<PersonnelImpact> {
    // Get person details from graph
    const personData = await this.getPersonData(change.personId);

    // Analyze different impact areas in parallel
    const [
      knowledgeLoss,
      processDisruption,
      teamDynamics,
      projectRisk,
      communicationGaps,
    ] = await Promise.all([
      this.analyzeKnowledgeLoss(change.personId),
      this.analyzeProcessDisruption(change.personId, change.type),
      this.analyzeTeamDynamics(change.personId, change.type),
      this.analyzeProjectRisk(change.personId),
      this.analyzeCommunicationGaps(change.personId),
    ]);

    // Get affected processes and team members
    const [affectedProcesses, affectedTeamMembers, criticalDependencies] = await Promise.all([
      this.getAffectedProcesses(change.personId),
      this.getAffectedTeamMembers(change.personId),
      this.getCriticalDependencies(change.personId),
    ]);

    // Calculate overall risk score
    const overallRiskScore = this.calculateOverallRisk({
      knowledgeLoss,
      processDisruption,
      teamDynamics,
      projectRisk,
      communicationGaps,
    });

    // Estimate recovery time
    const estimatedRecoveryTime = this.estimateRecoveryTime({
      knowledgeLoss,
      processDisruption,
      changeType: change.type,
    });

    // Calculate cost estimate
    const costEstimate = this.calculateCostEstimate({
      personData,
      overallRiskScore,
      estimatedRecoveryTime,
      affectedProcesses,
      changeType: change.type,
    });

    return {
      person: {
        id: personData.id,
        name: personData.name,
        email: personData.email,
        role: personData.role,
        department: personData.department,
      },
      changeType: change.type,
      overallRiskScore,
      impactAreas: {
        knowledgeLoss,
        processDisruption,
        teamDynamics,
        projectRisk,
        communicationGaps,
      },
      affectedProcesses,
      affectedTeamMembers,
      criticalDependencies,
      estimatedRecoveryTime,
      costEstimate,
    };
  }

  /**
   * Get person data from the knowledge graph
   */
  private async getPersonData(personId: string): Promise<{
    id: string;
    name: string;
    email: string;
    role: string;
    department: string;
    salary?: number;
  }> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        OPTIONAL MATCH (p)-[:BELONGS_TO]->(d:Department)
        RETURN p.id as id, p.name as name, p.email as email,
               p.role as role, d.name as department, p.salary as salary
        `,
        { personId, organizationId: this.organizationId }
      );

      if (result.records.length === 0) {
        throw new Error(`Person not found: ${personId}`);
      }

      const record = result.records[0];
      return {
        id: record.get('id'),
        name: record.get('name') || 'Unknown',
        email: record.get('email') || '',
        role: record.get('role') || 'Unknown',
        department: record.get('department') || 'Unknown',
        salary: record.get('salary'),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze knowledge loss impact
   */
  private async analyzeKnowledgeLoss(personId: string): Promise<KnowledgeLossImpact> {
    const session = neo4jConnection.getSession();

    try {
      // Find unique knowledge areas
      const knowledgeResult = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        OPTIONAL MATCH (p)-[:HAS_EXPERTISE]->(k:Knowledge)
        OPTIONAL MATCH (p)-[:OWNS]->(doc:Document)
        OPTIONAL MATCH (other:Person)-[:HAS_EXPERTISE]->(k)
        WHERE other.id <> p.id
        WITH p, k, doc, count(DISTINCT other) as othersWithKnowledge
        RETURN collect(DISTINCT {
          area: k.name,
          isUnique: othersWithKnowledge = 0,
          documented: k.documented
        }) as knowledgeAreas,
        count(DISTINCT doc) as documentCount
        `,
        { personId, organizationId: this.organizationId }
      );

      const record = knowledgeResult.records[0];
      const knowledgeAreas = record?.get('knowledgeAreas') || [];

      const uniqueAreas = knowledgeAreas
        .filter((k: { isUnique: boolean }) => k.isUnique)
        .map((k: { area: string }) => k.area)
        .filter(Boolean);

      const documentedCount = knowledgeAreas.filter(
        (k: { documented: boolean }) => k.documented
      ).length;
      const totalAreas = knowledgeAreas.length || 1;

      const documentedKnowledge = (documentedCount / totalAreas) * 100;
      const transferableKnowledge = Math.max(0, documentedKnowledge - 10); // 10% buffer

      const criticalUndocumented = uniqueAreas.filter(
        (_: string, i: number) => !knowledgeAreas[i]?.documented
      );

      // Calculate score based on unique knowledge and documentation
      const uniquenessScore = uniqueAreas.length > 0 ? Math.min(100, uniqueAreas.length * 20) : 0;
      const documentationPenalty = (100 - documentedKnowledge) * 0.5;
      const score = Math.min(100, uniquenessScore + documentationPenalty);

      return {
        score,
        uniqueKnowledgeAreas: uniqueAreas,
        documentedKnowledge,
        transferableKnowledge,
        criticalUndocumented,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze process disruption impact
   */
  private async analyzeProcessDisruption(
    personId: string,
    changeType: PersonnelChange['type']
  ): Promise<ProcessDisruptionImpact> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        MATCH (p)-[r:PARTICIPATES_IN|OWNS|APPROVES]->(proc:Process)
        OPTIONAL MATCH (other:Person)-[:PARTICIPATES_IN|OWNS|APPROVES]->(proc)
        WHERE other.id <> p.id
        WITH proc, type(r) as role, count(DISTINCT other) as alternativeCount,
             proc.criticality as criticality, proc.frequency as frequency
        RETURN proc.id as id, proc.name as name, role, criticality, frequency,
               alternativeCount > 0 as hasAlternative
        `,
        { personId, organizationId: this.organizationId }
      );

      const processes = result.records.map((record) => ({
        id: record.get('id'),
        name: record.get('name'),
        role: record.get('role'),
        criticality: record.get('criticality') || 'medium',
        frequency: record.get('frequency') || 1,
        hasAlternative: record.get('hasAlternative'),
      }));

      const criticalProcesses = processes
        .filter((p) => p.criticality === 'high' || p.criticality === 'critical')
        .map((p) => p.name);

      const processesWithoutCoverage = processes.filter((p) => !p.hasAlternative);
      const bottleneckRisk = (processesWithoutCoverage.length / Math.max(processes.length, 1)) * 100;

      // Calculate estimated delays based on change type and criticality
      const estimatedDelays: Record<string, number> = {};
      for (const proc of processes) {
        const baseDays = changeType === 'departure' ? 14 : changeType === 'absence' ? 3 : 7;
        const criticalityMultiplier =
          proc.criticality === 'critical' ? 2 :
          proc.criticality === 'high' ? 1.5 :
          proc.criticality === 'medium' ? 1 : 0.5;
        const coverageMultiplier = proc.hasAlternative ? 0.5 : 1.5;

        estimatedDelays[proc.name] = Math.round(baseDays * criticalityMultiplier * coverageMultiplier);
      }

      // Calculate score
      const criticalWeight = criticalProcesses.length * 20;
      const coverageWeight = bottleneckRisk * 0.5;
      const score = Math.min(100, criticalWeight + coverageWeight);

      return {
        score,
        affectedProcessCount: processes.length,
        criticalProcesses,
        bottleneckRisk,
        estimatedDelays,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze team dynamics impact
   */
  private async analyzeTeamDynamics(
    personId: string,
    changeType: PersonnelChange['type']
  ): Promise<TeamDynamicsImpact> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        OPTIONAL MATCH (p)-[:BELONGS_TO]->(team:Team)
        OPTIONAL MATCH (teammate:Person)-[:BELONGS_TO]->(team)
        WHERE teammate.id <> p.id
        OPTIONAL MATCH (p)-[collab:COLLABORATES_WITH]-(teammate)
        WITH p, team, collect(DISTINCT {
          id: teammate.id,
          name: teammate.name,
          strength: collab.strength
        }) as teammates
        RETURN team.name as teamName, size(teammates) as teamSize, teammates,
               p.workload as personWorkload
        `,
        { personId, organizationId: this.organizationId }
      );

      const record = result.records[0];
      const teamSize = record?.get('teamSize') || 1;
      const teammates = record?.get('teammates') || [];
      const personWorkload = record?.get('personWorkload') || 100;

      // Calculate workload distribution
      const workloadIncrease: Record<string, number> = {};
      const workloadPerPerson = personWorkload / Math.max(teamSize, 1);

      for (const teammate of teammates) {
        if (teammate.id) {
          // Weight by collaboration strength
          const strengthWeight = teammate.strength || 0.5;
          workloadIncrease[teammate.name || teammate.id] = Math.round(
            workloadPerPerson * strengthWeight * (changeType === 'departure' ? 1.5 : 1)
          );
        }
      }

      // Identify coverage gaps
      const coverageGaps: string[] = [];
      if (teamSize <= 2) {
        coverageGaps.push('Small team with limited redundancy');
      }
      if (changeType === 'departure') {
        coverageGaps.push('Permanent knowledge gap');
      }

      // Calculate morale risk
      const teamMoraleRisk = Math.min(
        100,
        (changeType === 'departure' ? 40 : 20) +
        (teamSize <= 3 ? 30 : 0) +
        (Object.values(workloadIncrease).some((w) => w > 30) ? 30 : 0)
      );

      // Calculate score
      const score = Math.min(
        100,
        teamMoraleRisk * 0.4 +
        (Object.values(workloadIncrease).reduce((a, b) => a + b, 0) / Math.max(teamSize, 1)) * 0.3 +
        coverageGaps.length * 15
      );

      return {
        score,
        teamSize,
        teamMoraleRisk,
        workloadIncrease,
        coverageGaps,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze project risk impact
   */
  private async analyzeProjectRisk(personId: string): Promise<ProjectRiskImpact> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        OPTIONAL MATCH (p)-[r:WORKS_ON]->(proj:Project)
        WHERE proj.status IN ['active', 'in_progress']
        RETURN proj.id as id, proj.name as name, proj.deadline as deadline,
               proj.criticality as criticality, r.role as role,
               proj.deliverables as deliverables
        `,
        { personId, organizationId: this.organizationId }
      );

      const projects = result.records
        .filter((r) => r.get('id'))
        .map((record) => ({
          id: record.get('id'),
          name: record.get('name'),
          deadline: record.get('deadline'),
          criticality: record.get('criticality') || 'medium',
          role: record.get('role'),
          deliverables: record.get('deliverables') || [],
        }));

      const delayedProjects = projects
        .filter((p) => p.role === 'lead' || p.role === 'critical')
        .map((p) => p.name);

      const atRiskDeliverables = projects
        .flatMap((p) => p.deliverables)
        .slice(0, 10);

      // Estimate delays per project
      const estimatedDelays: Record<string, number> = {};
      for (const proj of projects) {
        const roleImpact = proj.role === 'lead' ? 21 : proj.role === 'critical' ? 14 : 7;
        estimatedDelays[proj.name] = roleImpact;
      }

      // Calculate score
      const score = Math.min(
        100,
        projects.length * 10 +
        delayedProjects.length * 20 +
        atRiskDeliverables.length * 5
      );

      return {
        score,
        activeProjects: projects.length,
        delayedProjects,
        atRiskDeliverables,
        estimatedDelays,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze communication gap impact
   */
  private async analyzeCommunicationGaps(personId: string): Promise<CommunicationGapImpact> {
    const session = neo4jConnection.getSession();

    try {
      // Calculate network centrality and bridging roles
      const result = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})

        // Count direct connections
        OPTIONAL MATCH (p)-[comm:COMMUNICATES_WITH]-(other:Person)
        WITH p, count(DISTINCT other) as directConnections, collect(DISTINCT other) as connections

        // Find bridging role (connects otherwise disconnected teams)
        OPTIONAL MATCH (p)-[:BELONGS_TO]->(myTeam:Team)
        OPTIONAL MATCH (conn)-[:BELONGS_TO]->(otherTeam:Team)
        WHERE conn IN connections AND otherTeam <> myTeam
        WITH p, directConnections, connections, collect(DISTINCT otherTeam.name) as bridgedTeams

        // External relationships
        OPTIONAL MATCH (p)-[:COMMUNICATES_WITH]->(ext:ExternalContact)

        RETURN directConnections, size(bridgedTeams) as bridgingRoles,
               bridgedTeams, count(DISTINCT ext) as externalRelationships
        `,
        { personId, organizationId: this.organizationId }
      );

      const record = result.records[0];
      const directConnections = record?.get('directConnections') || 0;
      const bridgingRoles = record?.get('bridgingRoles') || 0;
      const bridgedTeams = record?.get('bridgedTeams') || [];
      const externalRelationships = record?.get('externalRelationships') || 0;

      // Calculate network centrality (simplified)
      const internalNetworkCentrality = Math.min(100, directConnections * 5);

      // Teams that would be disconnected
      const disconnectedTeams = bridgedTeams.filter(Boolean);

      // Calculate score
      const score = Math.min(
        100,
        bridgingRoles * 25 +
        externalRelationships * 10 +
        internalNetworkCentrality * 0.3
      );

      return {
        score,
        bridgingRoles,
        disconnectedTeams,
        externalRelationships,
        internalNetworkCentrality,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get affected processes
   */
  private async getAffectedProcesses(personId: string): Promise<AffectedProcess[]> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        MATCH (p)-[r:PARTICIPATES_IN|OWNS|APPROVES|REVIEWS]->(proc:Process)
        OPTIONAL MATCH (other:Person)-[:PARTICIPATES_IN|OWNS|APPROVES|REVIEWS]->(proc)
        WHERE other.id <> p.id
        WITH proc, type(r) as role, count(DISTINCT other) > 0 as hasAlternative
        RETURN proc.id as id, proc.name as name, role,
               proc.frequency as frequency, proc.criticality as criticality,
               hasAlternative
        `,
        { personId, organizationId: this.organizationId }
      );

      return result.records.map((record) => ({
        id: record.get('id'),
        name: record.get('name'),
        role: this.mapRelationshipToRole(record.get('role')),
        frequency: record.get('frequency') || 1,
        criticality: record.get('criticality') || 'medium',
        alternativeCoverage: record.get('hasAlternative'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get affected team members
   */
  private async getAffectedTeamMembers(personId: string): Promise<AffectedTeamMember[]> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})

        // Direct reports
        OPTIONAL MATCH (report:Person)-[:REPORTS_TO]->(p)

        // Manager
        OPTIONAL MATCH (p)-[:REPORTS_TO]->(manager:Person)

        // Collaborators
        OPTIONAL MATCH (p)-[collab:COLLABORATES_WITH]-(peer:Person)

        WITH p,
             collect(DISTINCT {id: report.id, name: report.name, rel: 'direct_report', strength: 0.8}) as reports,
             collect(DISTINCT {id: manager.id, name: manager.name, rel: 'manager', strength: 0.9}) as managers,
             collect(DISTINCT {id: peer.id, name: peer.name, rel: 'collaborator', strength: collab.strength}) as peers

        RETURN reports + managers + peers as affected
        `,
        { personId, organizationId: this.organizationId }
      );

      const affected = result.records[0]?.get('affected') || [];

      return affected
        .filter((a: { id: string | null }) => a.id)
        .map((a: { id: string; name: string; rel: string; strength: number }) => ({
          id: a.id,
          name: a.name || 'Unknown',
          relationship: a.rel as AffectedTeamMember['relationship'],
          interactionStrength: a.strength || 0.5,
          additionalLoadPercent: Math.round((a.strength || 0.5) * 30),
        }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get critical dependencies
   */
  private async getCriticalDependencies(personId: string): Promise<CriticalDependency[]> {
    const dependencies: CriticalDependency[] = [];
    const session = neo4jConnection.getSession();

    try {
      // Check for unique knowledge
      const knowledgeResult = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        MATCH (p)-[:HAS_EXPERTISE]->(k:Knowledge)
        WHERE NOT EXISTS {
          MATCH (other:Person)-[:HAS_EXPERTISE]->(k)
          WHERE other.id <> p.id
        }
        RETURN k.name as knowledge
        `,
        { personId, organizationId: this.organizationId }
      );

      for (const record of knowledgeResult.records) {
        dependencies.push({
          type: 'knowledge',
          description: `Sole expert in: ${record.get('knowledge')}`,
          severity: 'high',
          mitigationAvailable: true,
          mitigationCost: 5000, // Training cost estimate
        });
      }

      // Check for approval authority
      const approvalResult = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        MATCH (p)-[:HAS_AUTHORITY]->(auth:ApprovalAuthority)
        WHERE NOT EXISTS {
          MATCH (other:Person)-[:HAS_AUTHORITY]->(auth)
          WHERE other.id <> p.id
        }
        RETURN auth.name as authority, auth.scope as scope
        `,
        { personId, organizationId: this.organizationId }
      );

      for (const record of approvalResult.records) {
        dependencies.push({
          type: 'approval',
          description: `Sole approval authority for: ${record.get('authority')}`,
          severity: 'critical',
          mitigationAvailable: true,
          mitigationCost: 0, // Just needs delegation
        });
      }

      // Check for system access
      const accessResult = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        MATCH (p)-[:HAS_ACCESS {exclusive: true}]->(sys:System)
        RETURN sys.name as system
        `,
        { personId, organizationId: this.organizationId }
      );

      for (const record of accessResult.records) {
        dependencies.push({
          type: 'access',
          description: `Exclusive access to: ${record.get('system')}`,
          severity: 'high',
          mitigationAvailable: true,
          mitigationCost: 1000, // License/access provisioning
        });
      }

      // Check for external relationships
      const relationshipResult = await session.run(
        `
        MATCH (p:Person {id: $personId, organizationId: $organizationId})
        MATCH (p)-[r:MANAGES_RELATIONSHIP]->(ext:ExternalContact)
        WHERE r.critical = true
        RETURN ext.name as contact, ext.organization as org
        `,
        { personId, organizationId: this.organizationId }
      );

      for (const record of relationshipResult.records) {
        dependencies.push({
          type: 'relationship',
          description: `Key contact with: ${record.get('contact')} at ${record.get('org')}`,
          severity: 'medium',
          mitigationAvailable: false,
        });
      }

      return dependencies;
    } finally {
      await session.close();
    }
  }

  /**
   * Calculate overall risk score
   */
  private calculateOverallRisk(impactAreas: {
    knowledgeLoss: KnowledgeLossImpact;
    processDisruption: ProcessDisruptionImpact;
    teamDynamics: TeamDynamicsImpact;
    projectRisk: ProjectRiskImpact;
    communicationGaps: CommunicationGapImpact;
  }): number {
    const weights = {
      knowledgeLoss: 0.25,
      processDisruption: 0.25,
      teamDynamics: 0.15,
      projectRisk: 0.20,
      communicationGaps: 0.15,
    };

    const weightedScore =
      impactAreas.knowledgeLoss.score * weights.knowledgeLoss +
      impactAreas.processDisruption.score * weights.processDisruption +
      impactAreas.teamDynamics.score * weights.teamDynamics +
      impactAreas.projectRisk.score * weights.projectRisk +
      impactAreas.communicationGaps.score * weights.communicationGaps;

    return Math.round(weightedScore);
  }

  /**
   * Estimate recovery time
   */
  private estimateRecoveryTime(params: {
    knowledgeLoss: KnowledgeLossImpact;
    processDisruption: ProcessDisruptionImpact;
    changeType: PersonnelChange['type'];
  }): { minimum: number; expected: number; maximum: number } {
    const baseDays = {
      departure: 30,
      absence: 7,
      role_change: 14,
      team_transfer: 21,
    };

    const base = baseDays[params.changeType];

    // Adjust based on knowledge and process impact
    const knowledgeFactor = 1 + (params.knowledgeLoss.score / 100) * 0.5;
    const processFactor = 1 + (params.processDisruption.score / 100) * 0.3;

    const expected = Math.round(base * knowledgeFactor * processFactor);

    return {
      minimum: Math.round(expected * 0.6),
      expected,
      maximum: Math.round(expected * 1.8),
    };
  }

  /**
   * Calculate cost estimate
   */
  private calculateCostEstimate(params: {
    personData: { salary?: number };
    overallRiskScore: number;
    estimatedRecoveryTime: { expected: number };
    affectedProcesses: AffectedProcess[];
    changeType: PersonnelChange['type'];
  }): PersonnelImpact['costEstimate'] {
    const annualSalary = params.personData.salary || 60000;
    const dailySalary = annualSalary / 260;

    // Direct costs (recruitment, training for replacement)
    const directCosts = params.changeType === 'departure'
      ? annualSalary * 0.3 // ~30% of salary for recruitment
      : 0;

    // Indirect costs (productivity loss)
    const productivityLoss = dailySalary * params.estimatedRecoveryTime.expected * 0.5;

    // Opportunity costs (delayed projects, processes)
    const criticalProcessCount = params.affectedProcesses.filter(
      (p) => p.criticality === 'critical' || p.criticality === 'high'
    ).length;
    const opportunityCosts = criticalProcessCount * dailySalary * 5;

    const total = directCosts + productivityLoss + opportunityCosts;

    return {
      directCosts: Math.round(directCosts),
      indirectCosts: Math.round(productivityLoss),
      opportunityCosts: Math.round(opportunityCosts),
      total: Math.round(total),
      currency: 'EUR',
    };
  }

  /**
   * Map Neo4j relationship type to role enum
   */
  private mapRelationshipToRole(rel: string): AffectedProcess['role'] {
    switch (rel) {
      case 'OWNS':
        return 'owner';
      case 'APPROVES':
        return 'approver';
      case 'REVIEWS':
        return 'reviewer';
      default:
        return 'participant';
    }
  }
}

export default PersonnelSimulator;
