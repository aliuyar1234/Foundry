/**
 * Conversation Service (T035, T037)
 * Manages conversational search with context and AI-generated answers
 */

import { Redis } from 'ioredis';
import { getSearchService, SearchService, SearchResult } from './search.service.js';
import { generateCompletion, CLAUDE_MODELS } from '../../lib/anthropic.js';
import { logger } from '../../lib/logger.js';

/**
 * Conversation message
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Conversation context
 */
export interface ConversationContext {
  id: string;
  tenantId: string;
  userId: string;
  messages: ConversationMessage[];
  searchResults: SearchResult[];
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * Conversational search response
 */
export interface ConversationalResponse {
  answer: string;
  sources: SearchResult[];
  confidence: number;
  followUpQuestions: string[];
  conversationId: string;
}

/**
 * Redis key prefix for conversations
 */
const CONVERSATION_PREFIX = 'conv:';
const CONVERSATION_TTL = 3600; // 1 hour

/**
 * ConversationService - Manages conversational search with context
 */
export class ConversationService {
  private searchService: SearchService;
  private redis: Redis;

  constructor() {
    this.searchService = getSearchService();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  /**
   * Start a new conversation
   */
  async startConversation(
    tenantId: string,
    userId: string,
    initialQuery: string
  ): Promise<ConversationalResponse> {
    const conversationId = this.generateConversationId();

    // Create conversation context
    const context: ConversationContext = {
      id: conversationId,
      tenantId,
      userId,
      messages: [],
      searchResults: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    // Process the initial query
    return this.processQuery(context, initialQuery);
  }

  /**
   * Continue an existing conversation
   */
  async continueConversation(
    conversationId: string,
    followUpQuery: string
  ): Promise<ConversationalResponse> {
    // Load conversation context
    const context = await this.loadConversation(conversationId);

    if (!context) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Process the follow-up query
    return this.processQuery(context, followUpQuery);
  }

  /**
   * Process a query within a conversation (T037)
   */
  private async processQuery(
    context: ConversationContext,
    query: string
  ): Promise<ConversationalResponse> {
    logger.info(
      { conversationId: context.id, query },
      'Processing conversational query'
    );

    // Add user message
    context.messages.push({
      role: 'user',
      content: query,
      timestamp: new Date(),
    });

    // Determine if this is a follow-up or new search
    const isFollowUp = context.messages.length > 1;
    const enhancedQuery = isFollowUp
      ? this.enhanceQueryWithContext(query, context)
      : query;

    // Perform search
    const searchResults = await this.searchService.search(
      enhancedQuery,
      context.tenantId,
      { limit: 5 }
    );

    // Update context with new results
    context.searchResults = searchResults;

    // Generate AI answer
    const { answer, confidence, followUpQuestions } = await this.generateAnswer(
      query,
      context
    );

    // Add assistant message
    context.messages.push({
      role: 'assistant',
      content: answer,
      timestamp: new Date(),
    });

    // Update last activity
    context.lastActivityAt = new Date();

    // Save conversation
    await this.saveConversation(context);

    return {
      answer,
      sources: searchResults,
      confidence,
      followUpQuestions,
      conversationId: context.id,
    };
  }

  /**
   * Enhance query with conversation context
   */
  private enhanceQueryWithContext(
    query: string,
    context: ConversationContext
  ): string {
    // Get recent messages for context
    const recentMessages = context.messages.slice(-4);
    const contextSummary = recentMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
      .join('\n');

    // If query seems like a follow-up, combine with previous context
    const followUpIndicators = ['what', 'how', 'why', 'can you', 'tell me more', 'explain', 'and'];
    const lowerQuery = query.toLowerCase();
    const isFollowUp = followUpIndicators.some((indicator) =>
      lowerQuery.startsWith(indicator)
    );

    if (isFollowUp && context.searchResults.length > 0) {
      // Include relevant terms from previous results
      const previousTerms = context.searchResults
        .map((r) => r.content.split(/\s+/).slice(0, 10).join(' '))
        .join(' ');

      return `${query} (context: ${previousTerms.slice(0, 200)})`;
    }

    return query;
  }

  /**
   * Generate AI answer using Claude (T037)
   */
  private async generateAnswer(
    query: string,
    context: ConversationContext
  ): Promise<{
    answer: string;
    confidence: number;
    followUpQuestions: string[];
  }> {
    // Build context from search results
    const sourcesContext = context.searchResults
      .map(
        (r, i) =>
          `[Source ${i + 1}] (${r.sourceType}, score: ${r.score.toFixed(2)})\n${r.content}`
      )
      .join('\n\n');

    // Build conversation history
    const conversationHistory = context.messages
      .slice(-6) // Last 3 exchanges
      .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a knowledgeable assistant helping users find information within their organization's documents and communications.

Your task is to:
1. Answer the user's question based on the provided sources
2. Always cite your sources using [Source N] notation
3. If the sources don't contain enough information, acknowledge this honestly
4. Suggest 2-3 relevant follow-up questions the user might want to ask

Context from organization's knowledge base:
${sourcesContext || 'No relevant sources found.'}

${conversationHistory ? `Previous conversation:\n${conversationHistory}` : ''}`;

    const userMessage = `Question: ${query}

Please provide a helpful answer based on the sources above. If the sources don't contain relevant information, say so. End your response with 2-3 suggested follow-up questions.`;

    try {
      const response = await generateCompletion(
        systemPrompt,
        [{ role: 'user', content: userMessage }],
        { model: CLAUDE_MODELS.SONNET, maxTokens: 1024 }
      );

      // Parse response to extract answer and follow-up questions
      const { answer, followUpQuestions } = this.parseResponse(response);

      // Calculate confidence based on source quality
      const confidence = this.calculateConfidence(context.searchResults);

      return { answer, confidence, followUpQuestions };
    } catch (error) {
      logger.error({ error }, 'Failed to generate AI answer');

      // Fallback response
      return {
        answer: context.searchResults.length > 0
          ? `Based on the search results, here are the most relevant findings:\n\n${context.searchResults
              .slice(0, 3)
              .map((r) => `- ${r.content.slice(0, 200)}...`)
              .join('\n')}`
          : 'I could not find relevant information to answer your question. Please try rephrasing or asking a different question.',
        confidence: 0.3,
        followUpQuestions: [
          'Can you provide more details about what you\'re looking for?',
          'Would you like to search for a specific topic?',
        ],
      };
    }
  }

  /**
   * Parse AI response to extract answer and follow-up questions
   */
  private parseResponse(response: string): {
    answer: string;
    followUpQuestions: string[];
  } {
    const followUpQuestions: string[] = [];

    // Try to find follow-up questions section
    const followUpPatterns = [
      /follow-up questions?:?\s*([\s\S]*?)$/i,
      /suggested questions?:?\s*([\s\S]*?)$/i,
      /you might also ask:?\s*([\s\S]*?)$/i,
    ];

    let answer = response;
    for (const pattern of followUpPatterns) {
      const match = response.match(pattern);
      if (match) {
        answer = response.slice(0, match.index).trim();

        // Extract individual questions
        const questionsText = match[1];
        const questions = questionsText
          .split(/[\n•\-\d.]+/)
          .map((q) => q.trim())
          .filter((q) => q.length > 10 && q.endsWith('?'));

        followUpQuestions.push(...questions.slice(0, 3));
        break;
      }
    }

    return { answer, followUpQuestions };
  }

  /**
   * Calculate confidence based on search results
   */
  private calculateConfidence(results: SearchResult[]): number {
    if (results.length === 0) {
      return 0.1;
    }

    // Average of top 3 scores, weighted
    const topScores = results.slice(0, 3).map((r) => r.score);
    const avgScore = topScores.reduce((a, b) => a + b, 0) / topScores.length;

    // Factor in number of results
    const countBonus = Math.min(results.length / 10, 0.2);

    return Math.min(avgScore + countBonus, 1.0);
  }

  /**
   * Save conversation to Redis (T035)
   */
  private async saveConversation(context: ConversationContext): Promise<void> {
    const key = `${CONVERSATION_PREFIX}${context.id}`;
    await this.redis.setex(key, CONVERSATION_TTL, JSON.stringify(context));
  }

  /**
   * Load conversation from Redis
   */
  private async loadConversation(
    conversationId: string
  ): Promise<ConversationContext | null> {
    const key = `${CONVERSATION_PREFIX}${conversationId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    const context = JSON.parse(data) as ConversationContext;

    // Convert date strings back to Date objects
    context.createdAt = new Date(context.createdAt);
    context.lastActivityAt = new Date(context.lastActivityAt);
    context.messages = context.messages.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));

    // Refresh TTL
    await this.redis.expire(key, CONVERSATION_TTL);

    return context;
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const key = `${CONVERSATION_PREFIX}${conversationId}`;
    await this.redis.del(key);
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    conversationId: string
  ): Promise<ConversationMessage[] | null> {
    const context = await this.loadConversation(conversationId);
    return context?.messages ?? null;
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Cleanup on shutdown
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton instance
let conversationServiceInstance: ConversationService | null = null;

export function getConversationService(): ConversationService {
  if (!conversationServiceInstance) {
    conversationServiceInstance = new ConversationService();
  }
  return conversationServiceInstance;
}
