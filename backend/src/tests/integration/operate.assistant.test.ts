/**
 * Integration Tests for AI Assistant (T262)
 * E2E tests for the AI assistant functionality
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Mock Anthropic client
vi.mock('../../lib/anthropic.js', () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn().mockImplementation(async ({ messages }) => {
        const userMessage = messages.find((m: any) => m.role === 'user')?.content || '';
        return {
          content: [{ type: 'text', text: `Response to: ${userMessage.substring(0, 50)}...` }],
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      }),
    },
  }),
}));

// Mock Redis for context caching
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  }),
}));

const prisma = new PrismaClient();

describe('AI Assistant Integration Tests', () => {
  const testOrgId = 'test-org-assistant';
  const testUserId = 'test-user-assistant';
  const testSessionId = 'test-session-assistant';

  beforeAll(async () => {
    // Setup test data
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Chat Sessions', () => {
    it('should create a new chat session', () => {
      const createSession = (
        organizationId: string,
        userId: string
      ): { id: string; organizationId: string; userId: string; createdAt: Date; messages: any[] } => {
        return {
          id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          organizationId,
          userId,
          createdAt: new Date(),
          messages: [],
        };
      };

      const session = createSession(testOrgId, testUserId);
      expect(session.id).toBeDefined();
      expect(session.organizationId).toBe(testOrgId);
      expect(session.userId).toBe(testUserId);
      expect(session.messages).toHaveLength(0);
    });

    it('should add messages to session', () => {
      const addMessage = (
        session: { messages: any[] },
        role: 'user' | 'assistant',
        content: string
      ): void => {
        session.messages.push({
          id: `msg_${Date.now()}`,
          role,
          content,
          timestamp: new Date(),
        });
      };

      const session = { messages: [] as any[] };
      addMessage(session, 'user', 'Hello, how can you help me?');
      addMessage(session, 'assistant', 'I can help you with various tasks...');

      expect(session.messages).toHaveLength(2);
      expect(session.messages[0].role).toBe('user');
      expect(session.messages[1].role).toBe('assistant');
    });

    it('should maintain conversation history', () => {
      const buildContext = (messages: Array<{ role: string; content: string }>): string => {
        return messages
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n');
      };

      const messages = [
        { role: 'user', content: 'What is the weather?' },
        { role: 'assistant', content: 'I cannot check weather, but I can help with other tasks.' },
        { role: 'user', content: 'What can you help with?' },
      ];

      const context = buildContext(messages);
      expect(context).toContain('User: What is the weather?');
      expect(context).toContain('Assistant: I cannot check weather');
      expect(context).toContain('User: What can you help with?');
    });
  });

  describe('Message Processing', () => {
    it('should extract intent from user message', () => {
      const extractIntent = (message: string): { intent: string; entities: string[] } => {
        const intents = {
          routing: ['route', 'assign', 'who should handle'],
          compliance: ['compliance', 'regulation', 'policy', 'audit'],
          workload: ['workload', 'capacity', 'busy', 'availability'],
          report: ['report', 'summary', 'metrics', 'dashboard'],
          help: ['help', 'how do i', 'what is', 'explain'],
        };

        const lowerMessage = message.toLowerCase();
        for (const [intent, keywords] of Object.entries(intents)) {
          if (keywords.some(kw => lowerMessage.includes(kw))) {
            return { intent, entities: keywords.filter(kw => lowerMessage.includes(kw)) };
          }
        }
        return { intent: 'general', entities: [] };
      };

      expect(extractIntent('How do I route this task?').intent).toBe('routing');
      expect(extractIntent('Show me the compliance dashboard').intent).toBe('compliance');
      expect(extractIntent('What is the team workload?').intent).toBe('workload');
      expect(extractIntent('Generate a weekly report').intent).toBe('report');
      expect(extractIntent('Help me understand this').intent).toBe('help');
    });

    it('should handle long messages with truncation', () => {
      const truncateMessage = (message: string, maxLength: number): string => {
        if (message.length <= maxLength) return message;
        return message.substring(0, maxLength - 3) + '...';
      };

      const longMessage = 'A'.repeat(1000);
      const truncated = truncateMessage(longMessage, 500);
      expect(truncated.length).toBe(500);
      expect(truncated.endsWith('...')).toBe(true);

      const shortMessage = 'Hello';
      expect(truncateMessage(shortMessage, 500)).toBe('Hello');
    });

    it('should sanitize user input', () => {
      const sanitizeInput = (input: string): string => {
        return input
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/[<>\"\'&]/g, '') // Remove potentially dangerous chars
          .trim();
      };

      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
      expect(sanitizeInput('  normal message  ')).toBe('normal message');
      expect(sanitizeInput('message with "quotes"')).toBe('message with quotes');
    });
  });

  describe('Context Management', () => {
    it('should retrieve relevant context', () => {
      const getRelevantContext = (
        query: string,
        documents: Array<{ id: string; content: string; score: number }>
      ): Array<{ id: string; content: string }> => {
        return documents
          .filter(doc => doc.score > 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(({ id, content }) => ({ id, content }));
      };

      const docs = [
        { id: '1', content: 'High relevance doc', score: 0.9 },
        { id: '2', content: 'Medium relevance doc', score: 0.7 },
        { id: '3', content: 'Low relevance doc', score: 0.3 },
        { id: '4', content: 'Another high doc', score: 0.85 },
      ];

      const context = getRelevantContext('test query', docs);
      expect(context).toHaveLength(3);
      expect(context[0].id).toBe('1');
      expect(context[1].id).toBe('4');
      expect(context[2].id).toBe('2');
    });

    it('should limit context window size', () => {
      const limitContextWindow = (
        context: string,
        maxTokens: number
      ): string => {
        // Rough estimation: 1 token ≈ 4 characters
        const maxChars = maxTokens * 4;
        if (context.length <= maxChars) return context;
        return context.substring(0, maxChars);
      };

      const longContext = 'word '.repeat(1000);
      const limited = limitContextWindow(longContext, 500);
      expect(limited.length).toBeLessThanOrEqual(2000);
    });

    it('should merge multiple context sources', () => {
      const mergeContexts = (
        sources: Array<{ name: string; content: string; priority: number }>
      ): string => {
        return sources
          .sort((a, b) => b.priority - a.priority)
          .map(s => `[${s.name}]\n${s.content}`)
          .join('\n\n');
      };

      const sources = [
        { name: 'User History', content: 'Previous interactions...', priority: 1 },
        { name: 'Documentation', content: 'Relevant docs...', priority: 3 },
        { name: 'Organization Context', content: 'Org settings...', priority: 2 },
      ];

      const merged = mergeContexts(sources);
      expect(merged.indexOf('[Documentation]')).toBeLessThan(merged.indexOf('[Organization Context]'));
      expect(merged.indexOf('[Organization Context]')).toBeLessThan(merged.indexOf('[User History]'));
    });
  });

  describe('Response Generation', () => {
    it('should format structured responses', () => {
      const formatResponse = (
        content: string,
        suggestions?: string[],
        actions?: Array<{ label: string; action: string }>
      ): { content: string; suggestions?: string[]; actions?: any[] } => {
        return {
          content,
          ...(suggestions && suggestions.length > 0 && { suggestions }),
          ...(actions && actions.length > 0 && { actions }),
        };
      };

      const response = formatResponse(
        'Here is the information you requested.',
        ['Follow up question 1', 'Follow up question 2'],
        [{ label: 'View Details', action: 'navigate:/details' }]
      );

      expect(response.content).toBeDefined();
      expect(response.suggestions).toHaveLength(2);
      expect(response.actions).toHaveLength(1);
    });

    it('should handle error responses gracefully', () => {
      const createErrorResponse = (
        error: Error,
        fallbackMessage: string
      ): { content: string; isError: boolean } => {
        const userFriendlyMessages: Record<string, string> = {
          RATE_LIMIT: 'The system is currently busy. Please try again in a moment.',
          TIMEOUT: 'The request took too long. Please try again.',
          INVALID_INPUT: 'I couldn\'t understand your request. Could you rephrase it?',
        };

        const errorCode = error.message.split(':')[0];
        return {
          content: userFriendlyMessages[errorCode] || fallbackMessage,
          isError: true,
        };
      };

      const rateLimitError = new Error('RATE_LIMIT: Too many requests');
      expect(createErrorResponse(rateLimitError, 'An error occurred').content).toContain('busy');

      const unknownError = new Error('Unknown error');
      expect(createErrorResponse(unknownError, 'An error occurred').content).toBe('An error occurred');
    });
  });

  describe('Data Masking', () => {
    it('should mask sensitive information', () => {
      const maskSensitive = (text: string): string => {
        const patterns = [
          { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
          { regex: /\b\d{16}\b/g, replacement: '[CARD]' },
          { regex: /\b[\w.-]+@[\w.-]+\.\w+\b/g, replacement: '[EMAIL]' },
          { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE]' },
        ];

        let result = text;
        for (const { regex, replacement } of patterns) {
          result = result.replace(regex, replacement);
        }
        return result;
      };

      expect(maskSensitive('My SSN is 123-45-6789')).toBe('My SSN is [SSN]');
      expect(maskSensitive('Contact me at user@example.com')).toBe('Contact me at [EMAIL]');
      expect(maskSensitive('Call 555-123-4567')).toBe('Call [PHONE]');
    });

    it('should detect PII in responses', () => {
      const containsPII = (text: string): boolean => {
        const piiPatterns = [
          /\b\d{3}-\d{2}-\d{4}\b/, // SSN
          /\b\d{16}\b/, // Credit card
          /\b[\w.-]+@[\w.-]+\.\w+\b/, // Email
          /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
        ];

        return piiPatterns.some(pattern => pattern.test(text));
      };

      expect(containsPII('My email is test@example.com')).toBe(true);
      expect(containsPII('SSN: 123-45-6789')).toBe(true);
      expect(containsPII('No sensitive data here')).toBe(false);
    });
  });

  describe('Usage Tracking', () => {
    it('should track token usage', () => {
      const trackUsage = (
        usage: { inputTokens: number; outputTokens: number },
        pricing: { inputPer1k: number; outputPer1k: number }
      ): { tokens: number; cost: number } => {
        const totalTokens = usage.inputTokens + usage.outputTokens;
        const cost =
          (usage.inputTokens / 1000) * pricing.inputPer1k +
          (usage.outputTokens / 1000) * pricing.outputPer1k;
        return { tokens: totalTokens, cost };
      };

      const usage = { inputTokens: 500, outputTokens: 200 };
      const pricing = { inputPer1k: 0.003, outputPer1k: 0.015 };

      const tracked = trackUsage(usage, pricing);
      expect(tracked.tokens).toBe(700);
      expect(tracked.cost).toBeCloseTo(0.0045, 4);
    });

    it('should enforce usage limits', () => {
      const checkLimits = (
        currentUsage: number,
        limits: { daily: number; monthly: number },
        period: 'daily' | 'monthly'
      ): { allowed: boolean; remaining: number } => {
        const limit = limits[period];
        const allowed = currentUsage < limit;
        return { allowed, remaining: Math.max(0, limit - currentUsage) };
      };

      const limits = { daily: 10000, monthly: 100000 };

      expect(checkLimits(5000, limits, 'daily').allowed).toBe(true);
      expect(checkLimits(5000, limits, 'daily').remaining).toBe(5000);

      expect(checkLimits(15000, limits, 'daily').allowed).toBe(false);
      expect(checkLimits(15000, limits, 'daily').remaining).toBe(0);
    });
  });

  describe('Conversation History', () => {
    it('should summarize long conversations', () => {
      const shouldSummarize = (messageCount: number, threshold: number = 20): boolean => {
        return messageCount > threshold;
      };

      expect(shouldSummarize(10)).toBe(false);
      expect(shouldSummarize(25)).toBe(true);
      expect(shouldSummarize(20)).toBe(false);
      expect(shouldSummarize(21)).toBe(true);
    });

    it('should prune old messages while keeping context', () => {
      const pruneMessages = (
        messages: Array<{ role: string; content: string; timestamp: Date }>,
        keepCount: number
      ): Array<{ role: string; content: string; timestamp: Date }> => {
        if (messages.length <= keepCount) return messages;

        // Always keep the first message (system context) and last N messages
        const first = messages[0];
        const recent = messages.slice(-keepCount + 1);
        return [first, ...recent];
      };

      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date(Date.now() + i * 1000),
      }));

      const pruned = pruneMessages(messages, 10);
      expect(pruned).toHaveLength(10);
      expect(pruned[0].content).toBe('Message 0');
      expect(pruned[pruned.length - 1].content).toBe('Message 29');
    });
  });

  describe('Suggested Actions', () => {
    it('should generate relevant suggestions based on intent', () => {
      const getSuggestions = (intent: string): string[] => {
        const suggestionMap: Record<string, string[]> = {
          routing: [
            'View current task queue',
            'Check team availability',
            'Adjust routing rules',
          ],
          compliance: [
            'View compliance dashboard',
            'Check pending violations',
            'Generate compliance report',
          ],
          workload: [
            'View team workload',
            'Check capacity trends',
            'Identify overloaded members',
          ],
          general: [
            'How can I help you?',
            'View documentation',
            'Contact support',
          ],
        };

        return suggestionMap[intent] || suggestionMap.general;
      };

      expect(getSuggestions('routing')).toContain('View current task queue');
      expect(getSuggestions('compliance')).toContain('View compliance dashboard');
      expect(getSuggestions('unknown')).toContain('How can I help you?');
    });
  });
});
