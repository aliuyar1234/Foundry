/**
 * Hierarchy Comparison Service
 * Compares formal organizational hierarchy with actual communication patterns
 * T235 - Formal vs informal hierarchy comparison
 */

import { runQuery } from '../../../graph/connection.js';
import { calculateInfluenceScores } from './influenceScorer.js';

export interface HierarchyNode {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  formalLevel: number;
  actualLevel: number;
  directReports: number;
  formalManager?: string;
  actualInfluencers: string[];
  discrepancy: number;
  discrepancyType: 'aligned' | 'under-leveraged' | 'over-performer' | 'shadow-leader';
}

export interface HierarchyComparison {
  nodes: HierarchyNode[];
  metrics: {
    alignmentScore: number;
    shadowLeaderCount: number;
    underLeveragedCount: number;
    overPerformerCount: number;
    avgDiscrepancy: number;
  };
  formalHierarchy: HierarchyLevel[];
  actualHierarchy: HierarchyLevel[];
}

export interface HierarchyLevel {
  level: number;
  label: string;
  members: Array<{
    email: string;
    displayName?: string;
    department?: string;
  }>;
}

/**
 * Compare formal hierarchy with actual influence patterns
 */
export async function compareHierarchies(
  organizationId: string
): Promise<HierarchyComparison> {
  // Get formal hierarchy from REPORTS_TO relationships
  const formalHierarchy = await getFormalHierarchy(organizationId);

  // Get actual influence hierarchy
  const influenceResult = await calculateInfluenceScores(organizationId);

  // Map formal levels
  const formalLevelMap = new Map<string, { level: number; manager?: string; directReports: number }>();
  formalHierarchy.nodes.forEach((n) => {
    formalLevelMap.set(n.email, {
      level: n.level,
      manager: n.manager,
      directReports: n.directReports,
    });
  });

  // Create actual hierarchy levels based on influence
  const totalPeople = influenceResult.influencers.length;
  const levelBuckets = [
    { threshold: 0.95, level: 1, label: 'Top Leadership' },
    { threshold: 0.80, level: 2, label: 'Senior Leaders' },
    { threshold: 0.60, level: 3, label: 'Key Influencers' },
    { threshold: 0.40, level: 4, label: 'Contributors' },
    { threshold: 0.00, level: 5, label: 'Participants' },
  ];

  // Build comparison nodes
  const nodes: HierarchyNode[] = influenceResult.influencers.map((person) => {
    const formal = formalLevelMap.get(person.email);
    const formalLevel = formal?.level || 5;

    // Determine actual level from percentile
    const actualLevel = levelBuckets.find((b) => person.percentile >= b.threshold * 100)?.level || 5;

    // Get actual influencers (top communicators with this person)
    const actualInfluencers: string[] = []; // Would need additional query

    // Calculate discrepancy
    const discrepancy = formalLevel - actualLevel;

    // Determine discrepancy type
    let discrepancyType: HierarchyNode['discrepancyType'];
    if (Math.abs(discrepancy) <= 1) {
      discrepancyType = 'aligned';
    } else if (discrepancy > 1) {
      discrepancyType = 'over-performer'; // Higher influence than position suggests
    } else if (discrepancy < -1 && formalLevel <= 2) {
      discrepancyType = 'under-leveraged'; // Senior but low influence
    } else {
      discrepancyType = 'shadow-leader'; // High influence without formal authority
    }

    return {
      email: person.email,
      displayName: person.displayName,
      department: person.department,
      jobTitle: person.jobTitle,
      formalLevel,
      actualLevel,
      directReports: formal?.directReports || 0,
      formalManager: formal?.manager,
      actualInfluencers,
      discrepancy,
      discrepancyType,
    };
  });

  // Calculate metrics
  const aligned = nodes.filter((n) => n.discrepancyType === 'aligned').length;
  const shadowLeaders = nodes.filter((n) => n.discrepancyType === 'shadow-leader').length;
  const underLeveraged = nodes.filter((n) => n.discrepancyType === 'under-leveraged').length;
  const overPerformers = nodes.filter((n) => n.discrepancyType === 'over-performer').length;
  const avgDiscrepancy = nodes.reduce((sum, n) => sum + Math.abs(n.discrepancy), 0) / nodes.length || 0;

  // Build hierarchy level summaries
  const formalLevels: HierarchyLevel[] = [];
  const actualLevels: HierarchyLevel[] = [];

  for (let level = 1; level <= 5; level++) {
    const formalMembers = nodes.filter((n) => n.formalLevel === level);
    const actualMembers = nodes.filter((n) => n.actualLevel === level);

    formalLevels.push({
      level,
      label: levelBuckets.find((b) => b.level === level)?.label || `Level ${level}`,
      members: formalMembers.map((m) => ({
        email: m.email,
        displayName: m.displayName,
        department: m.department,
      })),
    });

    actualLevels.push({
      level,
      label: levelBuckets.find((b) => b.level === level)?.label || `Level ${level}`,
      members: actualMembers.map((m) => ({
        email: m.email,
        displayName: m.displayName,
        department: m.department,
      })),
    });
  }

  return {
    nodes,
    metrics: {
      alignmentScore: aligned / nodes.length || 0,
      shadowLeaderCount: shadowLeaders,
      underLeveragedCount: underLeveraged,
      overPerformerCount: overPerformers,
      avgDiscrepancy,
    },
    formalHierarchy: formalLevels,
    actualHierarchy: actualLevels,
  };
}

/**
 * Get formal hierarchy from REPORTS_TO relationships
 */
async function getFormalHierarchy(
  organizationId: string
): Promise<{
  nodes: Array<{
    email: string;
    displayName?: string;
    level: number;
    manager?: string;
    directReports: number;
  }>;
}> {
  // First, identify people with no managers (top level)
  const hierarchyData = await runQuery<{
    email: string;
    displayName: string;
    manager: string | null;
    directReports: { low: number };
    pathLength: { low: number };
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    OPTIONAL MATCH (p)-[:REPORTS_TO]->(manager:Person)
    OPTIONAL MATCH (report:Person)-[:REPORTS_TO]->(p)
    OPTIONAL MATCH path = (p)-[:REPORTS_TO*0..10]->(top:Person)
    WHERE NOT (top)-[:REPORTS_TO]->(:Person)
    WITH p, manager, count(DISTINCT report) as directReports, max(length(path)) as pathLength
    RETURN p.email as email, p.displayName as displayName,
           manager.email as manager, directReports, pathLength
    `,
    { organizationId }
  );

  // If no REPORTS_TO relationships exist, infer from job titles
  if (hierarchyData.every((h) => h.manager === null)) {
    return await inferHierarchyFromTitles(organizationId);
  }

  const nodes = hierarchyData.map((h) => ({
    email: h.email,
    displayName: h.displayName,
    level: (h.pathLength?.low || 0) + 1, // Root is level 1
    manager: h.manager || undefined,
    directReports: h.directReports?.low || 0,
  }));

  return { nodes };
}

/**
 * Infer hierarchy from job titles when no REPORTS_TO exists
 */
async function inferHierarchyFromTitles(
  organizationId: string
): Promise<{
  nodes: Array<{
    email: string;
    displayName?: string;
    level: number;
    manager?: string;
    directReports: number;
  }>;
}> {
  const persons = await runQuery<{
    email: string;
    displayName: string;
    jobTitle: string;
  }>(
    `
    MATCH (p:Person {organizationId: $organizationId})
    RETURN p.email as email, p.displayName as displayName, p.jobTitle as jobTitle
    `,
    { organizationId }
  );

  // Title keywords for level inference
  const levelPatterns: Array<{ level: number; patterns: RegExp[] }> = [
    {
      level: 1,
      patterns: [
        /\b(ceo|cto|cfo|coo|chief|president|founder|owner|geschäftsführer|vorstand)\b/i,
      ],
    },
    {
      level: 2,
      patterns: [
        /\b(vp|vice president|director|head of|leiter|bereichsleiter|abteilungsleiter)\b/i,
      ],
    },
    {
      level: 3,
      patterns: [
        /\b(manager|lead|supervisor|teamlead|team lead|gruppenleiter)\b/i,
      ],
    },
    {
      level: 4,
      patterns: [
        /\b(senior|sr\.|principal|staff|architect|expert)\b/i,
      ],
    },
    {
      level: 5,
      patterns: [
        /\b(junior|jr\.|associate|assistant|trainee|intern|analyst)\b/i,
      ],
    },
  ];

  const nodes = persons.map((p) => {
    let level = 4; // Default: mid-level

    for (const pattern of levelPatterns) {
      if (pattern.patterns.some((re) => re.test(p.jobTitle || ''))) {
        level = pattern.level;
        break;
      }
    }

    return {
      email: p.email,
      displayName: p.displayName,
      level,
      manager: undefined,
      directReports: 0,
    };
  });

  return { nodes };
}

/**
 * Get people whose actual influence differs significantly from their formal position
 */
export async function getHierarchyDiscrepancies(
  organizationId: string,
  minDiscrepancy: number = 2
): Promise<HierarchyNode[]> {
  const comparison = await compareHierarchies(organizationId);

  return comparison.nodes
    .filter((n) => Math.abs(n.discrepancy) >= minDiscrepancy)
    .sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));
}

/**
 * Get shadow leaders (high influence without formal authority)
 */
export async function getShadowLeaders(
  organizationId: string
): Promise<HierarchyNode[]> {
  const comparison = await compareHierarchies(organizationId);

  return comparison.nodes
    .filter((n) => n.discrepancyType === 'shadow-leader' || n.discrepancyType === 'over-performer')
    .sort((a, b) => a.actualLevel - b.actualLevel);
}

/**
 * Get under-leveraged leaders (formal authority without actual influence)
 */
export async function getUnderLeveragedLeaders(
  organizationId: string
): Promise<HierarchyNode[]> {
  const comparison = await compareHierarchies(organizationId);

  return comparison.nodes
    .filter((n) => n.discrepancyType === 'under-leveraged')
    .sort((a, b) => a.formalLevel - b.formalLevel);
}

export default {
  compareHierarchies,
  getHierarchyDiscrepancies,
  getShadowLeaders,
  getUnderLeveragedLeaders,
};
