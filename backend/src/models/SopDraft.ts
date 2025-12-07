/**
 * SOP Draft Model (T077)
 * Types and utilities for automated SOP generation
 */

import { SopDraftStatus } from '@prisma/client';

/**
 * SOP draft representing an auto-generated standard operating procedure
 */
export interface SopDraft {
  id: string;
  tenantId: string;
  processId: string;
  title: string;
  version: string;
  status: SopDraftStatus;
  content: SopContent;
  metadata: SopMetadata;
  generationParams: SopGenerationParams;
  reviewHistory: SopReviewEntry[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

/**
 * Structured SOP content
 */
export interface SopContent {
  purpose: string;
  scope: string;
  definitions: SopDefinition[];
  responsibilities: SopResponsibility[];
  prerequisites: string[];
  procedures: SopProcedure[];
  qualityChecks: SopQualityCheck[];
  exceptions: SopException[];
  references: SopReference[];
  revisionHistory: SopRevision[];
}

/**
 * Definition/glossary entry
 */
export interface SopDefinition {
  term: string;
  definition: string;
}

/**
 * Role responsibility
 */
export interface SopResponsibility {
  role: string;
  responsibilities: string[];
}

/**
 * Procedure step
 */
export interface SopProcedure {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  substeps: SopSubstep[];
  responsible: string;
  duration?: string;
  tools?: string[];
  inputs?: string[];
  outputs?: string[];
  notes?: string[];
  warnings?: string[];
}

/**
 * Substep within a procedure
 */
export interface SopSubstep {
  id: string;
  stepNumber: string;
  description: string;
  optional?: boolean;
}

/**
 * Quality check
 */
export interface SopQualityCheck {
  id: string;
  checkpoint: string;
  criteria: string;
  frequency: string;
  responsible: string;
}

/**
 * Exception handling
 */
export interface SopException {
  id: string;
  condition: string;
  action: string;
  escalation?: string;
}

/**
 * Reference document
 */
export interface SopReference {
  id: string;
  title: string;
  type: string;
  location?: string;
}

/**
 * Revision entry
 */
export interface SopRevision {
  version: string;
  date: string;
  author: string;
  changes: string;
}

/**
 * SOP metadata
 */
export interface SopMetadata {
  author: string;
  department?: string;
  category?: string;
  tags: string[];
  effectiveDate?: Date;
  reviewDate?: Date;
  approvers: string[];
  confidentiality?: 'public' | 'internal' | 'confidential' | 'restricted';
}

/**
 * Parameters used for SOP generation
 */
export interface SopGenerationParams {
  sourceEvents: string[];
  sourceDocuments: string[];
  sourceDecisions: string[];
  modelUsed: string;
  temperature: number;
  focusAreas?: string[];
  excludePatterns?: string[];
  detailLevel: 'summary' | 'standard' | 'detailed';
}

/**
 * Review history entry
 */
export interface SopReviewEntry {
  id: string;
  reviewer: string;
  action: 'approve' | 'reject' | 'comment' | 'edit';
  comments: string;
  timestamp: Date;
  changes?: SopContentDiff[];
}

/**
 * Content diff for tracking changes
 */
export interface SopContentDiff {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Input for creating an SOP draft
 */
export interface CreateSopDraftInput {
  tenantId: string;
  processId: string;
  title: string;
  content: SopContent;
  metadata: SopMetadata;
  generationParams: SopGenerationParams;
}

/**
 * Input for updating an SOP draft
 */
export interface UpdateSopDraftInput {
  title?: string;
  content?: Partial<SopContent>;
  metadata?: Partial<SopMetadata>;
  status?: SopDraftStatus;
}

/**
 * SOP generation request
 */
export interface SopGenerationRequest {
  processId: string;
  tenantId: string;
  options?: {
    detailLevel?: 'summary' | 'standard' | 'detailed';
    focusAreas?: string[];
    includeDecisions?: boolean;
    includeQualityChecks?: boolean;
    customInstructions?: string;
  };
}

/**
 * SOP template for generation
 */
export interface SopTemplate {
  id: string;
  name: string;
  description: string;
  structure: Partial<SopContent>;
  defaultMetadata: Partial<SopMetadata>;
}

/**
 * Default SOP metadata
 */
export const SOP_DEFAULTS = {
  status: 'DRAFT' as SopDraftStatus,
  version: '1.0.0',
  confidentiality: 'internal' as const,
  detailLevel: 'standard' as const,
};

/**
 * Increment version number
 */
export function incrementVersion(version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
  const parts = version.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
    default:
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

/**
 * Calculate SOP completeness score
 */
export function calculateCompletenessScore(content: SopContent): number {
  let score = 0;
  const weights = {
    purpose: 10,
    scope: 10,
    definitions: 5,
    responsibilities: 15,
    prerequisites: 5,
    procedures: 30,
    qualityChecks: 10,
    exceptions: 10,
    references: 5,
  };

  if (content.purpose?.length > 0) score += weights.purpose;
  if (content.scope?.length > 0) score += weights.scope;
  if (content.definitions?.length > 0) score += weights.definitions;
  if (content.responsibilities?.length > 0) score += weights.responsibilities;
  if (content.prerequisites?.length > 0) score += weights.prerequisites;
  if (content.procedures?.length > 0) score += weights.procedures;
  if (content.qualityChecks?.length > 0) score += weights.qualityChecks;
  if (content.exceptions?.length > 0) score += weights.exceptions;
  if (content.references?.length > 0) score += weights.references;

  return score;
}

/**
 * Validate SOP content structure
 */
export function validateSopContent(content: SopContent): string[] {
  const errors: string[] = [];

  if (!content.purpose || content.purpose.length < 10) {
    errors.push('Purpose section is missing or too short');
  }

  if (!content.scope || content.scope.length < 10) {
    errors.push('Scope section is missing or too short');
  }

  if (!content.procedures || content.procedures.length === 0) {
    errors.push('At least one procedure step is required');
  }

  if (!content.responsibilities || content.responsibilities.length === 0) {
    errors.push('At least one responsibility assignment is required');
  }

  return errors;
}
