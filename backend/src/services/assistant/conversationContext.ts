/**
 * Conversation Context Builder
 * T074 - Implement conversation context builder
 */

import { type RetrievedContext } from './contextRetriever.js';

// =============================================================================
// Types
// =============================================================================

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Build conversation context for the AI
 */
export function buildConversationContext(
  history: Message[],
  retrievedContext: RetrievedContext[],
  language: 'en' | 'de'
): string {
  const parts: string[] = [];

  // Add retrieved knowledge context
  if (retrievedContext.length > 0) {
    const contextHeader = language === 'de'
      ? '## Relevantes Wissen aus der Wissensbasis:'
      : '## Relevant Knowledge from Knowledge Base:';

    parts.push(contextHeader);
    parts.push('');

    for (const ctx of retrievedContext) {
      const typeLabel = getTypeLabel(ctx.type, language);
      parts.push(`### ${typeLabel}: ${ctx.title}`);
      parts.push(ctx.content);
      parts.push(`(Quelle: ${ctx.source}, Relevanz: ${(ctx.relevanceScore * 100).toFixed(0)}%)`);
      parts.push('');
    }
  }

  // Add conversation history summary if long
  if (history.length > 6) {
    const historyHeader = language === 'de'
      ? '## Zusammenfassung der bisherigen Konversation:'
      : '## Summary of Previous Conversation:';

    parts.push(historyHeader);
    parts.push('');

    // Summarize older messages
    const oldMessages = history.slice(0, -4);
    const topics = extractTopics(oldMessages);
    if (topics.length > 0) {
      const topicsLabel = language === 'de' ? 'Besprochene Themen' : 'Topics discussed';
      parts.push(`${topicsLabel}: ${topics.join(', ')}`);
    }
    parts.push('');
  }

  // Add recent conversation history
  const recentHistory = history.slice(-4);
  if (recentHistory.length > 0) {
    const recentHeader = language === 'de'
      ? '## Letzte Nachrichten:'
      : '## Recent Messages:';

    parts.push(recentHeader);
    parts.push('');

    for (const msg of recentHistory) {
      const roleLabel = msg.role === 'user'
        ? (language === 'de' ? 'Benutzer' : 'User')
        : (language === 'de' ? 'Assistent' : 'Assistant');
      parts.push(`**${roleLabel}**: ${truncateMessage(msg.content, 300)}`);
      parts.push('');
    }
  }

  return parts.join('\n');
}

/**
 * Get localized type label
 */
function getTypeLabel(type: RetrievedContext['type'], language: 'en' | 'de'): string {
  const labels: Record<RetrievedContext['type'], { en: string; de: string }> = {
    process: { en: 'Process', de: 'Prozess' },
    person: { en: 'Person', de: 'Person' },
    document: { en: 'Document', de: 'Dokument' },
    decision: { en: 'Decision', de: 'Entscheidung' },
    relationship: { en: 'Relationship', de: 'Beziehung' },
    metric: { en: 'Metric', de: 'Metrik' },
  };

  return labels[type][language];
}

/**
 * Extract main topics from messages
 */
function extractTopics(messages: Message[]): string[] {
  // Simple topic extraction - would use NLP in production
  const allText = messages.map(m => m.content).join(' ').toLowerCase();

  const topicPatterns = [
    { pattern: /invoice|rechnung|billing/i, topic: 'Invoicing' },
    { pattern: /employee|mitarbeiter|staff/i, topic: 'Employees' },
    { pattern: /process|prozess|workflow/i, topic: 'Processes' },
    { pattern: /report|bericht|analysis/i, topic: 'Reporting' },
    { pattern: /customer|kunde|client/i, topic: 'Customers' },
    { pattern: /sales|verkauf|umsatz/i, topic: 'Sales' },
    { pattern: /support|hilfe|help/i, topic: 'Support' },
    { pattern: /project|projekt/i, topic: 'Projects' },
    { pattern: /compliance|gdpr|dsgvo/i, topic: 'Compliance' },
  ];

  const topics: string[] = [];
  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(allText) && !topics.includes(topic)) {
      topics.push(topic);
    }
  }

  return topics.slice(0, 5);
}

/**
 * Truncate message to specified length
 */
function truncateMessage(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength - 3) + '...';
}

/**
 * Calculate optimal context window size
 */
export function calculateContextWindow(
  history: Message[],
  retrievedContext: RetrievedContext[],
  maxTokens: number = 8000
): { historyLimit: number; contextLimit: number } {
  // Rough estimation: 4 chars per token
  const charsPerToken = 4;
  const maxChars = maxTokens * charsPerToken;

  // Reserve 2000 tokens for response
  const availableChars = (maxTokens - 2000) * charsPerToken;

  // Allocate 60% to retrieved context, 40% to history
  const contextChars = Math.floor(availableChars * 0.6);
  const historyChars = Math.floor(availableChars * 0.4);

  // Calculate limits
  let contextLimit = retrievedContext.length;
  let totalContextChars = retrievedContext.reduce(
    (sum, c) => sum + c.title.length + c.content.length + 100,
    0
  );

  while (totalContextChars > contextChars && contextLimit > 1) {
    contextLimit--;
    totalContextChars = retrievedContext
      .slice(0, contextLimit)
      .reduce((sum, c) => sum + c.title.length + c.content.length + 100, 0);
  }

  let historyLimit = history.length;
  let totalHistoryChars = history.reduce((sum, m) => sum + m.content.length + 50, 0);

  while (totalHistoryChars > historyChars && historyLimit > 2) {
    historyLimit--;
    totalHistoryChars = history
      .slice(-historyLimit)
      .reduce((sum, m) => sum + m.content.length + 50, 0);
  }

  return { historyLimit, contextLimit };
}

export default {
  buildConversationContext,
  calculateContextWindow,
};
