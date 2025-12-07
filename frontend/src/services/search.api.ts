/**
 * Search API Service (T038)
 * Frontend API client for semantic search
 */

import { apiClient } from './apiClient';

/**
 * Source types
 */
export type SourceType = 'DOCUMENT' | 'EMAIL' | 'MESSAGE' | 'MEETING';

/**
 * Search result
 */
export interface SearchResult {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  score: number;
  content: string;
  highlights: string[];
  metadata: {
    authorId?: string;
    authorName?: string;
    title?: string;
    category?: string;
    createdAt: string;
    threadId?: string;
  };
}

/**
 * Search request options
 */
export interface SearchOptions {
  limit?: number;
  sourceTypes?: SourceType[];
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  vectorWeight?: number;
  keywordWeight?: number;
  recencyWeight?: number;
}

/**
 * Search response
 */
export interface SearchResponse {
  success: boolean;
  data?: {
    query: string;
    results: SearchResult[];
    count: number;
  };
  error?: string;
}

/**
 * Conversational response
 */
export interface ConversationalResponse {
  success: boolean;
  data?: {
    answer: string;
    sources: SearchResult[];
    confidence: number;
    followUpQuestions: string[];
    conversationId: string;
  };
  error?: string;
}

/**
 * Conversation message
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * Conversation history response
 */
export interface ConversationHistoryResponse {
  success: boolean;
  data?: {
    conversationId: string;
    messages: ConversationMessage[];
  };
  error?: string;
}

/**
 * Similar documents response
 */
export interface SimilarResponse {
  success: boolean;
  data?: {
    sourceId: string;
    similarDocuments: SearchResult[];
    count: number;
  };
  error?: string;
}

/**
 * Search API client
 */
export const searchApi = {
  /**
   * Perform semantic search
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    return apiClient.post<SearchResponse>('/v1/search', {
      query,
      ...options,
    });
  },

  /**
   * Perform vector-only search
   */
  async vectorSearch(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    return apiClient.post<SearchResponse>('/v1/search/vector', {
      query,
      ...options,
    });
  },

  /**
   * Start a conversational search
   */
  async startConversation(query: string): Promise<ConversationalResponse> {
    return apiClient.post<ConversationalResponse>(
      '/v1/search/conversation',
      { query }
    );
  },

  /**
   * Continue a conversation
   */
  async continueConversation(
    conversationId: string,
    query: string
  ): Promise<ConversationalResponse> {
    return apiClient.post<ConversationalResponse>(
      '/v1/search/conversation/continue',
      { conversationId, query }
    );
  },

  /**
   * Get conversation history
   */
  async getConversationHistory(
    conversationId: string
  ): Promise<ConversationHistoryResponse> {
    return apiClient.get<ConversationHistoryResponse>(
      `/v1/search/conversation/${conversationId}`
    );
  },

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<{ success: boolean }> {
    return apiClient.delete<{ success: boolean }>(
      `/v1/search/conversation/${conversationId}`
    );
  },

  /**
   * Find similar documents
   */
  async findSimilar(sourceId: string, limit?: number): Promise<SimilarResponse> {
    return apiClient.post<SimilarResponse>('/v1/search/similar', {
      sourceId,
      limit,
    });
  },
};

export default searchApi;
