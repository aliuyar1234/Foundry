/**
 * Assessment Types
 */

export const AssessmentType = {
  ERP_READINESS: 'ERP_READINESS',
  AI_READINESS: 'AI_READINESS',
  DATA_QUALITY: 'DATA_QUALITY',
  PROCESS_MATURITY: 'PROCESS_MATURITY',
} as const;

export type AssessmentType = (typeof AssessmentType)[keyof typeof AssessmentType];

export const AssessmentStatus = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type AssessmentStatus = (typeof AssessmentStatus)[keyof typeof AssessmentStatus];

export interface Assessment {
  id: string;
  type: AssessmentType;
  status: AssessmentStatus;
  overallScore?: number;
  scores?: AssessmentScores;
  findings?: Finding[];
  recommendations?: Recommendation[];
  targetSystem?: string;
  generatedAt?: Date;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssessmentScores {
  overall: number;
  dimensions: DimensionScore[];
}

export interface DimensionScore {
  name: string;
  score: number;
  weight: number;
  subScores?: SubScore[];
}

export interface SubScore {
  name: string;
  score: number;
  details?: string;
}

export interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  evidence?: string[];
  impact?: string;
}

export interface Recommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  estimatedEffort?: EffortEstimate;
  relatedFindings?: string[];
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

export interface EffortEstimate {
  value: number;
  unit: 'hours' | 'days' | 'weeks' | 'months';
  confidence: 'low' | 'medium' | 'high';
}

export interface CreateAssessmentRequest {
  type: AssessmentType;
  targetSystem?: string;
}

export interface AssessmentSummary {
  id: string;
  type: AssessmentType;
  status: AssessmentStatus;
  overallScore?: number;
  findingCount: number;
  recommendationCount: number;
  createdAt: Date;
}

// SOP Types
export const SOPStatus = {
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type SOPStatus = (typeof SOPStatus)[keyof typeof SOPStatus];

export interface SOP {
  id: string;
  processId: string;
  title: string;
  version: number;
  status: SOPStatus;
  content: SOPContent;
  confidence?: number;
  editDistance?: number;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface SOPContent {
  purpose: string;
  scope: string;
  responsibilities: Responsibility[];
  steps: SOPStep[];
  decisionPoints: DecisionPoint[];
  references?: string[];
  revisionHistory?: RevisionEntry[];
}

export interface Responsibility {
  role: string;
  responsibilities: string[];
}

export interface SOPStep {
  number: number;
  title: string;
  description: string;
  actor?: string;
  expectedDuration?: string;
  inputs?: string[];
  outputs?: string[];
  notes?: string[];
}

export interface DecisionPoint {
  stepNumber: number;
  question: string;
  options: DecisionOption[];
}

export interface DecisionOption {
  condition: string;
  nextStep: number | 'end';
}

export interface RevisionEntry {
  version: number;
  date: Date;
  author: string;
  changes: string;
}

export interface CreateSOPRequest {
  processId: string;
  title: string;
}

export interface UpdateSOPRequest {
  title?: string;
  content?: Partial<SOPContent>;
  status?: SOPStatus;
}

export interface SOPSummary {
  id: string;
  processId: string;
  title: string;
  version: number;
  status: SOPStatus;
  confidence?: number;
  createdAt: Date;
  updatedAt: Date;
}
