/**
 * Routing Types for OPERATE Tier
 * T021 - Define RoutingRule types
 */

// =============================================================================
// Request & Routing Types
// =============================================================================

export interface RequestCriteria {
  /** Content categories that trigger this rule */
  categories?: string[];
  /** Keywords in subject/content that trigger this rule */
  keywords?: string[];
  /** Sender patterns (email domains, specific addresses) */
  senders?: string[];
  /** Minimum urgency score to trigger (0-1) */
  minUrgency?: number;
  /** Maximum urgency score to trigger (0-1) */
  maxUrgency?: number;
  /** Request types that match */
  requestTypes?: string[];
  /** Custom matching logic (evaluated as expression) */
  customExpression?: string;
}

export interface RouteHandler {
  /** Type of handler */
  type: 'person' | 'team' | 'queue' | 'round_robin';
  /** Person ID if type is 'person' */
  personId?: string;
  /** Team ID if type is 'team' */
  teamId?: string;
  /** Queue name if type is 'queue' */
  queueName?: string;
  /** List of person IDs if type is 'round_robin' */
  roundRobinIds?: string[];
  /** Escalation path if primary handler unavailable */
  escalationPath?: EscalationStep[];
}

export interface EscalationStep {
  /** Wait time before escalating (minutes) */
  waitMinutes: number;
  /** Handler for this escalation level */
  handler: RouteHandler;
  /** Whether to notify the original handler */
  notifyOriginal?: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  description?: string;
  /** Lower number = higher priority */
  priority: number;
  isActive: boolean;
  criteria: RequestCriteria;
  handler: RouteHandler;
  fallbackHandler?: RouteHandler;
  /** Maximum workload before routing elsewhere */
  workloadLimit?: number;
  createdBy: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoutingRuleInput {
  name: string;
  description?: string;
  priority?: number;
  criteria: RequestCriteria;
  handler: RouteHandler;
  fallbackHandler?: RouteHandler;
  workloadLimit?: number;
}

export interface UpdateRoutingRuleInput {
  name?: string;
  description?: string;
  priority?: number;
  isActive?: boolean;
  criteria?: RequestCriteria;
  handler?: RouteHandler;
  fallbackHandler?: RouteHandler;
  workloadLimit?: number;
}

// =============================================================================
// Routing Decision Types
// =============================================================================

export interface RoutingRequest {
  id: string;
  type: string;
  content: string;
  subject?: string;
  senderId?: string;
  senderEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface RoutingDecision {
  id: string;
  requestId: string;
  requestType: string;
  requestContent: string;
  categories: string[];
  urgencyScore: number;
  handlerId: string;
  handlerType: 'person' | 'team' | 'queue';
  handlerName?: string;
  ruleId?: string;
  ruleName?: string;
  confidence: number;
  reasoning: string;
  alternativeHandlers?: AlternativeHandler[];
  responseTime?: number;
  wasEscalated: boolean;
  wasRerouted: boolean;
  feedbackScore?: number;
  feedbackComment?: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlternativeHandler {
  handlerId: string;
  handlerType: 'person' | 'team' | 'queue';
  handlerName?: string;
  confidence: number;
  reason: string;
}

export interface RoutingAnalysisRequest {
  content: string;
  subject?: string;
  type?: string;
  senderId?: string;
  senderEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface RoutingAnalysisResult {
  decision: RoutingDecision;
  matchedRules: Array<{
    ruleId: string;
    ruleName: string;
    matchScore: number;
  }>;
  processingTimeMs: number;
}

export interface RoutingFeedback {
  score: number; // 1-5
  comment?: string;
  category?: 'correct' | 'wrong_person' | 'wrong_priority' | 'too_slow' | 'other';
}

// =============================================================================
// Routing Analytics Types
// =============================================================================

export interface RoutingMetrics {
  totalDecisions: number;
  averageConfidence: number;
  escalationRate: number;
  rerouteRate: number;
  averageResponseTimeMs: number;
  feedbackScore: number;
  accuracyRate: number;
  byRequestType: Record<string, {
    count: number;
    avgConfidence: number;
    avgResponseTime: number;
  }>;
  byHandler: Record<string, {
    count: number;
    avgConfidence: number;
    feedbackScore: number;
  }>;
}

export interface RoutingTrend {
  timestamp: Date;
  totalDecisions: number;
  averageConfidence: number;
  escalationRate: number;
  accuracyRate: number;
}
