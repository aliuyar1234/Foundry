/**
 * Request Categorizer Service
 * T032 - Implement request categorization with Claude API
 */

import { generateStructuredOutput } from '../../lib/anthropic.js';
import { logger } from '../../lib/logger.js';

// =============================================================================
// Types
// =============================================================================

export interface CategoryResult {
  categories: string[];
  urgencyScore: number; // 0-1
  confidence: number; // 0-1
  keywords: string[];
  sentiment?: 'positive' | 'neutral' | 'negative' | 'urgent';
  language?: 'en' | 'de';
}

interface CategorizationResponse {
  categories: string[];
  urgency_score: number;
  confidence: number;
  keywords: string[];
  sentiment: string;
  language: string;
}

// =============================================================================
// Pre-defined Categories
// =============================================================================

export const BUSINESS_CATEGORIES = [
  // Finance
  'invoice', 'payment', 'budget', 'expense', 'accounting', 'tax', 'audit',
  // Sales
  'sales', 'quote', 'proposal', 'contract', 'pricing', 'discount',
  // Support
  'support', 'complaint', 'issue', 'bug', 'feature_request', 'feedback',
  // HR
  'hr', 'leave', 'recruitment', 'onboarding', 'training', 'performance',
  // IT
  'it', 'access', 'software', 'hardware', 'security', 'infrastructure',
  // Legal
  'legal', 'compliance', 'gdpr', 'contract_review', 'nda',
  // Operations
  'operations', 'logistics', 'shipping', 'inventory', 'procurement',
  // Project
  'project', 'deadline', 'milestone', 'status_update', 'planning',
  // General
  'general', 'information', 'meeting', 'scheduling', 'other',
] as const;

export const DACH_SPECIFIC_TERMS: Record<string, string[]> = {
  invoice: ['Rechnung', 'Faktura', 'Abrechnung'],
  payment: ['Zahlung', 'Überweisung', 'Bezahlung'],
  quote: ['Angebot', 'Offerte', 'Kostenvoranschlag'],
  contract: ['Vertrag', 'Vereinbarung', 'Kontrakt'],
  leave: ['Urlaub', 'Abwesenheit', 'Krankmeldung'],
  complaint: ['Beschwerde', 'Reklamation', 'Beanstandung'],
  shipping: ['Versand', 'Lieferung', 'Sendung'],
  meeting: ['Besprechung', 'Meeting', 'Termin'],
};

// =============================================================================
// System Prompt
// =============================================================================

const CATEGORIZATION_PROMPT = `You are an expert request categorizer for a DACH (Germany, Austria, Switzerland) business environment.

Your task is to analyze incoming requests and categorize them accurately. You must:
1. Identify the primary business category/categories
2. Assess urgency based on content and language
3. Extract key keywords
4. Detect the language (English or German)
5. Assess sentiment

Available categories:
${BUSINESS_CATEGORIES.join(', ')}

Consider DACH-specific terminology:
- German business terms (Rechnung, Angebot, Vertrag, etc.)
- Austrian variations (Faktura, etc.)
- Swiss German terms
- Common business abbreviations (USt, MwSt, GmbH, AG, etc.)

Urgency indicators:
- HIGH (0.8-1.0): Words like "dringend", "urgent", "ASAP", "sofort", "kritisch", deadlines today
- MEDIUM (0.4-0.7): Near-term deadlines, follow-ups, reminders
- LOW (0.0-0.3): General inquiries, FYI, non-time-sensitive

Return your analysis as JSON with this structure:
{
  "categories": ["primary_category", "secondary_category"],
  "urgency_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "keywords": ["keyword1", "keyword2"],
  "sentiment": "positive|neutral|negative|urgent",
  "language": "en|de"
}`;

// =============================================================================
// Main Categorization Function
// =============================================================================

/**
 * Categorize a request using Claude AI
 */
export async function categorizeRequest(
  content: string,
  subject?: string,
  metadata?: Record<string, unknown>
): Promise<CategoryResult> {
  // First try fast keyword-based categorization
  const quickResult = quickCategorize(content, subject);
  if (quickResult.confidence >= 0.9) {
    logger.debug({ categories: quickResult.categories }, 'Quick categorization successful');
    return quickResult;
  }

  // Fall back to AI categorization for complex cases
  try {
    const userPrompt = buildUserPrompt(content, subject, metadata);

    const response = await generateStructuredOutput<CategorizationResponse>(
      CATEGORIZATION_PROMPT,
      userPrompt,
      { maxTokens: 500 }
    );

    const result: CategoryResult = {
      categories: response.categories.filter(c =>
        BUSINESS_CATEGORIES.includes(c as typeof BUSINESS_CATEGORIES[number])
      ),
      urgencyScore: Math.max(0, Math.min(1, response.urgency_score)),
      confidence: Math.max(0, Math.min(1, response.confidence)),
      keywords: response.keywords || [],
      sentiment: response.sentiment as CategoryResult['sentiment'],
      language: response.language === 'de' ? 'de' : 'en',
    };

    // Ensure at least one category
    if (result.categories.length === 0) {
      result.categories = ['general'];
    }

    logger.debug({ categories: result.categories, urgency: result.urgencyScore }, 'AI categorization completed');

    return result;
  } catch (error) {
    logger.error({ error }, 'AI categorization failed, using fallback');
    return quickResult;
  }
}

/**
 * Quick keyword-based categorization (no AI)
 */
export function quickCategorize(
  content: string,
  subject?: string
): CategoryResult {
  const text = `${subject || ''} ${content}`.toLowerCase();
  const categories: string[] = [];
  const keywords: string[] = [];
  let urgencyScore = 0.3;
  let confidence = 0.5;

  // Check for urgency indicators
  const urgentTerms = [
    'urgent', 'dringend', 'asap', 'sofort', 'kritisch', 'critical',
    'deadline', 'frist', 'immediately', 'unverzüglich',
  ];
  if (urgentTerms.some(term => text.includes(term))) {
    urgencyScore = 0.9;
    keywords.push('urgent');
  }

  // Category detection
  const categoryKeywords: Record<string, string[]> = {
    invoice: ['invoice', 'rechnung', 'faktura', 'billing', 'abrechnung'],
    payment: ['payment', 'zahlung', 'überweisung', 'bezahlung', 'pay'],
    quote: ['quote', 'angebot', 'offerte', 'proposal', 'kostenvoranschlag'],
    support: ['support', 'help', 'hilfe', 'problem', 'issue', 'ticket'],
    complaint: ['complaint', 'beschwerde', 'reklamation', 'unhappy'],
    hr: ['hr', 'leave', 'urlaub', 'vacation', 'sick', 'krank', 'personnel'],
    it: ['it', 'computer', 'software', 'access', 'zugang', 'password'],
    legal: ['legal', 'rechtlich', 'contract', 'vertrag', 'compliance', 'gdpr', 'dsgvo'],
    sales: ['sales', 'verkauf', 'customer', 'kunde', 'deal', 'opportunity'],
    meeting: ['meeting', 'termin', 'besprechung', 'call', 'schedule'],
    project: ['project', 'projekt', 'milestone', 'deadline', 'status'],
    shipping: ['shipping', 'versand', 'delivery', 'lieferung', 'tracking'],
  };

  for (const [category, terms] of Object.entries(categoryKeywords)) {
    if (terms.some(term => text.includes(term))) {
      categories.push(category);
      keywords.push(...terms.filter(t => text.includes(t)));
    }
  }

  // Detect language
  const germanIndicators = ['der', 'die', 'das', 'und', 'ist', 'für', 'mit', 'auf'];
  const isGerman = germanIndicators.filter(w => text.includes(` ${w} `)).length >= 2;

  // Calculate confidence based on matches
  if (categories.length > 0) {
    confidence = Math.min(0.9, 0.5 + categories.length * 0.15);
  }

  // Default category if none found
  if (categories.length === 0) {
    categories.push('general');
    confidence = 0.3;
  }

  return {
    categories: categories.slice(0, 3), // Max 3 categories
    urgencyScore,
    confidence,
    keywords: [...new Set(keywords)].slice(0, 10),
    sentiment: urgencyScore > 0.7 ? 'urgent' : 'neutral',
    language: isGerman ? 'de' : 'en',
  };
}

/**
 * Build user prompt for AI categorization
 */
function buildUserPrompt(
  content: string,
  subject?: string,
  metadata?: Record<string, unknown>
): string {
  let prompt = '';

  if (subject) {
    prompt += `Subject: ${subject}\n\n`;
  }

  prompt += `Content:\n${content.slice(0, 2000)}`; // Limit content length

  if (metadata) {
    const relevant = ['sender', 'recipient', 'type', 'source'];
    const metadataStr = relevant
      .filter(k => metadata[k])
      .map(k => `${k}: ${metadata[k]}`)
      .join(', ');
    if (metadataStr) {
      prompt += `\n\nMetadata: ${metadataStr}`;
    }
  }

  return prompt;
}

/**
 * Extract urgency indicators from text
 */
export function extractUrgencyIndicators(text: string): {
  score: number;
  indicators: string[];
} {
  const lower = text.toLowerCase();
  const indicators: string[] = [];
  let score = 0.3;

  const urgencyPatterns = [
    { pattern: /\b(urgent|dringend|asap|sofort)\b/i, score: 0.3, label: 'urgency_keyword' },
    { pattern: /\b(kritisch|critical|emergency|notfall)\b/i, score: 0.4, label: 'critical_keyword' },
    { pattern: /\b(today|heute|immediately|unverzüglich)\b/i, score: 0.2, label: 'immediate' },
    { pattern: /deadline.{0,20}(today|morgen|tomorrow)/i, score: 0.3, label: 'deadline_soon' },
    { pattern: /!!!|⚠️|🔴|URGENT/i, score: 0.2, label: 'visual_urgency' },
    { pattern: /\bfrist\b.{0,20}\d{1,2}\.\d{1,2}\./i, score: 0.2, label: 'german_deadline' },
  ];

  for (const { pattern, score: patternScore, label } of urgencyPatterns) {
    if (pattern.test(lower)) {
      score = Math.min(1, score + patternScore);
      indicators.push(label);
    }
  }

  return { score: Math.min(1, score), indicators };
}

export default {
  categorizeRequest,
  quickCategorize,
  extractUrgencyIndicators,
  BUSINESS_CATEGORIES,
};
