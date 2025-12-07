/**
 * Assistant Services Index
 * Exports all assistant-related services
 */

// Context retrieval
export {
  retrieveContext,
  type RetrievedContext,
  type ContextQuery,
} from './contextRetriever.js';

// Chat service
export {
  createSession,
  getSession,
  getUserSessions,
  deleteSession,
  getSessionMessages,
  sendMessage,
  sendMessageStream,
  type ChatSession,
  type ChatMessage,
  type Citation,
  type SendMessageOptions,
} from './chatService.js';

// Response generation
export {
  generateResponse,
  generateResponseStream,
  type GenerateOptions,
  type GeneratedResponse,
} from './responseGenerator.js';

// Conversation context
export {
  buildConversationContext,
  calculateContextWindow,
} from './conversationContext.js';

// Permission filtering
export {
  filterByPermissions,
  validateQueryPermissions,
  redactSensitiveInfo,
} from './permissionFilter.js';

// Language detection
export {
  detectLanguage,
  detectLanguageWithConfidence,
  isMultilingual,
  getResponseLanguage,
  type SupportedLanguage,
} from './languageDetector.js';

// Response formatting
export {
  formatResponse,
  formatWithCitations,
  formatErrorMessage,
  formatSuggestedQuestions,
  cleanWhitespace,
} from './responseFormatter.js';

// Terminology mapping
export {
  mapTerm,
  translateTerms,
  getTermsByCategory,
  suggestTerms,
  isKnownTerm,
  getTermInfo,
  BUSINESS_TERMS,
} from './terminologyMapper.js';
