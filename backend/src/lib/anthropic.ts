/**
 * Anthropic Claude API Client
 * Provides LLM capabilities for intelligence features
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger.js';

// Singleton instance
let anthropicClient: Anthropic | null = null;

/**
 * Get Anthropic client instance (singleton)
 */
export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    anthropicClient = new Anthropic({
      apiKey,
    });

    logger.info('Anthropic client initialized');
  }

  return anthropicClient;
}

/**
 * Default model configuration
 */
export const CLAUDE_MODELS = {
  SONNET: 'claude-3-5-sonnet-20241022',
  HAIKU: 'claude-3-5-haiku-20241022',
} as const;

/**
 * Default generation parameters
 */
export const DEFAULT_GENERATION_CONFIG = {
  model: CLAUDE_MODELS.SONNET,
  max_tokens: 4096,
  temperature: 0, // Deterministic for extraction tasks
};

/**
 * Message type for Claude conversations
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Generate a completion using Claude
 */
export async function generateCompletion(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  const client = getAnthropicClient();

  try {
    const response = await client.messages.create({
      model: options.model || DEFAULT_GENERATION_CONFIG.model,
      max_tokens: options.maxTokens || DEFAULT_GENERATION_CONFIG.max_tokens,
      temperature: options.temperature ?? DEFAULT_GENERATION_CONFIG.temperature,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    logger.debug({
      model: options.model || DEFAULT_GENERATION_CONFIG.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }, 'Claude completion generated');

    return textContent.text;
  } catch (error) {
    logger.error({ error }, 'Claude completion failed');
    throw error;
  }
}

/**
 * Generate structured JSON output using Claude
 */
export async function generateStructuredOutput<T>(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    maxTokens?: number;
  } = {}
): Promise<T> {
  const jsonSystemPrompt = `${systemPrompt}

IMPORTANT: Your response must be valid JSON only. Do not include any text before or after the JSON object.`;

  const response = await generateCompletion(
    jsonSystemPrompt,
    [{ role: 'user', content: userPrompt }],
    { ...options, temperature: 0 }
  );

  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }

    return JSON.parse(jsonMatch[0]) as T;
  } catch (error) {
    logger.error({ error, response }, 'Failed to parse Claude JSON response');
    throw new Error('Failed to parse structured output from Claude');
  }
}

/**
 * Check if Anthropic API is accessible
 */
export async function checkAnthropicHealth(): Promise<boolean> {
  try {
    const client = getAnthropicClient();
    // Simple health check - just verify client can be created
    return client !== null;
  } catch (error) {
    logger.error({ error }, 'Anthropic health check failed');
    return false;
  }
}

export { Anthropic };
