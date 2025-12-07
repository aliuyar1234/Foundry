/**
 * Decision Record Model (T062)
 * Types and utilities for decision archaeology
 */

import { DecisionStatus } from '@prisma/client';

/**
 * Decision record representing a discovered or documented decision
 */
export interface DecisionRecord {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  context: string | null;
  alternatives: DecisionAlternative[];
  outcome: string | null;
  rationale: string | null;
  status: DecisionStatus;
  confidence: number;
  sourceType: string;
  sourceId: string | null;
  sourceMetadata: Record<string, unknown>;
  decisionMakers: string[];
  stakeholders: string[];
  impactAreas: string[];
  tags: string[];
  decisionDate: Date | null;
  effectiveDate: Date | null;
  reviewDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Alternative considered during decision making
 */
export interface DecisionAlternative {
  id: string;
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  wasChosen: boolean;
}

/**
 * Input for creating a decision record
 */
export interface CreateDecisionRecordInput {
  tenantId: string;
  title: string;
  description: string;
  context?: string;
  alternatives?: DecisionAlternative[];
  outcome?: string;
  rationale?: string;
  status?: DecisionStatus;
  confidence?: number;
  sourceType: string;
  sourceId?: string;
  sourceMetadata?: Record<string, unknown>;
  decisionMakers?: string[];
  stakeholders?: string[];
  impactAreas?: string[];
  tags?: string[];
  decisionDate?: Date;
  effectiveDate?: Date;
  reviewDate?: Date;
}

/**
 * Input for updating a decision record
 */
export interface UpdateDecisionRecordInput {
  title?: string;
  description?: string;
  context?: string;
  alternatives?: DecisionAlternative[];
  outcome?: string;
  rationale?: string;
  status?: DecisionStatus;
  confidence?: number;
  decisionMakers?: string[];
  stakeholders?: string[];
  impactAreas?: string[];
  tags?: string[];
  decisionDate?: Date;
  effectiveDate?: Date;
  reviewDate?: Date;
}

/**
 * Filters for querying decisions
 */
export interface DecisionRecordFilters {
  tenantId: string;
  status?: DecisionStatus;
  sourceType?: string;
  decisionMaker?: string;
  impactArea?: string;
  tag?: string;
  minConfidence?: number;
  startDate?: Date;
  endDate?: Date;
  searchText?: string;
}

/**
 * Decision extraction result from AI analysis
 */
export interface ExtractedDecision {
  title: string;
  description: string;
  context?: string;
  alternatives?: Omit<DecisionAlternative, 'id'>[];
  outcome?: string;
  rationale?: string;
  confidence: number;
  decisionMakers?: string[];
  impactAreas?: string[];
  decisionDate?: string;
}

/**
 * Decision timeline entry
 */
export interface DecisionTimelineEntry {
  id: string;
  title: string;
  status: DecisionStatus;
  decisionDate: Date | null;
  confidence: number;
  impactAreas: string[];
}

/**
 * Decision impact analysis result
 */
export interface DecisionImpactAnalysis {
  decisionId: string;
  affectedProcesses: string[];
  affectedPeople: string[];
  affectedDocuments: string[];
  upstreamDecisions: string[];
  downstreamDecisions: string[];
  riskScore: number;
  impactSummary: string;
}

/**
 * Default values for decision records
 */
export const DECISION_DEFAULTS = {
  status: 'DRAFT' as DecisionStatus,
  confidence: 0.5,
  alternatives: [] as DecisionAlternative[],
  decisionMakers: [] as string[],
  stakeholders: [] as string[],
  impactAreas: [] as string[],
  tags: [] as string[],
};

/**
 * Validate confidence score
 */
export function validateConfidence(confidence: number): boolean {
  return confidence >= 0 && confidence <= 1;
}

/**
 * Calculate average confidence for a set of decisions
 */
export function calculateAverageConfidence(decisions: DecisionRecord[]): number {
  if (decisions.length === 0) return 0;
  const sum = decisions.reduce((acc, d) => acc + d.confidence, 0);
  return sum / decisions.length;
}

/**
 * Group decisions by status
 */
export function groupDecisionsByStatus(
  decisions: DecisionRecord[]
): Record<DecisionStatus, DecisionRecord[]> {
  return decisions.reduce(
    (acc, decision) => {
      if (!acc[decision.status]) {
        acc[decision.status] = [];
      }
      acc[decision.status].push(decision);
      return acc;
    },
    {} as Record<DecisionStatus, DecisionRecord[]>
  );
}
