/**
 * AI Assistant API Routes
 * T081-T086 - Assistant API endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import {
  createSession,
  getSession,
  getUserSessions,
  deleteSession,
  getSessionMessages,
  sendMessage,
  sendMessageStream,
  validateQueryPermissions,
} from '../../services/assistant/index.js';

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateSessionSchema = z.object({
  title: z.string().optional(),
  language: z.enum(['en', 'de']).optional(),
});

const SendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  options: z.object({
    stream: z.boolean().optional(),
    includeContext: z.boolean().optional(),
    contextTypes: z.array(z.enum(['process', 'person', 'document', 'decision', 'relationship', 'metric'])).optional(),
  }).optional(),
});

// =============================================================================
// Middleware
// =============================================================================

interface AuthenticatedRequest extends Request {
  organizationId?: string;
  userId?: string;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // In a real app, extract from JWT or session
  const organizationId = req.headers['x-organization-id'] as string || req.query.organizationId as string;
  const userId = req.headers['x-user-id'] as string || req.query.userId as string;

  if (!organizationId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.organizationId = organizationId;
  req.userId = userId;
  next();
}

// Apply to all routes
router.use(requireAuth);

// =============================================================================
// Session Endpoints
// =============================================================================

/**
 * POST /api/assistant/sessions
 * Create a new chat session
 */
router.post('/sessions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = CreateSessionSchema.parse(req.body);
    const organizationId = req.organizationId!;
    const userId = req.userId!;

    const session = await createSession(organizationId, userId, validated);

    res.status(201).json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to create session');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/assistant/sessions
 * List user's chat sessions
 */
router.get('/sessions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 20;

    const sessions = await getUserSessions(organizationId, userId, limit);

    res.json({ sessions });
  } catch (error) {
    logger.error({ error }, 'Failed to list sessions');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/assistant/sessions/:sessionId
 * Get a specific session
 */
router.get('/sessions/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership
    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(session);
  } catch (error) {
    logger.error({ error }, 'Failed to get session');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/assistant/sessions/:sessionId
 * Delete a chat session
 */
router.delete('/sessions/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership
    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await deleteSession(sessionId);

    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Failed to delete session');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Message Endpoints
// =============================================================================

/**
 * GET /api/assistant/sessions/:sessionId/messages
 * Get messages for a session
 */
router.get('/sessions/:sessionId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 50;

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership
    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await getSessionMessages(sessionId, limit);

    res.json({ messages });
  } catch (error) {
    logger.error({ error }, 'Failed to get messages');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/assistant/sessions/:sessionId/messages
 * Send a message and get a response
 */
router.post('/sessions/:sessionId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;
    const organizationId = req.organizationId!;
    const validated = SendMessageSchema.parse(req.body);

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership
    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate query permissions
    const permissionCheck = await validateQueryPermissions(
      validated.content,
      userId,
      organizationId
    );

    if (!permissionCheck.allowed) {
      return res.status(403).json({
        error: 'Query not permitted',
        reason: permissionCheck.reason,
      });
    }

    // Check if streaming is requested
    if (validated.options?.stream) {
      return handleStreamingResponse(req, res, sessionId, validated.content, validated.options);
    }

    const message = await sendMessage(sessionId, validated.content, validated.options);

    res.json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error({ error }, 'Failed to send message');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/assistant/sessions/:sessionId/stream
 * SSE endpoint for streaming responses
 */
router.get('/sessions/:sessionId/stream', async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId!;
  const content = req.query.content as string;

  if (!content) {
    return res.status(400).json({ error: 'Content query parameter required' });
  }

  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.userId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const generator = sendMessageStream(sessionId, content);

    for await (const chunk of generator) {
      if (chunk.type === 'chunk') {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk.content })}\n\n`);
      } else if (chunk.type === 'done') {
        res.write(`data: ${JSON.stringify({ type: 'done', message: chunk.message })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    logger.error({ error }, 'Streaming error');
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Streaming failed' })}\n\n`);
    res.end();
  }
});

/**
 * Handle streaming response for POST request
 */
async function handleStreamingResponse(
  req: Request,
  res: Response,
  sessionId: string,
  content: string,
  options?: { includeContext?: boolean; contextTypes?: string[] }
) {
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const generator = sendMessageStream(sessionId, content, options);

    for await (const chunk of generator) {
      if (chunk.type === 'chunk') {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk.content })}\n\n`);
      } else if (chunk.type === 'done') {
        res.write(`data: ${JSON.stringify({ type: 'done', message: chunk.message })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    logger.error({ error }, 'Streaming error');
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Streaming failed' })}\n\n`);
    res.end();
  }
}

export default router;
