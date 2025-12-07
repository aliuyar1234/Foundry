/**
 * Response Generator Service
 * T072 - Implement response generator with Claude API
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../lib/logger.js';

const anthropic = new Anthropic();

// =============================================================================
// Types
// =============================================================================

export interface GenerateOptions {
  query: string;
  context: string;
  language: 'en' | 'de';
  sessionId?: string;
  maxTokens?: number;
}

export interface GeneratedResponse {
  content: string;
  tokensUsed: number;
  model: string;
  stopReason: string | null;
}

// =============================================================================
// System Prompts
// =============================================================================

const SYSTEM_PROMPT_EN = `You are an intelligent AI assistant for enterprise operations. Your role is to help users with questions about their company's processes, people, and operations.

Key responsibilities:
1. Answer questions accurately based on the provided context
2. When you don't have enough information, say so clearly
3. Cite your sources when providing specific information
4. Be concise but thorough in your responses
5. Use professional business language

Guidelines:
- If the context doesn't contain relevant information, acknowledge this
- Don't make up information that isn't in the context
- When discussing people, be respectful and professional
- For sensitive topics, suggest consulting appropriate personnel
- Provide actionable insights when possible

You have access to knowledge about the company's processes, organizational structure, expertise profiles, and operational data.`;

const SYSTEM_PROMPT_DE = `Sie sind ein intelligenter KI-Assistent für Unternehmensoperationen. Ihre Aufgabe ist es, Benutzern bei Fragen zu Prozessen, Mitarbeitern und Abläufen ihres Unternehmens zu helfen.

Hauptaufgaben:
1. Fragen basierend auf dem bereitgestellten Kontext genau beantworten
2. Wenn Sie nicht genügend Informationen haben, sagen Sie das deutlich
3. Zitieren Sie Ihre Quellen bei der Bereitstellung spezifischer Informationen
4. Seien Sie prägnant aber gründlich in Ihren Antworten
5. Verwenden Sie professionelle Geschäftssprache

Richtlinien:
- Wenn der Kontext keine relevanten Informationen enthält, erkennen Sie dies an
- Erfinden Sie keine Informationen, die nicht im Kontext enthalten sind
- Seien Sie bei der Diskussion über Personen respektvoll und professionell
- Verweisen Sie bei sensiblen Themen auf zuständige Mitarbeiter
- Geben Sie wenn möglich umsetzbare Erkenntnisse

Sie haben Zugang zu Wissen über die Prozesse des Unternehmens, die Organisationsstruktur, Kompetenzprofile und Betriebsdaten.`;

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Generate a response using Claude API
 */
export async function generateResponse(
  options: GenerateOptions
): Promise<GeneratedResponse> {
  const {
    query,
    context,
    language,
    maxTokens = 1024,
  } = options;

  const systemPrompt = language === 'de' ? SYSTEM_PROMPT_DE : SYSTEM_PROMPT_EN;

  const contextLabel = language === 'de' ? 'Relevanter Kontext' : 'Relevant Context';
  const questionLabel = language === 'de' ? 'Benutzerfrage' : 'User Question';

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${contextLabel}:
${context}

${questionLabel}:
${query}`,
        },
      ],
    });

    const content = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('\n');

    logger.debug({
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    }, 'Response generated');

    return {
      content,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
      model: message.model,
      stopReason: message.stop_reason,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to generate response');

    // Return a fallback response
    const fallbackMessage = language === 'de'
      ? 'Es tut mir leid, aber ich konnte keine Antwort generieren. Bitte versuchen Sie es erneut oder formulieren Sie Ihre Frage anders.'
      : 'I apologize, but I was unable to generate a response. Please try again or rephrase your question.';

    return {
      content: fallbackMessage,
      tokensUsed: 0,
      model: 'fallback',
      stopReason: 'error',
    };
  }
}

/**
 * Generate a streaming response
 */
export async function* generateResponseStream(
  options: GenerateOptions
): AsyncGenerator<string> {
  const {
    query,
    context,
    language,
    maxTokens = 1024,
  } = options;

  const systemPrompt = language === 'de' ? SYSTEM_PROMPT_DE : SYSTEM_PROMPT_EN;
  const contextLabel = language === 'de' ? 'Relevanter Kontext' : 'Relevant Context';
  const questionLabel = language === 'de' ? 'Benutzerfrage' : 'User Question';

  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${contextLabel}:
${context}

${questionLabel}:
${query}`,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  } catch (error) {
    logger.error({ error }, 'Failed to stream response');
    const fallbackMessage = language === 'de'
      ? 'Fehler bei der Antwortgenerierung.'
      : 'Error generating response.';
    yield fallbackMessage;
  }
}

export default {
  generateResponse,
  generateResponseStream,
};
