/**
 * Expertise Matcher Service
 * T035 - Create expertise profile builder and matcher
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { findExpertsBySkill, findExpertsByDomain, getExpertiseProfile } from '../operate/expertiseGraph.js';

// =============================================================================
// Types
// =============================================================================

export interface ExpertMatch {
  personId: string;
  personName: string;
  email?: string;
  expertiseScore: number;
  matchedSkills: MatchedSkill[];
  workloadScore?: number;
  availabilityScore?: number;
  responseMetrics?: {
    avgResponseTime: number;
    satisfactionScore: number;
  };
}

export interface MatchedSkill {
  skillName: string;
  level: number;
  confidence: number;
  relevance: number;
}

export interface ExpertSearchOptions {
  mustBeAvailable?: boolean;
  maxWorkload?: number;
  limit?: number;
  preferredDepartment?: string;
  excludePersonIds?: string[];
}

// =============================================================================
// Category to Skills Mapping
// =============================================================================

const CATEGORY_SKILL_MAP: Record<string, string[]> = {
  // Finance
  invoice: ['accounting', 'invoicing', 'accounts receivable', 'finance'],
  payment: ['accounts payable', 'treasury', 'banking', 'finance'],
  budget: ['financial planning', 'budgeting', 'controlling', 'finance'],
  expense: ['expense management', 'accounting', 'compliance'],
  accounting: ['bookkeeping', 'gaap', 'ifrs', 'tax', 'audit'],
  tax: ['tax compliance', 'vat', 'corporate tax', 'steuerberatung'],
  audit: ['internal audit', 'compliance', 'sox', 'risk management'],

  // Sales
  sales: ['sales', 'crm', 'negotiation', 'customer relationship'],
  quote: ['pricing', 'quotation', 'sales', 'product knowledge'],
  proposal: ['proposal writing', 'sales engineering', 'solution design'],
  contract: ['contract management', 'legal', 'negotiation'],
  pricing: ['pricing strategy', 'market analysis', 'finance'],

  // Support
  support: ['customer support', 'technical support', 'troubleshooting'],
  complaint: ['complaint handling', 'customer service', 'conflict resolution'],
  issue: ['issue resolution', 'problem solving', 'technical support'],
  feature_request: ['product management', 'requirements analysis'],
  feedback: ['customer feedback', 'quality assurance', 'process improvement'],

  // HR
  hr: ['human resources', 'personnel management', 'labor law'],
  leave: ['hr administration', 'time management', 'payroll'],
  recruitment: ['recruiting', 'talent acquisition', 'interviewing'],
  onboarding: ['onboarding', 'training', 'hr'],
  training: ['training', 'learning development', 'coaching'],
  performance: ['performance management', 'hr', 'leadership'],

  // IT
  it: ['it support', 'technical support', 'infrastructure'],
  access: ['identity management', 'security', 'it administration'],
  software: ['software support', 'application management', 'development'],
  hardware: ['hardware support', 'infrastructure', 'networking'],
  security: ['information security', 'cybersecurity', 'risk management'],
  infrastructure: ['infrastructure', 'cloud', 'networking', 'devops'],

  // Legal
  legal: ['legal', 'compliance', 'contract law', 'corporate law'],
  compliance: ['compliance', 'regulatory', 'gdpr', 'dsgvo'],
  gdpr: ['data protection', 'gdpr', 'dsgvo', 'privacy'],
  contract_review: ['contract review', 'legal', 'negotiation'],
  nda: ['nda', 'confidentiality', 'legal'],

  // Operations
  operations: ['operations management', 'process improvement', 'lean'],
  logistics: ['logistics', 'supply chain', 'shipping', 'warehousing'],
  shipping: ['shipping', 'logistics', 'export', 'customs'],
  inventory: ['inventory management', 'warehouse', 'supply chain'],
  procurement: ['procurement', 'purchasing', 'vendor management'],

  // Project
  project: ['project management', 'agile', 'planning'],
  deadline: ['project management', 'time management', 'planning'],
  milestone: ['project management', 'program management', 'planning'],
  status_update: ['project management', 'reporting', 'communication'],
  planning: ['planning', 'strategy', 'project management'],

  // General
  general: ['communication', 'administration', 'coordination'],
  information: ['knowledge management', 'research', 'administration'],
  meeting: ['coordination', 'scheduling', 'administration'],
  scheduling: ['calendar management', 'coordination', 'administration'],
};

// =============================================================================
// Main Matching Functions
// =============================================================================

/**
 * Find the best expert for given categories
 */
export async function findBestExpert(
  organizationId: string,
  categories: string[],
  options: ExpertSearchOptions = {}
): Promise<ExpertMatch | null> {
  const { limit = 5, mustBeAvailable = true } = options;

  // Convert categories to skills
  const requiredSkills = categoriesToSkills(categories);

  if (requiredSkills.length === 0) {
    logger.warn({ categories }, 'No skills mapped from categories');
    return null;
  }

  // Search for experts with these skills
  const candidates: ExpertMatch[] = [];

  for (const skill of requiredSkills.slice(0, 3)) { // Top 3 skills
    try {
      const experts = await findExpertsBySkill(organizationId, skill, {
        minLevel: 2,
        minConfidence: 0.5,
        mustBeAvailable,
        limit,
      });

      for (const expert of experts) {
        // Check exclusions
        if (options.excludePersonIds?.includes(expert.personId)) {
          continue;
        }

        // Check if already in candidates
        const existing = candidates.find(c => c.personId === expert.personId);
        if (existing) {
          // Update matched skills
          const skillData = expert.skills.find(s =>
            s.name.toLowerCase().includes(skill.toLowerCase())
          );
          if (skillData) {
            existing.matchedSkills.push({
              skillName: skillData.name,
              level: skillData.level,
              confidence: skillData.confidence,
              relevance: calculateSkillRelevance(skillData.name, categories),
            });
            existing.expertiseScore = calculateExpertiseScore(existing.matchedSkills);
          }
          continue;
        }

        // Build matched skills
        const matchedSkills: MatchedSkill[] = expert.skills
          .filter(s => requiredSkills.some(rs =>
            s.name.toLowerCase().includes(rs.toLowerCase()) ||
            rs.toLowerCase().includes(s.name.toLowerCase())
          ))
          .map(s => ({
            skillName: s.name,
            level: s.level,
            confidence: s.confidence,
            relevance: calculateSkillRelevance(s.name, categories),
          }));

        candidates.push({
          personId: expert.personId,
          personName: expert.personName,
          email: expert.email,
          expertiseScore: calculateExpertiseScore(matchedSkills),
          matchedSkills,
          workloadScore: expert.availability.currentWorkload
            ? 1 - (expert.availability.currentWorkload / 100)
            : undefined,
          availabilityScore: expert.availability.isAvailable ? 1 : 0,
          responseMetrics: {
            avgResponseTime: expert.responseMetrics.avgResponseTimeMs,
            satisfactionScore: expert.responseMetrics.satisfactionScore,
          },
        });
      }
    } catch (error) {
      logger.error({ error, skill }, 'Failed to find experts for skill');
    }
  }

  if (candidates.length === 0) {
    logger.debug({ categories, skills: requiredSkills }, 'No experts found');
    return null;
  }

  // Sort by expertise score
  candidates.sort((a, b) => b.expertiseScore - a.expertiseScore);

  logger.debug({
    categories,
    candidateCount: candidates.length,
    bestMatch: candidates[0].personName,
    expertiseScore: candidates[0].expertiseScore,
  }, 'Expert matching completed');

  return candidates[0];
}

/**
 * Find multiple experts for given categories
 */
export async function findExperts(
  organizationId: string,
  categories: string[],
  options: ExpertSearchOptions = {}
): Promise<ExpertMatch[]> {
  const { limit = 10 } = options;

  const firstResult = await findBestExpert(organizationId, categories, {
    ...options,
    limit: limit + 5, // Get extra to account for filtering
  });

  if (!firstResult) {
    return [];
  }

  // Get more candidates by searching for each skill
  const requiredSkills = categoriesToSkills(categories);
  const allCandidates: ExpertMatch[] = [firstResult];

  for (const skill of requiredSkills) {
    const experts = await findExpertsBySkill(organizationId, skill, {
      minLevel: 2,
      mustBeAvailable: options.mustBeAvailable,
      limit: 5,
    });

    for (const expert of experts) {
      if (
        !allCandidates.some(c => c.personId === expert.personId) &&
        !options.excludePersonIds?.includes(expert.personId)
      ) {
        const matchedSkills: MatchedSkill[] = expert.skills
          .filter(s => requiredSkills.some(rs =>
            s.name.toLowerCase().includes(rs.toLowerCase())
          ))
          .map(s => ({
            skillName: s.name,
            level: s.level,
            confidence: s.confidence,
            relevance: calculateSkillRelevance(s.name, categories),
          }));

        allCandidates.push({
          personId: expert.personId,
          personName: expert.personName,
          email: expert.email,
          expertiseScore: calculateExpertiseScore(matchedSkills),
          matchedSkills,
        });
      }
    }
  }

  // Sort and limit
  return allCandidates
    .sort((a, b) => b.expertiseScore - a.expertiseScore)
    .slice(0, limit);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert categories to required skills
 */
export function categoriesToSkills(categories: string[]): string[] {
  const skills = new Set<string>();

  for (const category of categories) {
    const mappedSkills = CATEGORY_SKILL_MAP[category.toLowerCase()];
    if (mappedSkills) {
      mappedSkills.forEach(s => skills.add(s));
    } else {
      // Use category itself as a skill
      skills.add(category);
    }
  }

  return Array.from(skills);
}

/**
 * Calculate expertise score from matched skills
 */
function calculateExpertiseScore(matchedSkills: MatchedSkill[]): number {
  if (matchedSkills.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const skill of matchedSkills) {
    const weight = skill.relevance;
    const score = (skill.level / 5) * skill.confidence;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate skill relevance to categories
 */
function calculateSkillRelevance(skillName: string, categories: string[]): number {
  const lowerSkill = skillName.toLowerCase();

  for (const category of categories) {
    const mappedSkills = CATEGORY_SKILL_MAP[category.toLowerCase()];
    if (mappedSkills) {
      const index = mappedSkills.findIndex(s => lowerSkill.includes(s) || s.includes(lowerSkill));
      if (index === 0) return 1.0; // Primary skill
      if (index === 1) return 0.8; // Secondary skill
      if (index >= 0) return 0.6; // Related skill
    }
  }

  return 0.4; // Generic match
}

/**
 * Get expertise profile for a person
 */
export async function getPersonExpertise(
  organizationId: string,
  personId: string
): Promise<ExpertMatch | null> {
  const profile = await getExpertiseProfile(organizationId, personId);
  if (!profile) return null;

  return {
    personId: profile.personId,
    personName: profile.personName,
    email: profile.email,
    expertiseScore: 0.8, // Default for existing profile
    matchedSkills: profile.skills.map(s => ({
      skillName: s.name,
      level: s.level,
      confidence: s.confidence,
      relevance: 1.0,
    })),
    workloadScore: profile.availability.currentWorkload
      ? 1 - (profile.availability.currentWorkload / 100)
      : undefined,
    availabilityScore: profile.availability.isAvailable ? 1 : 0,
    responseMetrics: {
      avgResponseTime: profile.responseMetrics.avgResponseTimeMs,
      satisfactionScore: profile.responseMetrics.satisfactionScore,
    },
  };
}

export default {
  findBestExpert,
  findExperts,
  categoriesToSkills,
  getPersonExpertise,
  CATEGORY_SKILL_MAP,
};
