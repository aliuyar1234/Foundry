/**
 * Expertise Extractor Service
 * T036 - Implement activity-to-expertise mapper
 *
 * Extracts expertise signals from user activities and maps them to skills/domains
 */

import { logger } from '../../lib/logger.js';
import { recordSkillEvidence, updateExpertiseProfile } from '../operate/expertiseGraph.js';

// =============================================================================
// Types
// =============================================================================

export interface ActivityEvent {
  id: string;
  personId: string;
  type: ActivityType;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export type ActivityType =
  | 'email_sent'
  | 'email_received'
  | 'document_created'
  | 'document_edited'
  | 'meeting_attended'
  | 'meeting_organized'
  | 'task_completed'
  | 'issue_resolved'
  | 'process_executed'
  | 'request_handled'
  | 'approval_given'
  | 'report_generated';

export interface ExtractedExpertise {
  skills: ExtractedSkill[];
  domains: string[];
  processExpertise: ExtractedProcessExpertise[];
}

export interface ExtractedSkill {
  name: string;
  category: string;
  confidenceBoost: number;
  evidence: string;
}

export interface ExtractedProcessExpertise {
  processId: string;
  processName?: string;
  proficiency: 'novice' | 'intermediate' | 'expert';
  instances: number;
}

// =============================================================================
// Activity to Skill Mapping Rules
// =============================================================================

interface SkillMapping {
  skills: Array<{ name: string; category: string; baseConfidence: number }>;
  domains: string[];
}

const ACTIVITY_SKILL_MAPPINGS: Record<string, Record<string, SkillMapping>> = {
  // Email activity patterns
  email_patterns: {
    finance: {
      skills: [
        { name: 'Financial Analysis', category: 'finance', baseConfidence: 0.03 },
        { name: 'Accounting', category: 'finance', baseConfidence: 0.03 },
      ],
      domains: ['Finance', 'Controlling'],
    },
    invoice: {
      skills: [
        { name: 'Accounts Receivable', category: 'finance', baseConfidence: 0.04 },
        { name: 'Invoicing', category: 'finance', baseConfidence: 0.05 },
      ],
      domains: ['Finance'],
    },
    contract: {
      skills: [
        { name: 'Contract Management', category: 'legal', baseConfidence: 0.04 },
        { name: 'Legal Review', category: 'legal', baseConfidence: 0.03 },
      ],
      domains: ['Legal', 'Compliance'],
    },
    hr: {
      skills: [
        { name: 'Human Resources', category: 'hr', baseConfidence: 0.03 },
        { name: 'Personnel Management', category: 'hr', baseConfidence: 0.03 },
      ],
      domains: ['HR'],
    },
    recruitment: {
      skills: [
        { name: 'Recruiting', category: 'hr', baseConfidence: 0.04 },
        { name: 'Talent Acquisition', category: 'hr', baseConfidence: 0.03 },
      ],
      domains: ['HR'],
    },
    support: {
      skills: [
        { name: 'Customer Support', category: 'support', baseConfidence: 0.03 },
        { name: 'Issue Resolution', category: 'support', baseConfidence: 0.04 },
      ],
      domains: ['Customer Service'],
    },
    sales: {
      skills: [
        { name: 'Sales', category: 'sales', baseConfidence: 0.03 },
        { name: 'Customer Relationship', category: 'sales', baseConfidence: 0.03 },
      ],
      domains: ['Sales', 'Business Development'],
    },
    technical: {
      skills: [
        { name: 'Technical Support', category: 'it', baseConfidence: 0.04 },
        { name: 'Problem Solving', category: 'it', baseConfidence: 0.03 },
      ],
      domains: ['IT', 'Engineering'],
    },
    project: {
      skills: [
        { name: 'Project Management', category: 'management', baseConfidence: 0.03 },
        { name: 'Planning', category: 'management', baseConfidence: 0.02 },
      ],
      domains: ['Project Management'],
    },
    compliance: {
      skills: [
        { name: 'Compliance', category: 'compliance', baseConfidence: 0.04 },
        { name: 'Risk Management', category: 'compliance', baseConfidence: 0.03 },
      ],
      domains: ['Compliance', 'Legal'],
    },
    gdpr: {
      skills: [
        { name: 'Data Protection', category: 'compliance', baseConfidence: 0.05 },
        { name: 'GDPR/DSGVO', category: 'compliance', baseConfidence: 0.05 },
      ],
      domains: ['Compliance', 'Privacy'],
    },
  },

  // Document activity patterns
  document_types: {
    report: {
      skills: [
        { name: 'Reporting', category: 'analysis', baseConfidence: 0.04 },
        { name: 'Data Analysis', category: 'analysis', baseConfidence: 0.03 },
      ],
      domains: ['Analytics'],
    },
    presentation: {
      skills: [
        { name: 'Presentation Skills', category: 'communication', baseConfidence: 0.04 },
        { name: 'Communication', category: 'communication', baseConfidence: 0.03 },
      ],
      domains: ['Communication'],
    },
    spreadsheet: {
      skills: [
        { name: 'Excel/Spreadsheets', category: 'tools', baseConfidence: 0.03 },
        { name: 'Data Analysis', category: 'analysis', baseConfidence: 0.02 },
      ],
      domains: ['Analytics'],
    },
    proposal: {
      skills: [
        { name: 'Proposal Writing', category: 'sales', baseConfidence: 0.05 },
        { name: 'Solution Design', category: 'sales', baseConfidence: 0.04 },
      ],
      domains: ['Sales', 'Business Development'],
    },
    sop: {
      skills: [
        { name: 'Process Documentation', category: 'operations', baseConfidence: 0.05 },
        { name: 'Process Improvement', category: 'operations', baseConfidence: 0.04 },
      ],
      domains: ['Operations', 'Quality'],
    },
  },

  // Meeting roles
  meeting_roles: {
    organizer: {
      skills: [
        { name: 'Meeting Facilitation', category: 'communication', baseConfidence: 0.04 },
        { name: 'Coordination', category: 'management', baseConfidence: 0.03 },
      ],
      domains: ['Management'],
    },
    presenter: {
      skills: [
        { name: 'Presentation Skills', category: 'communication', baseConfidence: 0.05 },
        { name: 'Subject Matter Expertise', category: 'knowledge', baseConfidence: 0.04 },
      ],
      domains: ['Communication'],
    },
  },
};

// Keywords that indicate expertise areas
const EXPERTISE_KEYWORDS: Record<string, { category: string; skills: string[] }> = {
  // German terms
  rechnung: { category: 'finance', skills: ['Invoicing', 'Accounting'] },
  buchhaltung: { category: 'finance', skills: ['Accounting', 'Bookkeeping'] },
  vertrag: { category: 'legal', skills: ['Contract Management', 'Legal Review'] },
  personal: { category: 'hr', skills: ['Human Resources', 'Personnel Management'] },
  bewerbung: { category: 'hr', skills: ['Recruiting', 'Talent Acquisition'] },
  projekt: { category: 'management', skills: ['Project Management', 'Planning'] },
  angebot: { category: 'sales', skills: ['Sales', 'Quotation'] },
  kunde: { category: 'sales', skills: ['Customer Relationship', 'Sales'] },
  lieferant: { category: 'procurement', skills: ['Procurement', 'Vendor Management'] },
  qualität: { category: 'quality', skills: ['Quality Assurance', 'Quality Control'] },
  audit: { category: 'compliance', skills: ['Internal Audit', 'Compliance'] },
  datenschutz: { category: 'compliance', skills: ['Data Protection', 'GDPR/DSGVO'] },

  // English terms
  invoice: { category: 'finance', skills: ['Invoicing', 'Accounts Receivable'] },
  budget: { category: 'finance', skills: ['Financial Planning', 'Budgeting'] },
  contract: { category: 'legal', skills: ['Contract Management', 'Legal Review'] },
  employee: { category: 'hr', skills: ['Human Resources', 'Personnel Management'] },
  hiring: { category: 'hr', skills: ['Recruiting', 'Talent Acquisition'] },
  project: { category: 'management', skills: ['Project Management', 'Planning'] },
  customer: { category: 'sales', skills: ['Customer Relationship', 'Customer Service'] },
  vendor: { category: 'procurement', skills: ['Procurement', 'Vendor Management'] },
  compliance: { category: 'compliance', skills: ['Compliance', 'Risk Management'] },
  security: { category: 'it', skills: ['Information Security', 'Cybersecurity'] },
  infrastructure: { category: 'it', skills: ['Infrastructure', 'System Administration'] },
};

// =============================================================================
// Main Extraction Functions
// =============================================================================

/**
 * Extract expertise signals from an activity event
 */
export function extractExpertiseFromActivity(
  activity: ActivityEvent
): ExtractedExpertise {
  const skills: ExtractedSkill[] = [];
  const domains = new Set<string>();
  const processExpertise: ExtractedProcessExpertise[] = [];

  switch (activity.type) {
    case 'email_sent':
    case 'email_received':
      extractFromEmail(activity, skills, domains);
      break;

    case 'document_created':
    case 'document_edited':
      extractFromDocument(activity, skills, domains);
      break;

    case 'meeting_attended':
    case 'meeting_organized':
      extractFromMeeting(activity, skills, domains);
      break;

    case 'task_completed':
    case 'issue_resolved':
      extractFromTask(activity, skills, domains);
      break;

    case 'process_executed':
      extractFromProcess(activity, skills, domains, processExpertise);
      break;

    case 'request_handled':
      extractFromRequest(activity, skills, domains);
      break;

    case 'approval_given':
      extractFromApproval(activity, skills, domains);
      break;

    case 'report_generated':
      extractFromReport(activity, skills, domains);
      break;
  }

  // Extract from content keywords if available
  const content = activity.metadata.content as string | undefined;
  const subject = activity.metadata.subject as string | undefined;
  if (content || subject) {
    extractFromKeywords(content || subject || '', skills, domains);
  }

  return {
    skills,
    domains: Array.from(domains),
    processExpertise,
  };
}

/**
 * Process activity and update expertise profile in graph
 */
export async function processActivityForExpertise(
  organizationId: string,
  activity: ActivityEvent
): Promise<ExtractedExpertise> {
  const extracted = extractExpertiseFromActivity(activity);

  // Record skill evidence in Neo4j
  for (const skill of extracted.skills) {
    try {
      await recordSkillEvidence(
        organizationId,
        activity.personId,
        skill.name,
        skill.category,
        skill.confidenceBoost
      );
    } catch (error) {
      logger.error(
        { error, skill: skill.name, personId: activity.personId },
        'Failed to record skill evidence'
      );
    }
  }

  // Update domains if any
  if (extracted.domains.length > 0) {
    try {
      await updateExpertiseProfile(organizationId, activity.personId, {
        domains: extracted.domains,
      });
    } catch (error) {
      logger.error(
        { error, personId: activity.personId },
        'Failed to update expertise domains'
      );
    }
  }

  // Update process expertise if any
  if (extracted.processExpertise.length > 0) {
    try {
      await updateExpertiseProfile(organizationId, activity.personId, {
        processExpertise: extracted.processExpertise,
      });
    } catch (error) {
      logger.error(
        { error, personId: activity.personId },
        'Failed to update process expertise'
      );
    }
  }

  logger.debug(
    {
      personId: activity.personId,
      activityType: activity.type,
      skillsExtracted: extracted.skills.length,
      domainsExtracted: extracted.domains.length,
    },
    'Processed activity for expertise'
  );

  return extracted;
}

/**
 * Batch process activities for a person
 */
export async function batchProcessActivities(
  organizationId: string,
  activities: ActivityEvent[]
): Promise<Map<string, ExtractedExpertise>> {
  const results = new Map<string, ExtractedExpertise>();

  // Group by person
  const byPerson = new Map<string, ActivityEvent[]>();
  for (const activity of activities) {
    const existing = byPerson.get(activity.personId) || [];
    existing.push(activity);
    byPerson.set(activity.personId, existing);
  }

  // Process each person's activities
  for (const [personId, personActivities] of byPerson) {
    const aggregated: ExtractedExpertise = {
      skills: [],
      domains: [],
      processExpertise: [],
    };

    const skillMap = new Map<string, ExtractedSkill>();
    const domainSet = new Set<string>();
    const processMap = new Map<string, ExtractedProcessExpertise>();

    for (const activity of personActivities) {
      const extracted = extractExpertiseFromActivity(activity);

      // Aggregate skills
      for (const skill of extracted.skills) {
        const existing = skillMap.get(skill.name);
        if (existing) {
          existing.confidenceBoost += skill.confidenceBoost;
          existing.evidence += `; ${skill.evidence}`;
        } else {
          skillMap.set(skill.name, { ...skill });
        }
      }

      // Aggregate domains
      extracted.domains.forEach((d) => domainSet.add(d));

      // Aggregate process expertise
      for (const pe of extracted.processExpertise) {
        const existing = processMap.get(pe.processId);
        if (existing) {
          existing.instances += pe.instances;
          // Upgrade proficiency if more instances
          if (existing.instances > 50) existing.proficiency = 'expert';
          else if (existing.instances > 15) existing.proficiency = 'intermediate';
        } else {
          processMap.set(pe.processId, { ...pe });
        }
      }
    }

    aggregated.skills = Array.from(skillMap.values());
    aggregated.domains = Array.from(domainSet);
    aggregated.processExpertise = Array.from(processMap.values());

    // Update graph
    try {
      if (aggregated.skills.length > 0) {
        await updateExpertiseProfile(organizationId, personId, {
          skills: aggregated.skills.map((s) => ({
            name: s.name,
            category: s.category,
            level: calculateSkillLevel(s.confidenceBoost),
            confidence: Math.min(s.confidenceBoost, 1),
          })),
          domains: aggregated.domains,
          processExpertise: aggregated.processExpertise,
        });
      }
    } catch (error) {
      logger.error({ error, personId }, 'Failed to update expertise profile in batch');
    }

    results.set(personId, aggregated);
  }

  logger.info(
    {
      activityCount: activities.length,
      personCount: byPerson.size,
    },
    'Batch processed activities for expertise'
  );

  return results;
}

// =============================================================================
// Extraction Helper Functions
// =============================================================================

function extractFromEmail(
  activity: ActivityEvent,
  skills: ExtractedSkill[],
  domains: Set<string>
): void {
  const subject = (activity.metadata.subject as string) || '';
  const folder = (activity.metadata.folder as string) || '';
  const recipients = (activity.metadata.recipientCount as number) || 1;

  // Higher confidence for organizing many-recipient emails
  const recipientBoost = recipients > 5 ? 0.02 : 0;

  // Check subject patterns
  for (const [pattern, mapping] of Object.entries(
    ACTIVITY_SKILL_MAPPINGS.email_patterns
  )) {
    if (
      subject.toLowerCase().includes(pattern) ||
      folder.toLowerCase().includes(pattern)
    ) {
      for (const skill of mapping.skills) {
        skills.push({
          name: skill.name,
          category: skill.category,
          confidenceBoost: skill.baseConfidence + recipientBoost,
          evidence: `Email activity: ${activity.type} - "${subject.substring(0, 50)}"`,
        });
      }
      mapping.domains.forEach((d) => domains.add(d));
    }
  }
}

function extractFromDocument(
  activity: ActivityEvent,
  skills: ExtractedSkill[],
  domains: Set<string>
): void {
  const docType = (activity.metadata.documentType as string) || '';
  const title = (activity.metadata.title as string) || '';

  // Check document type patterns
  for (const [type, mapping] of Object.entries(
    ACTIVITY_SKILL_MAPPINGS.document_types
  )) {
    if (
      docType.toLowerCase().includes(type) ||
      title.toLowerCase().includes(type)
    ) {
      for (const skill of mapping.skills) {
        // Higher confidence for created vs edited
        const boost = activity.type === 'document_created' ? 0.02 : 0;
        skills.push({
          name: skill.name,
          category: skill.category,
          confidenceBoost: skill.baseConfidence + boost,
          evidence: `Document ${activity.type}: "${title.substring(0, 50)}"`,
        });
      }
      mapping.domains.forEach((d) => domains.add(d));
    }
  }
}

function extractFromMeeting(
  activity: ActivityEvent,
  skills: ExtractedSkill[],
  domains: Set<string>
): void {
  const role =
    activity.type === 'meeting_organized' ? 'organizer' : 'attendee';
  const subject = (activity.metadata.subject as string) || '';
  const attendees = (activity.metadata.attendeeCount as number) || 1;

  // Meeting organization skills
  if (role === 'organizer') {
    const mapping = ACTIVITY_SKILL_MAPPINGS.meeting_roles.organizer;
    const sizeBoost = attendees > 10 ? 0.03 : attendees > 5 ? 0.02 : 0;

    for (const skill of mapping.skills) {
      skills.push({
        name: skill.name,
        category: skill.category,
        confidenceBoost: skill.baseConfidence + sizeBoost,
        evidence: `Organized meeting with ${attendees} attendees`,
      });
    }
    mapping.domains.forEach((d) => domains.add(d));
  }

  // Extract domain from meeting subject
  extractFromKeywords(subject, skills, domains);
}

function extractFromTask(
  activity: ActivityEvent,
  skills: ExtractedSkill[],
  domains: Set<string>
): void {
  const taskType = (activity.metadata.taskType as string) || '';
  const category = (activity.metadata.category as string) || '';
  const priority = (activity.metadata.priority as string) || 'medium';

  // Higher confidence for high-priority tasks
  const priorityBoost = priority === 'high' ? 0.02 : 0;

  // Base task completion skill
  skills.push({
    name: 'Task Execution',
    category: 'operations',
    confidenceBoost: 0.02 + priorityBoost,
    evidence: `Completed task: ${taskType || category}`,
  });

  // Extract domain from task details
  if (category || taskType) {
    extractFromKeywords(`${category} ${taskType}`, skills, domains);
  }
}

function extractFromProcess(
  activity: ActivityEvent,
  skills: ExtractedSkill[],
  domains: Set<string>,
  processExpertise: ExtractedProcessExpertise[]
): void {
  const processId = activity.metadata.processId as string;
  const processName = activity.metadata.processName as string;
  const step = activity.metadata.step as string;
  const isSuccessful = activity.metadata.success !== false;

  if (processId) {
    processExpertise.push({
      processId,
      processName,
      proficiency: 'novice', // Will be upgraded based on instance count
      instances: 1,
    });
  }

  // Process execution skills
  if (isSuccessful) {
    skills.push({
      name: 'Process Execution',
      category: 'operations',
      confidenceBoost: 0.03,
      evidence: `Executed process: ${processName || processId}`,
    });
  }

  // Extract domain from process name
  if (processName) {
    extractFromKeywords(processName, skills, domains);
  }
}

function extractFromRequest(
  activity: ActivityEvent,
  skills: ExtractedSkill[],
  domains: Set<string>
): void {
  const requestType = (activity.metadata.requestType as string) || '';
  const categories = (activity.metadata.categories as string[]) || [];
  const responseTime = activity.metadata.responseTimeMs as number;

  // Fast response bonus
  const speedBonus =
    responseTime && responseTime < 3600000 ? 0.02 : 0; // Under 1 hour

  // Request handling skill
  skills.push({
    name: 'Request Handling',
    category: 'support',
    confidenceBoost: 0.03 + speedBonus,
    evidence: `Handled ${requestType} request`,
  });

  // Extract from categories
  for (const category of categories) {
    extractFromKeywords(category, skills, domains);
  }
}

function extractFromApproval(
  activity: ActivityEvent,
  skills: ExtractedSkill[],
  domains: Set<string>
): void {
  const approvalType = (activity.metadata.approvalType as string) || '';
  const amount = activity.metadata.amount as number;

  // Base approval skill
  skills.push({
    name: 'Decision Making',
    category: 'management',
    confidenceBoost: 0.03,
    evidence: `Approval given: ${approvalType}`,
  });

  // Financial approval indicates authority
  if (amount && amount > 10000) {
    skills.push({
      name: 'Financial Authority',
      category: 'finance',
      confidenceBoost: 0.04,
      evidence: `Approved amount: ${amount}`,
    });
    domains.add('Finance');
  }

  extractFromKeywords(approvalType, skills, domains);
}

function extractFromReport(
  activity: ActivityEvent,
  skills: ExtractedSkill[],
  domains: Set<string>
): void {
  const reportType = (activity.metadata.reportType as string) || '';
  const complexity = (activity.metadata.complexity as string) || 'medium';

  const complexityBoost = complexity === 'high' ? 0.03 : 0;

  skills.push({
    name: 'Reporting',
    category: 'analysis',
    confidenceBoost: 0.04 + complexityBoost,
    evidence: `Generated report: ${reportType}`,
  });

  skills.push({
    name: 'Data Analysis',
    category: 'analysis',
    confidenceBoost: 0.03 + complexityBoost,
    evidence: `Report analysis: ${reportType}`,
  });

  domains.add('Analytics');
  extractFromKeywords(reportType, skills, domains);
}

function extractFromKeywords(
  text: string,
  skills: ExtractedSkill[],
  domains: Set<string>
): void {
  const lowerText = text.toLowerCase();

  for (const [keyword, mapping] of Object.entries(EXPERTISE_KEYWORDS)) {
    if (lowerText.includes(keyword)) {
      for (const skillName of mapping.skills) {
        // Avoid duplicates
        if (!skills.some((s) => s.name === skillName)) {
          skills.push({
            name: skillName,
            category: mapping.category,
            confidenceBoost: 0.02,
            evidence: `Keyword match: ${keyword}`,
          });
        }
      }
    }
  }
}

function calculateSkillLevel(confidenceTotal: number): number {
  if (confidenceTotal > 0.8) return 5;
  if (confidenceTotal > 0.6) return 4;
  if (confidenceTotal > 0.4) return 3;
  if (confidenceTotal > 0.2) return 2;
  return 1;
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Analyze historical activities to build expertise profile
 */
export async function analyzeHistoricalActivities(
  organizationId: string,
  personId: string,
  activities: ActivityEvent[]
): Promise<ExtractedExpertise> {
  const result = await batchProcessActivities(
    organizationId,
    activities.filter((a) => a.personId === personId)
  );

  return (
    result.get(personId) || {
      skills: [],
      domains: [],
      processExpertise: [],
    }
  );
}

/**
 * Get recommended skills to develop based on activity patterns
 */
export function getSkillGaps(
  currentSkills: ExtractedSkill[],
  targetRole: string
): string[] {
  const roleSkills: Record<string, string[]> = {
    'team_lead': [
      'Leadership',
      'Project Management',
      'Communication',
      'Decision Making',
      'Delegation',
    ],
    'project_manager': [
      'Project Management',
      'Planning',
      'Risk Management',
      'Stakeholder Management',
      'Communication',
    ],
    'senior_developer': [
      'Technical Leadership',
      'Code Review',
      'Architecture',
      'Mentoring',
      'Problem Solving',
    ],
    'finance_manager': [
      'Financial Planning',
      'Budgeting',
      'Controlling',
      'Risk Management',
      'Compliance',
    ],
    'hr_manager': [
      'Human Resources',
      'Recruiting',
      'Performance Management',
      'Labor Law',
      'Conflict Resolution',
    ],
  };

  const required = roleSkills[targetRole] || [];
  const current = new Set(currentSkills.map((s) => s.name.toLowerCase()));

  return required.filter((skill) => !current.has(skill.toLowerCase()));
}

export default {
  extractExpertiseFromActivity,
  processActivityForExpertise,
  batchProcessActivities,
  analyzeHistoricalActivities,
  getSkillGaps,
  EXPERTISE_KEYWORDS,
  ACTIVITY_SKILL_MAPPINGS,
};
