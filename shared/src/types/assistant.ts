/**
 * AI Assistant Types for OPERATE Tier
 * T023 - Define ConversationSession types
 */

// =============================================================================
// Conversation Session Types
// =============================================================================

export interface ConversationSession {
  id: string;
  userId: string;
  title?: string;
  context: ConversationContext;
  lastActivityAt: Date;
  messageCount: number;
  tokensUsed: number;
  organizationId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ConversationContext {
  /** Summary of conversation so far */
  summary?: string;
  /** Key topics discussed */
  topics: string[];
  /** Entities mentioned (people, processes, documents) */
  mentionedEntities: MentionedEntity[];
  /** User preferences detected */
  preferences: Record<string, unknown>;
  /** Language detected/preferred */
  language: 'en' | 'de';
}

export interface MentionedEntity {
  type: 'person' | 'process' | 'document' | 'team' | 'system';
  id: string;
  name: string;
  mentionCount: number;
  lastMentioned: Date;
}

export interface CreateSessionInput {
  title?: string;
  initialContext?: Partial<ConversationContext>;
  language?: 'en' | 'de';
}

// =============================================================================
// Conversation Message Types
// =============================================================================

export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  toolCalls?: ToolCall[];
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  createdAt: Date;
}

export interface Citation {
  id: string;
  type: 'document' | 'email' | 'process' | 'person' | 'knowledge_base';
  sourceId: string;
  sourceName: string;
  sourceUrl?: string;
  excerpt: string;
  relevanceScore: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: unknown;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

// =============================================================================
// Chat Request/Response Types
// =============================================================================

export interface ChatRequest {
  message: string;
  /** Continue existing session */
  sessionId?: string;
  /** Override language for this message */
  language?: 'en' | 'de';
  /** Additional context to include */
  context?: {
    currentPage?: string;
    selectedEntityId?: string;
    selectedEntityType?: string;
  };
  /** Stream response via SSE */
  stream?: boolean;
}

export interface ChatResponse {
  sessionId: string;
  message: ConversationMessage;
  suggestedFollowUps?: string[];
}

export interface StreamingChatEvent {
  type: 'start' | 'content' | 'citation' | 'tool_call' | 'complete' | 'error';
  sessionId: string;
  messageId?: string;
  content?: string;
  citation?: Citation;
  toolCall?: ToolCall;
  error?: string;
}

// =============================================================================
// AI Assistant Capabilities
// =============================================================================

export interface AssistantCapability {
  id: string;
  name: string;
  description: string;
  examples: string[];
  requiredPermissions: string[];
}

export const ASSISTANT_CAPABILITIES: AssistantCapability[] = [
  {
    id: 'search_knowledge',
    name: 'Search Organizational Knowledge',
    description: 'Search documents, emails, and communications',
    examples: [
      'Find documents about the Q4 budget',
      'Who sent emails about the project deadline?',
    ],
    requiredPermissions: ['read:documents', 'read:communications'],
  },
  {
    id: 'find_people',
    name: 'Find People & Expertise',
    description: 'Find people with specific skills or responsibilities',
    examples: [
      'Who is the expert on SAP integration?',
      'Find someone who speaks German in the sales team',
    ],
    requiredPermissions: ['read:people'],
  },
  {
    id: 'explain_processes',
    name: 'Explain Processes',
    description: 'Explain how processes work based on discovered patterns',
    examples: [
      'How does the invoice approval process work?',
      'What are the steps for onboarding a new customer?',
    ],
    requiredPermissions: ['read:processes'],
  },
  {
    id: 'analyze_metrics',
    name: 'Analyze Metrics',
    description: 'Analyze organizational metrics and trends',
    examples: [
      'What is the average response time for support tickets?',
      'How has email volume changed this month?',
    ],
    requiredPermissions: ['read:metrics'],
  },
  {
    id: 'suggest_actions',
    name: 'Suggest Actions',
    description: 'Suggest next steps or improvements',
    examples: [
      'What should I do next on this project?',
      'How can we improve this process?',
    ],
    requiredPermissions: ['read:processes', 'read:metrics'],
  },
];

// =============================================================================
// DACH Business Terminology
// =============================================================================

export interface TerminologyMapping {
  english: string;
  german: string;
  context?: string;
}

export const DACH_TERMINOLOGY: TerminologyMapping[] = [
  { english: 'Invoice', german: 'Rechnung' },
  { english: 'Credit Note', german: 'Gutschrift' },
  { english: 'Purchase Order', german: 'Bestellung' },
  { english: 'Delivery Note', german: 'Lieferschein' },
  { english: 'Managing Director', german: 'Geschäftsführer' },
  { english: 'Board Member', german: 'Vorstand' },
  { english: 'Works Council', german: 'Betriebsrat' },
  { english: 'Cost Center', german: 'Kostenstelle' },
  { english: 'Chart of Accounts', german: 'Kontenrahmen' },
  { english: 'VAT', german: 'Umsatzsteuer/MwSt' },
  { english: 'Fiscal Year', german: 'Geschäftsjahr' },
  { english: 'Annual Report', german: 'Jahresbericht' },
  { english: 'Audit', german: 'Prüfung/Revision' },
  { english: 'Subsidiary', german: 'Tochtergesellschaft' },
  { english: 'Holding Company', german: 'Holdinggesellschaft' },
];
