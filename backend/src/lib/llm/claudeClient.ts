/**
 * Claude LLM Client
 * Wrapper for Anthropic's Claude API for text generation
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeClientConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface GenerateResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

export interface StreamGenerateOptions extends GenerateOptions {
  onToken?: (token: string) => void;
  onComplete?: (result: GenerateResult) => void;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(config: ClaudeClientConfig = {}) {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = config.model || DEFAULT_MODEL;
    this.defaultMaxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.defaultTemperature = config.temperature || DEFAULT_TEMPERATURE;
  }

  /**
   * Generate text completion
   */
  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const {
      systemPrompt,
      maxTokens = this.defaultMaxTokens,
      temperature = this.defaultTemperature,
      stopSequences,
    } = options;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      stop_sequences: stopSequences,
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    return {
      content,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason || 'unknown',
    };
  }

  /**
   * Generate text completion with streaming
   */
  async generateStream(
    prompt: string,
    options: StreamGenerateOptions = {}
  ): Promise<GenerateResult> {
    const {
      systemPrompt,
      maxTokens = this.defaultMaxTokens,
      temperature = this.defaultTemperature,
      stopSequences,
      onToken,
      onComplete,
    } = options;

    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = 'unknown';

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      stop_sequences: stopSequences,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const token = event.delta.text;
        content += token;
        onToken?.(token);
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason || stopReason;
        outputTokens = event.usage?.output_tokens || outputTokens;
      } else if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens || 0;
      }
    }

    const result: GenerateResult = {
      content,
      model: this.model,
      inputTokens,
      outputTokens,
      stopReason,
    };

    onComplete?.(result);

    return result;
  }

  /**
   * Generate with conversation context
   */
  async generateWithContext(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    const {
      systemPrompt,
      maxTokens = this.defaultMaxTokens,
      temperature = this.defaultTemperature,
      stopSequences,
    } = options;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages,
      stop_sequences: stopSequences,
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    return {
      content,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason || 'unknown',
    };
  }

  /**
   * Check if the API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.generate('Hello', { maxTokens: 10 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Estimate token count for a string (rough approximation)
   */
  estimateTokens(text: string): number {
    // Rough approximation: ~4 characters per token for English
    // This is not exact but useful for planning
    return Math.ceil(text.length / 4);
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Set a new model
   */
  setModel(model: string): void {
    this.model = model;
  }
}

// Singleton instance
let clientInstance: ClaudeClient | null = null;

/**
 * Get or create Claude client instance
 */
export function getClaudeClient(config?: ClaudeClientConfig): ClaudeClient {
  if (!clientInstance) {
    clientInstance = new ClaudeClient(config);
  }
  return clientInstance;
}

/**
 * Reset the client instance (useful for testing)
 */
export function resetClaudeClient(): void {
  clientInstance = null;
}

export default ClaudeClient;
