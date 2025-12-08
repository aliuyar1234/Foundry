/**
 * Skill-Based Task Matcher
 * T212 - Match tasks to team members based on skills
 *
 * Finds optimal task assignments based on skill matching
 */

// =============================================================================
// Types
// =============================================================================

export interface SkillProfile {
  personId: string;
  personName: string;
  skills: Skill[];
  certifications: string[];
  experienceLevel: 'junior' | 'mid' | 'senior' | 'lead';
  preferences: {
    preferredSkills: string[];
    avoidSkills: string[];
  };
  recentTasks: Array<{
    skill: string;
    successRate: number;
    avgCompletionTime: number;
  }>;
}

export interface Skill {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsExperience: number;
  lastUsed?: Date;
  endorsed: boolean;
}

export interface TaskRequirements {
  taskId: string;
  taskTitle: string;
  requiredSkills: Array<{
    skill: string;
    minLevel: Skill['level'];
    required: boolean;
  }>;
  estimatedHours: number;
  complexity: 'low' | 'medium' | 'high';
  deadline?: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface SkillMatch {
  personId: string;
  personName: string;
  matchScore: number; // 0-100
  skillMatches: Array<{
    skill: string;
    required: boolean;
    requiredLevel: string;
    actualLevel: string;
    match: 'exact' | 'above' | 'below' | 'missing';
  }>;
  capacityFit: {
    currentLoad: number;
    canAccommodate: boolean;
    loadAfterAssignment: number;
  };
  recommendation: 'strongly_recommended' | 'recommended' | 'acceptable' | 'not_recommended';
  reasoning: string[];
}

export interface TeamSkillMatrix {
  teamId: string;
  skills: string[];
  members: Array<{
    personId: string;
    personName: string;
    skillLevels: Record<string, Skill['level'] | 'none'>;
  }>;
  gaps: SkillGap[];
  coverage: SkillCoverage[];
}

export interface SkillGap {
  skill: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentCoverage: number; // number of people with skill
  requiredCoverage: number;
  recommendation: string;
}

export interface SkillCoverage {
  skill: string;
  totalPeople: number;
  byLevel: Record<Skill['level'], number>;
  averageLevel: number;
  trend: 'improving' | 'stable' | 'declining';
}

// =============================================================================
// Skill Level Values
// =============================================================================

const SKILL_LEVEL_VALUES: Record<Skill['level'], number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

// =============================================================================
// Skill Matcher
// =============================================================================

/**
 * Find best matches for a task based on skills
 */
export async function findTaskMatches(
  teamId: string,
  task: TaskRequirements,
  options: {
    limit?: number;
    includeOverloaded?: boolean;
  } = {}
): Promise<SkillMatch[]> {
  const { limit = 5, includeOverloaded = false } = options;

  // Get team skill profiles
  const profiles = await getTeamSkillProfiles(teamId);

  // Score each team member
  const matches: SkillMatch[] = profiles.map((profile) => {
    const skillMatches = scoreSkillMatches(profile, task);
    const skillScore = calculateSkillScore(skillMatches, task);
    const capacityFit = calculateCapacityFit(profile);

    // Combined score
    let matchScore = skillScore * 0.7 + (capacityFit.canAccommodate ? 30 : 0);

    // Adjust for experience level
    if (task.complexity === 'high' && profile.experienceLevel === 'senior') {
      matchScore += 10;
    }
    if (task.complexity === 'high' && profile.experienceLevel === 'junior') {
      matchScore -= 10;
    }

    // Adjust for preferences
    const prefBonus = task.requiredSkills.filter(
      (rs) => profile.preferences.preferredSkills.includes(rs.skill)
    ).length * 5;
    const prefPenalty = task.requiredSkills.filter(
      (rs) => profile.preferences.avoidSkills.includes(rs.skill)
    ).length * 10;
    matchScore += prefBonus - prefPenalty;

    matchScore = Math.max(0, Math.min(100, matchScore));

    const recommendation = getRecommendation(matchScore, capacityFit);
    const reasoning = generateReasoning(skillMatches, capacityFit, profile);

    return {
      personId: profile.personId,
      personName: profile.personName,
      matchScore: Math.round(matchScore),
      skillMatches,
      capacityFit,
      recommendation,
      reasoning,
    };
  });

  // Filter and sort
  const filtered = includeOverloaded
    ? matches
    : matches.filter((m) => m.capacityFit.canAccommodate);

  filtered.sort((a, b) => b.matchScore - a.matchScore);

  return filtered.slice(0, limit);
}

/**
 * Generate team skill matrix
 */
export async function generateSkillMatrix(teamId: string): Promise<TeamSkillMatrix> {
  const profiles = await getTeamSkillProfiles(teamId);

  // Collect all unique skills
  const allSkills = new Set<string>();
  for (const profile of profiles) {
    for (const skill of profile.skills) {
      allSkills.add(skill.name);
    }
  }
  const skills = Array.from(allSkills).sort();

  // Build matrix
  const members = profiles.map((profile) => {
    const skillLevels: Record<string, Skill['level'] | 'none'> = {};
    for (const skill of skills) {
      const profileSkill = profile.skills.find((s) => s.name === skill);
      skillLevels[skill] = profileSkill?.level || 'none';
    }
    return {
      personId: profile.personId,
      personName: profile.personName,
      skillLevels,
    };
  });

  // Calculate coverage
  const coverage = skills.map((skill) => calculateSkillCoverage(skill, profiles));

  // Identify gaps
  const gaps = identifySkillGaps(skills, profiles);

  return {
    teamId,
    skills,
    members,
    gaps,
    coverage,
  };
}

/**
 * Suggest skill development for a person
 */
export async function suggestSkillDevelopment(
  personId: string,
  teamId: string
): Promise<Array<{
  skill: string;
  currentLevel: Skill['level'] | 'none';
  targetLevel: Skill['level'];
  reason: string;
  priority: 'high' | 'medium' | 'low';
  resources: string[];
}>> {
  const profile = await getPersonSkillProfile(personId);
  const matrix = await generateSkillMatrix(teamId);

  const suggestions: Array<{
    skill: string;
    currentLevel: Skill['level'] | 'none';
    targetLevel: Skill['level'];
    reason: string;
    priority: 'high' | 'medium' | 'low';
    resources: string[];
  }> = [];

  // Suggest based on gaps
  for (const gap of matrix.gaps) {
    if (gap.severity === 'critical' || gap.severity === 'high') {
      const currentSkill = profile.skills.find((s) => s.name === gap.skill);
      const currentLevel = currentSkill?.level || 'none';

      if (currentLevel === 'none' || currentLevel === 'beginner') {
        suggestions.push({
          skill: gap.skill,
          currentLevel,
          targetLevel: 'intermediate',
          reason: `Critical skill gap in team: ${gap.recommendation}`,
          priority: gap.severity === 'critical' ? 'high' : 'medium',
          resources: [`Online course: ${gap.skill} fundamentals`, `Mentorship from senior team member`],
        });
      }
    }
  }

  // Suggest based on career growth
  for (const skill of profile.skills) {
    if (skill.level !== 'expert' && profile.preferences.preferredSkills.includes(skill.name)) {
      const nextLevel = getNextLevel(skill.level);
      suggestions.push({
        skill: skill.name,
        currentLevel: skill.level,
        targetLevel: nextLevel,
        reason: 'Preferred skill with growth potential',
        priority: 'medium',
        resources: [`Advanced ${skill.name} training`, 'Challenging projects in this area'],
      });
    }
  }

  return suggestions.slice(0, 5);
}

/**
 * Find skill mentors for a person
 */
export async function findSkillMentors(
  personId: string,
  skill: string,
  teamId: string
): Promise<Array<{
  personId: string;
  personName: string;
  skillLevel: Skill['level'];
  availability: 'high' | 'medium' | 'low';
  mentorScore: number;
}>> {
  const profiles = await getTeamSkillProfiles(teamId);
  const personProfile = profiles.find((p) => p.personId === personId);

  if (!personProfile) {
    throw new Error(`Person not found: ${personId}`);
  }

  const personSkill = personProfile.skills.find((s) => s.name === skill);
  const personLevel = personSkill ? SKILL_LEVEL_VALUES[personSkill.level] : 0;

  const mentors = profiles
    .filter((p) => p.personId !== personId)
    .map((p) => {
      const pSkill = p.skills.find((s) => s.name === skill);
      if (!pSkill || SKILL_LEVEL_VALUES[pSkill.level] <= personLevel) {
        return null;
      }

      const levelDiff = SKILL_LEVEL_VALUES[pSkill.level] - personLevel;
      const availability = Math.random() > 0.5 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low';
      const availabilityScore = availability === 'high' ? 30 : availability === 'medium' ? 20 : 10;

      return {
        personId: p.personId,
        personName: p.personName,
        skillLevel: pSkill.level,
        availability,
        mentorScore: levelDiff * 20 + availabilityScore + (p.experienceLevel === 'senior' ? 10 : 0),
      };
    })
    .filter(Boolean) as Array<{
      personId: string;
      personName: string;
      skillLevel: Skill['level'];
      availability: 'high' | 'medium' | 'low';
      mentorScore: number;
    }>;

  return mentors.sort((a, b) => b.mentorScore - a.mentorScore).slice(0, 3);
}

// =============================================================================
// Helper Functions
// =============================================================================

async function getTeamSkillProfiles(_teamId: string): Promise<SkillProfile[]> {
  // In production, query actual skill data
  const profiles: SkillProfile[] = [];
  const skillPool = ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'SQL', 'DevOps', 'Testing'];

  for (let i = 0; i < 6; i++) {
    const numSkills = 3 + Math.floor(Math.random() * 4);
    const skills: Skill[] = skillPool
      .sort(() => Math.random() - 0.5)
      .slice(0, numSkills)
      .map((name) => ({
        name,
        level: ['beginner', 'intermediate', 'advanced', 'expert'][Math.floor(Math.random() * 4)] as Skill['level'],
        yearsExperience: Math.floor(Math.random() * 8),
        endorsed: Math.random() > 0.5,
      }));

    profiles.push({
      personId: `person-${i}`,
      personName: `Team Member ${i + 1}`,
      skills,
      certifications: Math.random() > 0.5 ? ['AWS Certified'] : [],
      experienceLevel: ['junior', 'mid', 'senior', 'lead'][Math.floor(Math.random() * 4)] as SkillProfile['experienceLevel'],
      preferences: {
        preferredSkills: skills.slice(0, 2).map((s) => s.name),
        avoidSkills: [],
      },
      recentTasks: skills.slice(0, 2).map((s) => ({
        skill: s.name,
        successRate: 70 + Math.random() * 30,
        avgCompletionTime: 4 + Math.random() * 8,
      })),
    });
  }

  return profiles;
}

async function getPersonSkillProfile(personId: string): Promise<SkillProfile> {
  const profiles = await getTeamSkillProfiles('default');
  const profile = profiles.find((p) => p.personId === personId);
  if (!profile) {
    throw new Error(`Person not found: ${personId}`);
  }
  return profile;
}

function scoreSkillMatches(
  profile: SkillProfile,
  task: TaskRequirements
): SkillMatch['skillMatches'] {
  return task.requiredSkills.map((req) => {
    const profileSkill = profile.skills.find((s) => s.name === req.skill);

    if (!profileSkill) {
      return {
        skill: req.skill,
        required: req.required,
        requiredLevel: req.minLevel,
        actualLevel: 'none',
        match: 'missing' as const,
      };
    }

    const requiredValue = SKILL_LEVEL_VALUES[req.minLevel];
    const actualValue = SKILL_LEVEL_VALUES[profileSkill.level];

    let match: 'exact' | 'above' | 'below';
    if (actualValue === requiredValue) match = 'exact';
    else if (actualValue > requiredValue) match = 'above';
    else match = 'below';

    return {
      skill: req.skill,
      required: req.required,
      requiredLevel: req.minLevel,
      actualLevel: profileSkill.level,
      match,
    };
  });
}

function calculateSkillScore(matches: SkillMatch['skillMatches'], task: TaskRequirements): number {
  let score = 0;
  let maxScore = 0;

  for (const match of matches) {
    const weight = match.required ? 20 : 10;
    maxScore += weight;

    switch (match.match) {
      case 'exact':
        score += weight;
        break;
      case 'above':
        score += weight * 1.1; // Slight bonus for exceeding requirements
        break;
      case 'below':
        score += weight * 0.5;
        break;
      case 'missing':
        score += match.required ? 0 : weight * 0.2;
        break;
    }
  }

  return maxScore > 0 ? (score / maxScore) * 70 : 50;
}

function calculateCapacityFit(_profile: SkillProfile): SkillMatch['capacityFit'] {
  // Simulated capacity check
  const currentLoad = 50 + Math.floor(Math.random() * 40);
  const taskLoad = 10 + Math.floor(Math.random() * 15);

  return {
    currentLoad,
    canAccommodate: currentLoad + taskLoad <= 100,
    loadAfterAssignment: currentLoad + taskLoad,
  };
}

function getRecommendation(
  matchScore: number,
  capacityFit: SkillMatch['capacityFit']
): SkillMatch['recommendation'] {
  if (!capacityFit.canAccommodate) return 'not_recommended';
  if (matchScore >= 80) return 'strongly_recommended';
  if (matchScore >= 60) return 'recommended';
  if (matchScore >= 40) return 'acceptable';
  return 'not_recommended';
}

function generateReasoning(
  skillMatches: SkillMatch['skillMatches'],
  capacityFit: SkillMatch['capacityFit'],
  profile: SkillProfile
): string[] {
  const reasons: string[] = [];

  const exactMatches = skillMatches.filter((m) => m.match === 'exact' || m.match === 'above').length;
  const missingRequired = skillMatches.filter((m) => m.required && m.match === 'missing').length;

  if (exactMatches === skillMatches.length) {
    reasons.push('All required skills matched or exceeded');
  } else if (missingRequired > 0) {
    reasons.push(`Missing ${missingRequired} required skill(s)`);
  }

  if (capacityFit.canAccommodate) {
    reasons.push(`Has ${100 - capacityFit.currentLoad}% available capacity`);
  } else {
    reasons.push('Currently at or over capacity');
  }

  if (profile.experienceLevel === 'senior' || profile.experienceLevel === 'lead') {
    reasons.push('Senior experience level');
  }

  return reasons;
}

function calculateSkillCoverage(skill: string, profiles: SkillProfile[]): SkillCoverage {
  const byLevel: Record<Skill['level'], number> = {
    beginner: 0,
    intermediate: 0,
    advanced: 0,
    expert: 0,
  };

  let totalLevel = 0;
  let count = 0;

  for (const profile of profiles) {
    const profileSkill = profile.skills.find((s) => s.name === skill);
    if (profileSkill) {
      byLevel[profileSkill.level]++;
      totalLevel += SKILL_LEVEL_VALUES[profileSkill.level];
      count++;
    }
  }

  return {
    skill,
    totalPeople: count,
    byLevel,
    averageLevel: count > 0 ? totalLevel / count : 0,
    trend: 'stable', // Would be calculated from historical data
  };
}

function identifySkillGaps(skills: string[], profiles: SkillProfile[]): SkillGap[] {
  const gaps: SkillGap[] = [];

  for (const skill of skills) {
    const coverage = profiles.filter((p) =>
      p.skills.some((s) => s.name === skill && SKILL_LEVEL_VALUES[s.level] >= 2)
    ).length;

    const requiredCoverage = Math.ceil(profiles.length * 0.3); // At least 30% should have each skill

    if (coverage < requiredCoverage) {
      gaps.push({
        skill,
        severity: coverage === 0 ? 'critical' : coverage < requiredCoverage / 2 ? 'high' : 'medium',
        currentCoverage: coverage,
        requiredCoverage,
        recommendation: coverage === 0
          ? `No team members proficient in ${skill}. Consider hiring or training.`
          : `Limited ${skill} coverage. Cross-train additional team members.`,
      });
    }
  }

  return gaps;
}

function getNextLevel(current: Skill['level']): Skill['level'] {
  const progression: Record<Skill['level'], Skill['level']> = {
    beginner: 'intermediate',
    intermediate: 'advanced',
    advanced: 'expert',
    expert: 'expert',
  };
  return progression[current];
}

// =============================================================================
// Exports
// =============================================================================

export default {
  findTaskMatches,
  generateSkillMatrix,
  suggestSkillDevelopment,
  findSkillMentors,
};
