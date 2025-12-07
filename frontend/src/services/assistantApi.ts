/**
 * AI Assistant API Client
 * T087 - Frontend API client for assistant services
 */

import { api } from './api';

// =============================================================================
// Types
// =============================================================================

export interface ChatSession {
  id: string;
  organizationId: string;
  userId: string;
  title?: string;
  language: 'en' | 'de';
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Citation {
  id: string;
  type: string;
  title: string;
  source: string;
  relevance: number;
}

export interface SendMessageOptions {
  stream?: boolean;
  includeContext?: boolean;
  contextTypes?: Array<'process' | 'person' | 'document' | 'decision' | 'relationship' | 'metric'>;
}

// =============================================================================
// Session APIs
// =============================================================================

/**
 * Create a new chat session
 */
export async function createSession(options?: {
  title?: string;
  language?: 'en' | 'de';
}): Promise<ChatSession> {
  const response = await api.post('/assistant/sessions', options || {});
  return response.data;
}

/**
 * Get user's chat sessions
 */
export async function getSessions(limit: number = 20): Promise<{ sessions: ChatSession[] }> {
  const response = await api.get('/assistant/sessions', { params: { limit } });
  return response.data;
}

/**
 * Get a specific session
 */
export async function getSession(sessionId: string): Promise<ChatSession> {
  const response = await api.get(`/assistant/sessions/${sessionId}`);
  return response.data;
}

/**
 * Delete a chat session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/assistant/sessions/${sessionId}`);
}

// =============================================================================
// Message APIs
// =============================================================================

/**
 * Get messages for a session
 */
export async function getMessages(
  sessionId: string,
  limit: number = 50
): Promise<{ messages: ChatMessage[] }> {
  const response = await api.get(`/assistant/sessions/${sessionId}/messages`, {
    params: { limit },
  });
  return response.data;
}

/**
 * Send a message and get a response (non-streaming)
 */
export async function sendMessage(
  sessionId: string,
  content: string,
  options?: Omit<SendMessageOptions, 'stream'>
): Promise<ChatMessage> {
  const response = await api.post(`/assistant/sessions/${sessionId}/messages`, {
    content,
    options: { ...options, stream: false },
  });
  return response.data;
}

/**
 * Send a message with streaming response
 */
export async function* sendMessageStream(
  sessionId: string,
  content: string,
  options?: Omit<SendMessageOptions, 'stream'>
): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; content?: string; message?: ChatMessage }> {
  const baseUrl = api.defaults.baseURL || '';
  const url = new URL(`${baseUrl}/assistant/sessions/${sessionId}/stream`);
  url.searchParams.set('content', content);

  // Add headers
  const headers: HeadersInit = {};
  const orgId = api.defaults.headers.common?.['x-organization-id'];
  const userId = api.defaults.headers.common?.['x-user-id'];
  if (orgId) headers['x-organization-id'] = orgId as string;
  if (userId) headers['x-user-id'] = userId as string;

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    yield { type: 'error', content: 'Failed to connect to stream' };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', content: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          return;
        }
        try {
          const parsed = JSON.parse(data);
          yield parsed;
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a new session and send the first message
 */
export async function startConversation(
  message: string,
  options?: {
    title?: string;
    language?: 'en' | 'de';
    includeContext?: boolean;
  }
): Promise<{ session: ChatSession; response: ChatMessage }> {
  const session = await createSession({
    title: options?.title,
    language: options?.language,
  });

  const response = await sendMessage(session.id, message, {
    includeContext: options?.includeContext ?? true,
  });

  return { session, response };
}

/**
 * Get suggested questions based on context
 */
export function getSuggestedQuestions(language: 'en' | 'de' = 'en'): string[] {
  const suggestions = {
    en: [
      'Who is responsible for invoice processing?',
      'What is the approval workflow for purchase orders?',
      'Show me employees with expertise in sales',
      'What are the main bottlenecks in our operations?',
      'Who should I contact about compliance questions?',
    ],
    de: [
      'Wer ist für die Rechnungsverarbeitung zuständig?',
      'Wie ist der Genehmigungsworkflow für Bestellungen?',
      'Zeige mir Mitarbeiter mit Expertise im Vertrieb',
      'Was sind die Hauptengpässe in unserem Betrieb?',
      'An wen wende ich mich bei Compliance-Fragen?',
    ],
  };

  return suggestions[language];
}

export default {
  createSession,
  getSessions,
  getSession,
  deleteSession,
  getMessages,
  sendMessage,
  sendMessageStream,
  startConversation,
  getSuggestedQuestions,
};
