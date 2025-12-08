/**
 * Data Masker Service
 * T241 - Implements sensitive data masking in AI responses
 *
 * Masks PII, financial data, and other sensitive information
 * before returning AI-generated responses to users
 */

import { EventEmitter } from 'events';

// Types
interface MaskingRule {
  id: string;
  name: string;
  category: SensitiveDataCategory;
  pattern: RegExp;
  replacement: string | ((match: string) => string);
  enabled: boolean;
  priority: number;
}

type SensitiveDataCategory =
  | 'pii'
  | 'financial'
  | 'credentials'
  | 'health'
  | 'legal'
  | 'internal'
  | 'custom';

interface MaskingResult {
  original: string;
  masked: string;
  maskedCount: number;
  categories: SensitiveDataCategory[];
  maskedItems: MaskedItem[];
  processingTimeMs: number;
}

interface MaskedItem {
  category: SensitiveDataCategory;
  ruleId: string;
  original: string;
  masked: string;
  position: { start: number; end: number };
}

interface MaskingConfig {
  enabled: boolean;
  logMasking: boolean;
  preserveLength: boolean;
  maskChar: string;
  enabledCategories: SensitiveDataCategory[];
  customRules: MaskingRule[];
  exemptPatterns: RegExp[];
}

interface DataMaskerEvents {
  masked: (result: MaskingResult) => void;
  error: (error: Error) => void;
  configChanged: (config: MaskingConfig) => void;
}

// Default masking rules
const DEFAULT_RULES: MaskingRule[] = [
  // PII - Personal Identifiable Information
  {
    id: 'email',
    name: 'Email Addresses',
    category: 'pii',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL]',
    enabled: true,
    priority: 10,
  },
  {
    id: 'phone_us',
    name: 'US Phone Numbers',
    category: 'pii',
    pattern: /\b(?:\+1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE]',
    enabled: true,
    priority: 10,
  },
  {
    id: 'phone_intl',
    name: 'International Phone Numbers',
    category: 'pii',
    pattern: /\b\+?[1-9]\d{1,14}\b/g,
    replacement: '[PHONE]',
    enabled: true,
    priority: 9,
  },
  {
    id: 'ssn',
    name: 'Social Security Numbers',
    category: 'pii',
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replacement: '[SSN]',
    enabled: true,
    priority: 20,
  },
  {
    id: 'passport',
    name: 'Passport Numbers',
    category: 'pii',
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/gi,
    replacement: '[PASSPORT]',
    enabled: true,
    priority: 15,
  },
  {
    id: 'dob',
    name: 'Date of Birth',
    category: 'pii',
    pattern: /\b(?:DOB|Date of Birth|Born|Birthday)[:\s]*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/gi,
    replacement: '[DOB]',
    enabled: true,
    priority: 15,
  },
  {
    id: 'address',
    name: 'Street Addresses',
    category: 'pii',
    pattern: /\b\d{1,5}\s+[\w\s]{1,50}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Circle|Cir|Way|Place|Pl)\.?\s*(?:#\s*\d+|Apt\.?\s*\d+|Suite\s*\d+|Unit\s*\d+)?\b/gi,
    replacement: '[ADDRESS]',
    enabled: true,
    priority: 10,
  },
  {
    id: 'ip_address',
    name: 'IP Addresses',
    category: 'pii',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    replacement: '[IP_ADDRESS]',
    enabled: true,
    priority: 10,
  },

  // Financial Information
  {
    id: 'credit_card',
    name: 'Credit Card Numbers',
    category: 'financial',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    replacement: '[CREDIT_CARD]',
    enabled: true,
    priority: 20,
  },
  {
    id: 'credit_card_formatted',
    name: 'Formatted Credit Card Numbers',
    category: 'financial',
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[CREDIT_CARD]',
    enabled: true,
    priority: 20,
  },
  {
    id: 'bank_account',
    name: 'Bank Account Numbers',
    category: 'financial',
    pattern: /\b(?:account|acct)[:\s#]*\d{8,17}\b/gi,
    replacement: '[BANK_ACCOUNT]',
    enabled: true,
    priority: 18,
  },
  {
    id: 'routing_number',
    name: 'Routing Numbers',
    category: 'financial',
    pattern: /\b(?:routing|aba)[:\s#]*\d{9}\b/gi,
    replacement: '[ROUTING_NUMBER]',
    enabled: true,
    priority: 18,
  },
  {
    id: 'iban',
    name: 'IBAN Numbers',
    category: 'financial',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]?){0,16}\b/gi,
    replacement: '[IBAN]',
    enabled: true,
    priority: 18,
  },
  {
    id: 'salary',
    name: 'Salary Information',
    category: 'financial',
    pattern: /\b(?:salary|compensation|pay)[:\s]*[$€£]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/gi,
    replacement: '[SALARY]',
    enabled: true,
    priority: 15,
  },

  // Credentials & Secrets
  {
    id: 'api_key',
    name: 'API Keys',
    category: 'credentials',
    pattern: /\b(?:api[_-]?key|apikey)[:\s=]*["']?[A-Za-z0-9_-]{20,}["']?\b/gi,
    replacement: '[API_KEY]',
    enabled: true,
    priority: 25,
  },
  {
    id: 'bearer_token',
    name: 'Bearer Tokens',
    category: 'credentials',
    pattern: /\bBearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gi,
    replacement: '[BEARER_TOKEN]',
    enabled: true,
    priority: 25,
  },
  {
    id: 'password',
    name: 'Passwords',
    category: 'credentials',
    pattern: /\b(?:password|passwd|pwd)[:\s=]*["']?[^\s"']{6,}["']?\b/gi,
    replacement: '[PASSWORD]',
    enabled: true,
    priority: 25,
  },
  {
    id: 'secret_key',
    name: 'Secret Keys',
    category: 'credentials',
    pattern: /\b(?:secret[_-]?key|secretkey|private[_-]?key)[:\s=]*["']?[A-Za-z0-9_-]{16,}["']?\b/gi,
    replacement: '[SECRET_KEY]',
    enabled: true,
    priority: 25,
  },
  {
    id: 'aws_key',
    name: 'AWS Keys',
    category: 'credentials',
    pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: '[AWS_KEY]',
    enabled: true,
    priority: 25,
  },

  // Health Information (HIPAA)
  {
    id: 'medical_record',
    name: 'Medical Record Numbers',
    category: 'health',
    pattern: /\b(?:MRN|Medical Record|Patient ID)[:\s#]*[A-Z0-9]{6,15}\b/gi,
    replacement: '[MEDICAL_RECORD]',
    enabled: true,
    priority: 20,
  },
  {
    id: 'diagnosis',
    name: 'Diagnosis Codes',
    category: 'health',
    pattern: /\b(?:ICD-?10|diagnosis)[:\s]*[A-Z]\d{2}(?:\.\d{1,4})?\b/gi,
    replacement: '[DIAGNOSIS_CODE]',
    enabled: true,
    priority: 15,
  },
  {
    id: 'health_insurance',
    name: 'Health Insurance IDs',
    category: 'health',
    pattern: /\b(?:insurance|policy|member)[:\s#]*[A-Z0-9]{8,20}\b/gi,
    replacement: '[INSURANCE_ID]',
    enabled: true,
    priority: 15,
  },

  // Legal & Internal
  {
    id: 'case_number',
    name: 'Legal Case Numbers',
    category: 'legal',
    pattern: /\b(?:case|docket|matter)[:\s#]*\d{2,4}[-/]?[A-Z]{2,4}[-/]?\d{4,10}\b/gi,
    replacement: '[CASE_NUMBER]',
    enabled: true,
    priority: 15,
  },
  {
    id: 'employee_id',
    name: 'Employee IDs',
    category: 'internal',
    pattern: /\b(?:employee|emp|staff)[:\s#]*[A-Z0-9]{4,10}\b/gi,
    replacement: '[EMPLOYEE_ID]',
    enabled: true,
    priority: 10,
  },
  {
    id: 'internal_project',
    name: 'Internal Project Codes',
    category: 'internal',
    pattern: /\b(?:project|proj)[:\s#]*[A-Z]{2,4}[-_]?\d{4,8}\b/gi,
    replacement: '[PROJECT_CODE]',
    enabled: true,
    priority: 8,
  },
];

// Event emitter for masking events
class DataMaskerEmitter extends EventEmitter {
  emit<K extends keyof DataMaskerEvents>(event: K, ...args: Parameters<DataMaskerEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof DataMaskerEvents>(event: K, listener: DataMaskerEvents[K]): this {
    return super.on(event, listener);
  }
}

// Singleton emitter
const maskerEvents = new DataMaskerEmitter();

// Configuration state
let config: MaskingConfig = {
  enabled: true,
  logMasking: true,
  preserveLength: false,
  maskChar: '*',
  enabledCategories: ['pii', 'financial', 'credentials', 'health', 'legal', 'internal'],
  customRules: [],
  exemptPatterns: [],
};

/**
 * Configure the data masker
 */
export function configure(newConfig: Partial<MaskingConfig>): void {
  config = { ...config, ...newConfig };
  maskerEvents.emit('configChanged', config);
}

/**
 * Get current configuration
 */
export function getConfig(): MaskingConfig {
  return { ...config };
}

/**
 * Get all active masking rules
 */
export function getActiveRules(): MaskingRule[] {
  const allRules = [...DEFAULT_RULES, ...config.customRules];
  return allRules
    .filter((rule) => rule.enabled && config.enabledCategories.includes(rule.category))
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Add a custom masking rule
 */
export function addCustomRule(rule: Omit<MaskingRule, 'id'>): string {
  const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const newRule: MaskingRule = { ...rule, id };
  config.customRules.push(newRule);
  return id;
}

/**
 * Remove a custom rule
 */
export function removeCustomRule(ruleId: string): boolean {
  const index = config.customRules.findIndex((r) => r.id === ruleId);
  if (index >= 0) {
    config.customRules.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Check if text contains sensitive data
 */
export function containsSensitiveData(text: string): boolean {
  if (!config.enabled) return false;

  const rules = getActiveRules();
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Detect sensitive data categories in text
 */
export function detectSensitiveCategories(text: string): SensitiveDataCategory[] {
  const categories = new Set<SensitiveDataCategory>();
  const rules = getActiveRules();

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      categories.add(rule.category);
    }
  }

  return Array.from(categories);
}

/**
 * Mask sensitive data in text
 */
export function maskSensitiveData(text: string): MaskingResult {
  const startTime = Date.now();
  const maskedItems: MaskedItem[] = [];
  const categories = new Set<SensitiveDataCategory>();

  if (!config.enabled) {
    return {
      original: text,
      masked: text,
      maskedCount: 0,
      categories: [],
      maskedItems: [],
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Check for exempt patterns
  for (const exemptPattern of config.exemptPatterns) {
    if (exemptPattern.test(text)) {
      return {
        original: text,
        masked: text,
        maskedCount: 0,
        categories: [],
        maskedItems: [],
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  let maskedText = text;
  const rules = getActiveRules();

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match;

    while ((match = rule.pattern.exec(text)) !== null) {
      const original = match[0];
      const replacement =
        typeof rule.replacement === 'function'
          ? rule.replacement(original)
          : config.preserveLength
          ? createLengthPreservingMask(original, rule.replacement)
          : rule.replacement;

      maskedItems.push({
        category: rule.category,
        ruleId: rule.id,
        original,
        masked: replacement,
        position: { start: match.index, end: match.index + original.length },
      });

      categories.add(rule.category);
    }

    // Apply masking
    rule.pattern.lastIndex = 0;
    maskedText = maskedText.replace(rule.pattern, (match) => {
      return typeof rule.replacement === 'function'
        ? rule.replacement(match)
        : config.preserveLength
        ? createLengthPreservingMask(match, rule.replacement)
        : rule.replacement;
    });
  }

  const result: MaskingResult = {
    original: text,
    masked: maskedText,
    maskedCount: maskedItems.length,
    categories: Array.from(categories),
    maskedItems,
    processingTimeMs: Date.now() - startTime,
  };

  if (config.logMasking && maskedItems.length > 0) {
    maskerEvents.emit('masked', result);
  }

  return result;
}

/**
 * Mask sensitive data in AI response object
 */
export function maskAIResponse<T extends Record<string, unknown>>(response: T): T {
  return maskObjectRecursive(response) as T;
}

/**
 * Recursively mask sensitive data in objects
 */
function maskObjectRecursive(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return maskSensitiveData(obj).masked;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => maskObjectRecursive(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = maskObjectRecursive(value);
    }
    return result;
  }

  return obj;
}

/**
 * Create a length-preserving mask
 */
function createLengthPreservingMask(original: string, placeholder: string): string {
  if (original.length <= placeholder.length) {
    return placeholder;
  }

  const visibleChars = Math.min(4, Math.floor(original.length / 4));
  const prefix = original.substring(0, visibleChars);
  const suffix = original.substring(original.length - visibleChars);
  const maskLength = original.length - visibleChars * 2;

  return prefix + config.maskChar.repeat(maskLength) + suffix;
}

/**
 * Partially mask a value (show first/last characters)
 */
export function partialMask(value: string, showFirst = 2, showLast = 2): string {
  if (value.length <= showFirst + showLast) {
    return config.maskChar.repeat(value.length);
  }

  const prefix = value.substring(0, showFirst);
  const suffix = value.substring(value.length - showLast);
  const maskLength = value.length - showFirst - showLast;

  return prefix + config.maskChar.repeat(maskLength) + suffix;
}

/**
 * Hash sensitive data (for logging/debugging without exposing actual values)
 */
export function hashSensitiveData(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `[HASH:${Math.abs(hash).toString(16).padStart(8, '0')}]`;
}

/**
 * Validate that text is properly masked
 */
export function validateMasking(text: string): { valid: boolean; unmmaskedCategories: SensitiveDataCategory[] } {
  const unmasked = detectSensitiveCategories(text);
  return {
    valid: unmasked.length === 0,
    unmmaskedCategories: unmasked,
  };
}

/**
 * Get masking statistics
 */
export function getMaskingStats(): {
  rulesCount: number;
  enabledRulesCount: number;
  categoriesEnabled: SensitiveDataCategory[];
} {
  const rules = getActiveRules();
  return {
    rulesCount: DEFAULT_RULES.length + config.customRules.length,
    enabledRulesCount: rules.length,
    categoriesEnabled: config.enabledCategories,
  };
}

/**
 * Subscribe to masking events
 */
export function onMasked(callback: (result: MaskingResult) => void): () => void {
  maskerEvents.on('masked', callback);
  return () => maskerEvents.removeListener('masked', callback);
}

/**
 * Subscribe to errors
 */
export function onError(callback: (error: Error) => void): () => void {
  maskerEvents.on('error', callback);
  return () => maskerEvents.removeListener('error', callback);
}

// Export types
export type {
  MaskingRule,
  SensitiveDataCategory,
  MaskingResult,
  MaskedItem,
  MaskingConfig,
};

export default {
  configure,
  getConfig,
  getActiveRules,
  addCustomRule,
  removeCustomRule,
  containsSensitiveData,
  detectSensitiveCategories,
  maskSensitiveData,
  maskAIResponse,
  partialMask,
  hashSensitiveData,
  validateMasking,
  getMaskingStats,
  onMasked,
  onError,
};
