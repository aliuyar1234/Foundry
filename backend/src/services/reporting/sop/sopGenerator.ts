/**
 * SOP Generator Service
 * Generates Standard Operating Procedures from discovered processes using LLM
 */

import { ClaudeClient, getClaudeClient, GenerateResult } from '../../../lib/llm/claudeClient.js';
import {
  ProcessInput,
  SOPGenerationOptions,
  generateSOPPrompt,
  getSystemPrompt,
  getReviewPrompt,
} from './prompts/sopTemplates.js';
import { formatProcessForSOP, ProcessData } from './inputFormatter.js';
import { calculateConfidenceScore, ConfidenceScore } from './confidenceScorer.js';

export interface SOPGenerationResult {
  content: string;
  title: string;
  processId: string;
  processName: string;
  language: string;
  version: string;
  generatedAt: string;
  confidence: ConfidenceScore;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  warnings: string[];
  metadata: {
    model: string;
    generationTimeMs: number;
    options: SOPGenerationOptions;
  };
}

export interface SOPReviewResult {
  isValid: boolean;
  issues: SOPIssue[];
  suggestions: string[];
  overallScore: number;
}

export interface SOPIssue {
  type: 'missing' | 'unclear' | 'inconsistent' | 'safety' | 'compliance';
  severity: 'low' | 'medium' | 'high';
  description: string;
  section?: string;
  suggestion?: string;
}

export interface RegenerateOptions {
  feedback?: string;
  focusAreas?: string[];
  preserveSections?: string[];
}

const DEFAULT_OPTIONS: SOPGenerationOptions = {
  language: 'en',
  style: 'formal',
  detailLevel: 'standard',
  includeFlowchart: false,
  includeCheckboxes: true,
  includeTimelines: true,
};

export class SOPGenerator {
  private client: ClaudeClient;

  constructor(client?: ClaudeClient) {
    this.client = client || getClaudeClient();
  }

  /**
   * Generate an SOP from process data
   */
  async generateSOP(
    processData: ProcessData,
    options: Partial<SOPGenerationOptions> = {}
  ): Promise<SOPGenerationResult> {
    const startTime = Date.now();
    const mergedOptions: SOPGenerationOptions = { ...DEFAULT_OPTIONS, ...options };

    // Format process data for the prompt
    const formattedProcess = formatProcessForSOP(processData);

    // Calculate confidence score based on input data quality
    const confidence = calculateConfidenceScore(processData);

    // Generate warnings based on data quality
    const warnings = this.generateWarnings(processData, confidence);

    // Build the prompt
    const prompt = generateSOPPrompt(formattedProcess, mergedOptions);
    const systemPrompt = getSystemPrompt(mergedOptions.language);

    // Generate the SOP
    const result = await this.client.generate(prompt, {
      systemPrompt,
      maxTokens: 8192,
      temperature: 0.5, // Lower temperature for more consistent output
    });

    // Extract title from generated content
    const title = this.extractTitle(result.content, formattedProcess.name, mergedOptions.language);

    // Generate version string
    const version = this.generateVersion();

    return {
      content: result.content,
      title,
      processId: processData.id,
      processName: processData.name,
      language: mergedOptions.language,
      version,
      generatedAt: new Date().toISOString(),
      confidence,
      tokenUsage: {
        input: result.inputTokens,
        output: result.outputTokens,
        total: result.inputTokens + result.outputTokens,
      },
      warnings,
      metadata: {
        model: result.model,
        generationTimeMs: Date.now() - startTime,
        options: mergedOptions,
      },
    };
  }

  /**
   * Generate SOP with streaming output
   */
  async generateSOPStream(
    processData: ProcessData,
    options: Partial<SOPGenerationOptions> = {},
    onToken: (token: string) => void
  ): Promise<SOPGenerationResult> {
    const startTime = Date.now();
    const mergedOptions: SOPGenerationOptions = { ...DEFAULT_OPTIONS, ...options };

    const formattedProcess = formatProcessForSOP(processData);
    const confidence = calculateConfidenceScore(processData);
    const warnings = this.generateWarnings(processData, confidence);

    const prompt = generateSOPPrompt(formattedProcess, mergedOptions);
    const systemPrompt = getSystemPrompt(mergedOptions.language);

    const result = await this.client.generateStream(prompt, {
      systemPrompt,
      maxTokens: 8192,
      temperature: 0.5,
      onToken,
    });

    const title = this.extractTitle(result.content, formattedProcess.name, mergedOptions.language);
    const version = this.generateVersion();

    return {
      content: result.content,
      title,
      processId: processData.id,
      processName: processData.name,
      language: mergedOptions.language,
      version,
      generatedAt: new Date().toISOString(),
      confidence,
      tokenUsage: {
        input: result.inputTokens,
        output: result.outputTokens,
        total: result.inputTokens + result.outputTokens,
      },
      warnings,
      metadata: {
        model: result.model,
        generationTimeMs: Date.now() - startTime,
        options: mergedOptions,
      },
    };
  }

  /**
   * Review an existing SOP for quality and completeness
   */
  async reviewSOP(
    sopContent: string,
    processData: ProcessData,
    language: 'en' | 'de' = 'en'
  ): Promise<SOPReviewResult> {
    const formattedProcess = formatProcessForSOP(processData);

    const reviewPrompt = `${getReviewPrompt(language)}

## Original Process Data

Process Name: ${formattedProcess.name}
Steps: ${formattedProcess.steps.map((s) => s.name).join(', ')}

## SOP to Review

${sopContent}

Please respond with a JSON object containing:
{
  "isValid": boolean,
  "issues": [{ "type": "missing|unclear|inconsistent|safety|compliance", "severity": "low|medium|high", "description": "...", "section": "...", "suggestion": "..." }],
  "suggestions": ["..."],
  "overallScore": number (0-100)
}`;

    const result = await this.client.generate(reviewPrompt, {
      systemPrompt: getSystemPrompt(language),
      maxTokens: 2048,
      temperature: 0.3,
    });

    try {
      // Extract JSON from response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as SOPReviewResult;
      }
    } catch {
      // If parsing fails, return a basic result
    }

    return {
      isValid: true,
      issues: [],
      suggestions: ['Unable to parse review results'],
      overallScore: 70,
    };
  }

  /**
   * Regenerate SOP with feedback
   */
  async regenerateSOP(
    originalSOP: string,
    processData: ProcessData,
    regenerateOptions: RegenerateOptions,
    sopOptions: Partial<SOPGenerationOptions> = {}
  ): Promise<SOPGenerationResult> {
    const mergedOptions: SOPGenerationOptions = { ...DEFAULT_OPTIONS, ...sopOptions };

    let feedbackSection = '';
    if (regenerateOptions.feedback) {
      feedbackSection += `\n\n## User Feedback\n${regenerateOptions.feedback}`;
    }
    if (regenerateOptions.focusAreas && regenerateOptions.focusAreas.length > 0) {
      feedbackSection += `\n\n## Focus Areas for Improvement\n${regenerateOptions.focusAreas.map((a) => `- ${a}`).join('\n')}`;
    }
    if (regenerateOptions.preserveSections && regenerateOptions.preserveSections.length > 0) {
      feedbackSection += `\n\n## Sections to Preserve\n${regenerateOptions.preserveSections.map((s) => `- ${s}`).join('\n')}`;
    }

    const formattedProcess = formatProcessForSOP(processData);

    const regeneratePrompt = `Please improve the following SOP based on the feedback provided.

## Original SOP

${originalSOP}

${feedbackSection}

## Process Information

${generateSOPPrompt(formattedProcess, mergedOptions)}

Please regenerate the complete SOP incorporating the feedback while maintaining the same structure and format.`;

    const startTime = Date.now();
    const confidence = calculateConfidenceScore(processData);
    const warnings = this.generateWarnings(processData, confidence);

    const result = await this.client.generate(regeneratePrompt, {
      systemPrompt: getSystemPrompt(mergedOptions.language),
      maxTokens: 8192,
      temperature: 0.5,
    });

    const title = this.extractTitle(result.content, formattedProcess.name, mergedOptions.language);

    return {
      content: result.content,
      title,
      processId: processData.id,
      processName: processData.name,
      language: mergedOptions.language,
      version: this.generateVersion(),
      generatedAt: new Date().toISOString(),
      confidence,
      tokenUsage: {
        input: result.inputTokens,
        output: result.outputTokens,
        total: result.inputTokens + result.outputTokens,
      },
      warnings,
      metadata: {
        model: result.model,
        generationTimeMs: Date.now() - startTime,
        options: mergedOptions,
      },
    };
  }

  /**
   * Generate warnings based on data quality
   */
  private generateWarnings(processData: ProcessData, confidence: ConfidenceScore): string[] {
    const warnings: string[] = [];

    if (confidence.overall < 50) {
      warnings.push('Low confidence: The generated SOP may require significant manual review and editing.');
    }

    if (!processData.steps || processData.steps.length === 0) {
      warnings.push('No process steps provided - SOP structure may be incomplete.');
    }

    if (processData.steps && processData.steps.length < 3) {
      warnings.push('Very few process steps detected - consider verifying process completeness.');
    }

    if (!processData.metrics?.completionRate || processData.metrics.completionRate < 80) {
      warnings.push('Process completion rate is below 80% - there may be undocumented exception paths.');
    }

    if (confidence.dataCompleteness < 60) {
      warnings.push('Input data is incomplete - some SOP sections may lack detail.');
    }

    if (!processData.participants || processData.participants.length === 0) {
      warnings.push('No participants/roles identified - responsibility assignments may be missing.');
    }

    return warnings;
  }

  /**
   * Extract title from generated content
   */
  private extractTitle(content: string, fallbackName: string, language: 'en' | 'de'): string {
    // Try to extract title from markdown header
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Generate default title
    const prefix = language === 'de' ? 'SOP:' : 'SOP:';
    return `${prefix} ${fallbackName}`;
  }

  /**
   * Generate version string
   */
  private generateVersion(): string {
    const now = new Date();
    return `1.0.${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }
}

// Factory function
export function createSOPGenerator(client?: ClaudeClient): SOPGenerator {
  return new SOPGenerator(client);
}

export default SOPGenerator;
