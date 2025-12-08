/**
 * Chat Service
 * T071 - Create conversation session manager
 */

import { prisma } from '../../lib/prisma.js';
import { randomUUID } from 'crypto';
import { logger } from '../../lib/logger.js';
import { retrieveContext, type RetrievedContext } from './contextRetriever.js';
import { generateResponse } from './responseGenerator.js';
import { buildConversationContext } from './conversationContext.js';
import { filterByPermissions } from './permissionFilter.js';
import { formatResponse } from './responseFormatter.js';
import { detectLanguage } from './languageDetector.js';

// =============================================================================
// Types
// =============================================================================

export interface ChatSession {
  id: string;
  organizationId: string;
  userId: string;
  title?: string;
  language: 'en' | 'de';
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
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
  contextTypes?: RetrievedContext['type'][];
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Create a new chat session
 */
export async function createSession(
  organizationId: string,
  userId: string,
  options: { title?: string; language?: 'en' | 'de' } = {}
): Promise<ChatSession> {
  const session = await prisma.conversationSession.create({
    data: {
      id: randomUUID(),
      organizationId,
      userId,
      title: options.title,
      language: options.language || 'en',
      status: 'active',
    },
  });

  logger.info({ sessionId: session.id, userId }, 'Chat session created');

  return {
    id: session.id,
    organizationId: session.organizationId,
    userId: session.userId,
    title: session.title || undefined,
    language: session.language as 'en' | 'de',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Get a chat session
 */
export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) return null;

  return {
    id: session.id,
    organizationId: session.organizationId,
    userId: session.userId,
    title: session.title || undefined,
    language: session.language as 'en' | 'de',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Get all sessions for a user
 */
export async function getUserSessions(
  organizationId: string,
  userId: string,
  limit: number = 20
): Promise<ChatSession[]> {
  const sessions = await prisma.conversationSession.findMany({
    where: {
      organizationId,
      userId,
      status: 'active',
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return sessions.map(s => ({
    id: s.id,
    organizationId: s.organizationId,
    userId: s.userId,
    title: s.title || undefined,
    language: s.language as 'en' | 'de',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

/**
 * Delete a chat session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { status: 'closed' },
  });

  logger.info({ sessionId }, 'Chat session closed');
}

// =============================================================================
// Message Management
// =============================================================================

/**
 * Get messages for a session
 */
export async function getSessionMessages(
  sessionId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  const messages = await prisma.conversationMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  return messages.map(m => ({
    id: m.id,
    sessionId: m.sessionId,
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
    citations: m.citations as Citation[] | undefined,
    metadata: m.metadata as Record<string, unknown> | undefined,
    createdAt: m.createdAt,
  }));
}

/**
 * Send a message and get a response
 */
export async function sendMessage(
  sessionId: string,
  content: string,
  options: SendMessageOptions = {}
): Promise<ChatMessage> {
  const { includeContext = true, contextTypes } = options;

  // Get session
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Detect language if not set
  const detectedLanguage = detectLanguage(content);

  // Save user message
  const userMessage = await prisma.conversationMessage.create({
    data: {
      id: randomUUID(),
      sessionId,
      role: 'user',
      content,
      metadata: { language: detectedLanguage },
    },
  });

  // Get conversation history
  const history = await getSessionMessages(sessionId, 20);

  // Retrieve context if enabled
  let context: RetrievedContext[] = [];
  if (includeContext) {
    context = await retrieveContext({
      query: content,
      organizationId: session.organizationId,
      userId: session.userId,
      contextTypes,
      limit: 10,
    });

    // Filter by user permissions
    context = await filterByPermissions(context, session.userId, session.organizationId);
  }

  // Build conversation context
  const conversationContext = buildConversationContext(history, context, session.language);

  // Generate response
  const response = await generateResponse({
    query: content,
    context: conversationContext,
    language: session.language,
    sessionId,
  });

  // Format response
  const formattedResponse = formatResponse(response.content, session.language);

  // Create citations from used context
  const citations: Citation[] = context.slice(0, 5).map(c => ({
    id: c.id,
    type: c.type,
    title: c.title,
    source: c.source,
    relevance: c.relevanceScore,
  }));

  // Save assistant message
  const assistantMessage = await prisma.conversationMessage.create({
    data: {
      id: randomUUID(),
      sessionId,
      role: 'assistant',
      content: formattedResponse,
      citations,
      metadata: {
        language: session.language,
        contextCount: context.length,
        tokensUsed: response.tokensUsed,
      },
    },
  });

  // Update session
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      updatedAt: new Date(),
      messageCount: { increment: 2 },
    },
  });

  logger.debug({
    sessionId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    contextUsed: context.length,
  }, 'Message processed');

  return {
    id: assistantMessage.id,
    sessionId,
    role: 'assistant',
    content: formattedResponse,
    citations,
    metadata: assistantMessage.metadata as Record<string, unknown>,
    createdAt: assistantMessage.createdAt,
  };
}

/**
 * Send a message with streaming response
 */
export async function* sendMessageStream(
  sessionId: string,
  content: string,
  options: SendMessageOptions = {}
): AsyncGenerator<{ type: 'chunk' | 'done'; content?: string; message?: ChatMessage }> {
  // For now, fall back to non-streaming
  // In production, would use Claude streaming API
  const message = await sendMessage(sessionId, content, options);

  // Simulate streaming by chunking the response
  const words = message.content.split(' ');
  for (let i = 0; i < words.length; i += 3) {
    yield {
      type: 'chunk',
      content: words.slice(i, i + 3).join(' ') + ' ',
    };
    // Small delay to simulate streaming
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  yield { type: 'done', message };
}

export default {
  createSession,
  getSession,
  getUserSessions,
  deleteSession,
  getSessionMessages,
  sendMessage,
  sendMessageStream,
};
