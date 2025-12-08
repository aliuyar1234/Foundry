/**
 * Company Data Enrichment Service
 * Enriches entity records with data from external registries
 * T307 - Company data enrichment (UID, executives, etc.)
 */

import {
  RegistryClient,
  createRegistryClient,
  CompanyRegistryData,
  Executive,
} from './registryClient.js';
import { prisma } from '../../lib/prisma.js';

export interface EnrichmentRequest {
  entityId: string;
  entityType: 'company' | 'organization' | 'supplier' | 'customer';
  fields: EnrichmentField[];
  sources?: string[];
  overwriteExisting?: boolean;
}

export type EnrichmentField =
  | 'registration_number'
  | 'vat_id'
  | 'legal_form'
  | 'registration_date'
  | 'status'
  | 'capital'
  | 'executives'
  | 'shareholders'
  | 'industry'
  | 'address'
  | 'all';

export interface EnrichmentResult {
  entityId: string;
  success: boolean;
  fieldsEnriched: string[];
  fieldsSkipped: string[];
  errors: EnrichmentError[];
  source: string;
  matchConfidence: number;
  enrichedData: Partial<EnrichedCompanyData>;
  timestamp: Date;
}

export interface EnrichedCompanyData {
  registrationNumber?: string;
  vatId?: string;
  legalForm?: string;
  registrationDate?: Date;
  companyStatus?: string;
  capital?: {
    amount: number;
    currency: string;
  };
  executives?: Executive[];
  shareholders?: Array<{
    name: string;
    type: 'person' | 'company';
    sharePercentage?: number;
  }>;
  industry?: string[];
  address?: {
    street?: string;
    city: string;
    postalCode?: string;
    country: string;
    countryCode: string;
  };
  enrichmentSource?: string;
  enrichmentDate?: Date;
}

export interface EnrichmentError {
  field: string;
  code: string;
  message: string;
}

export interface BulkEnrichmentRequest {
  entityIds: string[];
  entityType: 'company' | 'organization' | 'supplier' | 'customer';
  fields: EnrichmentField[];
  batchSize?: number;
  continueOnError?: boolean;
}

export interface BulkEnrichmentResult {
  totalRequested: number;
  successful: number;
  failed: number;
  results: EnrichmentResult[];
}

export interface EnrichmentStats {
  totalEnrichments: number;
  successfulEnrichments: number;
  failedEnrichments: number;
  averageConfidence: number;
  bySource: Record<string, number>;
  byField: Record<string, number>;
  lastEnrichmentDate?: Date;
}

/**
 * Enrich a single company entity
 */
export async function enrichCompany(
  organizationId: string,
  request: EnrichmentRequest
): Promise<EnrichmentResult> {
  const startTime = Date.now();

  // Get entity record
  const entity = await getEntityRecord(organizationId, request.entityId, request.entityType);

  if (!entity) {
    return {
      entityId: request.entityId,
      success: false,
      fieldsEnriched: [],
      fieldsSkipped: [],
      errors: [{ field: 'entity', code: 'NOT_FOUND', message: 'Entity not found' }],
      source: 'none',
      matchConfidence: 0,
      enrichedData: {},
      timestamp: new Date(),
    };
  }

  // Determine which fields to enrich
  const fieldsToEnrich = request.fields.includes('all')
    ? ['registration_number', 'vat_id', 'legal_form', 'registration_date', 'status', 'capital', 'executives', 'shareholders', 'industry', 'address']
    : request.fields;

  // Find company in registry
  const registryData = await findCompanyInRegistry(entity);

  if (!registryData) {
    return {
      entityId: request.entityId,
      success: false,
      fieldsEnriched: [],
      fieldsSkipped: fieldsToEnrich,
      errors: [{ field: 'registry', code: 'NOT_FOUND', message: 'Company not found in registry' }],
      source: 'none',
      matchConfidence: 0,
      enrichedData: {},
      timestamp: new Date(),
    };
  }

  // Calculate match confidence
  const matchConfidence = calculateMatchConfidence(entity, registryData);

  if (matchConfidence < 0.7) {
    return {
      entityId: request.entityId,
      success: false,
      fieldsEnriched: [],
      fieldsSkipped: fieldsToEnrich,
      errors: [{ field: 'match', code: 'LOW_CONFIDENCE', message: `Match confidence too low: ${(matchConfidence * 100).toFixed(0)}%` }],
      source: registryData.registryType,
      matchConfidence,
      enrichedData: {},
      timestamp: new Date(),
    };
  }

  // Extract enrichment data
  const enrichedData = extractEnrichmentData(registryData, fieldsToEnrich);

  // Apply enrichment to entity
  const { fieldsEnriched, fieldsSkipped, errors } = await applyEnrichment(
    organizationId,
    request.entityId,
    request.entityType,
    enrichedData,
    request.overwriteExisting ?? false
  );

  // Log enrichment
  await logEnrichment(organizationId, {
    entityId: request.entityId,
    entityType: request.entityType,
    source: registryData.registryType,
    fieldsEnriched,
    matchConfidence,
    duration: Date.now() - startTime,
  });

  return {
    entityId: request.entityId,
    success: errors.length === 0,
    fieldsEnriched,
    fieldsSkipped,
    errors,
    source: registryData.registryType,
    matchConfidence,
    enrichedData,
    timestamp: new Date(),
  };
}

/**
 * Bulk enrich multiple companies
 */
export async function enrichCompanies(
  organizationId: string,
  request: BulkEnrichmentRequest
): Promise<BulkEnrichmentResult> {
  const batchSize = request.batchSize || 10;
  const results: EnrichmentResult[] = [];

  // Process in batches
  for (let i = 0; i < request.entityIds.length; i += batchSize) {
    const batch = request.entityIds.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((entityId) =>
        enrichCompany(organizationId, {
          entityId,
          entityType: request.entityType,
          fields: request.fields,
        }).catch((error) => ({
          entityId,
          success: false,
          fieldsEnriched: [],
          fieldsSkipped: [],
          errors: [{ field: 'system', code: 'ERROR', message: error.message }],
          source: 'none',
          matchConfidence: 0,
          enrichedData: {},
          timestamp: new Date(),
        }))
      )
    );

    results.push(...batchResults);

    // Check for early termination
    if (!request.continueOnError) {
      const hasError = batchResults.some((r) => !r.success);
      if (hasError) break;
    }
  }

  return {
    totalRequested: request.entityIds.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

/**
 * Get enrichment statistics for an organization
 */
export async function getEnrichmentStats(
  organizationId: string
): Promise<EnrichmentStats> {
  const logs = await prisma.enrichmentLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  const bySource: Record<string, number> = {};
  const byField: Record<string, number> = {};
  let totalConfidence = 0;
  let successCount = 0;

  for (const log of logs) {
    const source = log.source as string;
    bySource[source] = (bySource[source] || 0) + 1;

    const fields = log.fieldsEnriched as string[];
    for (const field of fields) {
      byField[field] = (byField[field] || 0) + 1;
    }

    if (log.success) {
      successCount++;
      totalConfidence += log.matchConfidence as number;
    }
  }

  return {
    totalEnrichments: logs.length,
    successfulEnrichments: successCount,
    failedEnrichments: logs.length - successCount,
    averageConfidence: successCount > 0 ? totalConfidence / successCount : 0,
    bySource,
    byField,
    lastEnrichmentDate: logs[0]?.createdAt,
  };
}

/**
 * Preview enrichment without applying changes
 */
export async function previewEnrichment(
  organizationId: string,
  request: EnrichmentRequest
): Promise<{
  currentData: Record<string, unknown>;
  proposedData: Record<string, unknown>;
  changes: Array<{ field: string; current: unknown; proposed: unknown }>;
  matchConfidence: number;
  source: string;
}> {
  const entity = await getEntityRecord(organizationId, request.entityId, request.entityType);

  if (!entity) {
    throw new Error('Entity not found');
  }

  const registryData = await findCompanyInRegistry(entity);

  if (!registryData) {
    throw new Error('Company not found in registry');
  }

  const matchConfidence = calculateMatchConfidence(entity, registryData);
  const enrichedData = extractEnrichmentData(registryData, request.fields);

  const changes: Array<{ field: string; current: unknown; proposed: unknown }> = [];

  for (const [field, value] of Object.entries(enrichedData)) {
    const currentValue = (entity as Record<string, unknown>)[field];
    if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
      changes.push({
        field,
        current: currentValue,
        proposed: value,
      });
    }
  }

  return {
    currentData: entity as Record<string, unknown>,
    proposedData: enrichedData,
    changes,
    matchConfidence,
    source: registryData.registryType,
  };
}

/**
 * Verify VAT ID against registry
 */
export async function verifyVatId(
  vatId: string
): Promise<{
  valid: boolean;
  companyName?: string;
  address?: string;
  country?: string;
}> {
  const country = vatId.substring(0, 2).toUpperCase();
  const client = createRegistryClient(country);

  const company = await client.lookupByVatId(vatId);

  if (!company) {
    return { valid: false };
  }

  return {
    valid: company.status === 'active',
    companyName: company.companyName,
    address: company.address
      ? `${company.address.street || ''}, ${company.address.postalCode || ''} ${company.address.city}`
      : undefined,
    country: company.address?.country,
  };
}

// Helper functions

async function getEntityRecord(
  organizationId: string,
  entityId: string,
  entityType: string
): Promise<Record<string, unknown> | null> {
  // Get entity from appropriate table based on type
  const entity = await prisma.entityRecord.findFirst({
    where: {
      id: entityId,
      organizationId,
      entityType,
    },
  });

  if (!entity) return null;

  return {
    id: entity.id,
    name: entity.name,
    ...entity.data as Record<string, unknown>,
  };
}

async function findCompanyInRegistry(
  entity: Record<string, unknown>
): Promise<CompanyRegistryData | null> {
  const name = entity.name as string;
  const country = (entity.country as string) || (entity.countryCode as string) || 'AT';
  const vatId = entity.vatId as string;
  const registrationNumber = entity.registrationNumber as string;

  const client = createRegistryClient(country);

  // Try lookup by registration number first
  if (registrationNumber) {
    const result = await client.getCompanyDetails(registrationNumber, country);
    if (result) return result;
  }

  // Try lookup by VAT ID
  if (vatId) {
    const result = await client.lookupByVatId(vatId);
    if (result) return result;
  }

  // Fall back to name search
  if (name) {
    const searchResult = await client.searchCompanies({
      companyName: name,
      country,
      limit: 5,
    });

    if (searchResult.companies.length > 0) {
      // Find best match
      return findBestMatch(name, searchResult.companies);
    }
  }

  return null;
}

function findBestMatch(
  targetName: string,
  candidates: CompanyRegistryData[]
): CompanyRegistryData | null {
  let bestMatch: CompanyRegistryData | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = calculateNameSimilarity(targetName, candidate.companyName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestScore >= 0.6 ? bestMatch : null;
}

function calculateNameSimilarity(name1: string, name2: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/gmbh|ag|kg|ohg|ug|ltd|plc|inc|corp/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

  const n1 = normalize(name1);
  const n2 = normalize(name2);

  if (n1 === n2) return 1;

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= n1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= n2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= n1.length; i++) {
    for (let j = 1; j <= n2.length; j++) {
      const cost = n1[i - 1] === n2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(n1.length, n2.length);
  return maxLen > 0 ? 1 - matrix[n1.length][n2.length] / maxLen : 0;
}

function calculateMatchConfidence(
  entity: Record<string, unknown>,
  registryData: CompanyRegistryData
): number {
  let score = 0;
  let factors = 0;

  // Name match
  if (entity.name && registryData.companyName) {
    const nameScore = calculateNameSimilarity(
      entity.name as string,
      registryData.companyName
    );
    score += nameScore * 40;
    factors += 40;
  }

  // VAT ID match
  if (entity.vatId && registryData.vatId) {
    const vatMatch = (entity.vatId as string).replace(/\s/g, '').toUpperCase() ===
      registryData.vatId.replace(/\s/g, '').toUpperCase();
    score += vatMatch ? 30 : 0;
    factors += 30;
  }

  // Registration number match
  if (entity.registrationNumber && registryData.registrationNumber) {
    const regMatch = (entity.registrationNumber as string).replace(/\s/g, '').toUpperCase() ===
      registryData.registrationNumber.replace(/\s/g, '').toUpperCase();
    score += regMatch ? 30 : 0;
    factors += 30;
  }

  // Address match (city)
  if (entity.city && registryData.address?.city) {
    const cityMatch = (entity.city as string).toLowerCase() ===
      registryData.address.city.toLowerCase();
    score += cityMatch ? 20 : 0;
    factors += 20;
  }

  return factors > 0 ? score / factors : 0;
}

function extractEnrichmentData(
  registryData: CompanyRegistryData,
  fields: string[]
): Partial<EnrichedCompanyData> {
  const data: Partial<EnrichedCompanyData> = {
    enrichmentSource: registryData.registryType,
    enrichmentDate: new Date(),
  };

  const fieldMap: Record<string, () => void> = {
    registration_number: () => {
      data.registrationNumber = registryData.registrationNumber;
    },
    vat_id: () => {
      data.vatId = registryData.vatId;
    },
    legal_form: () => {
      data.legalForm = registryData.legalForm;
    },
    registration_date: () => {
      data.registrationDate = registryData.registrationDate;
    },
    status: () => {
      data.companyStatus = registryData.status;
    },
    capital: () => {
      data.capital = registryData.capital;
    },
    executives: () => {
      data.executives = registryData.executives;
    },
    shareholders: () => {
      data.shareholders = registryData.shareholders;
    },
    industry: () => {
      data.industry = registryData.industry;
    },
    address: () => {
      data.address = registryData.address;
    },
  };

  for (const field of fields) {
    if (fieldMap[field]) {
      fieldMap[field]();
    }
  }

  return data;
}

async function applyEnrichment(
  organizationId: string,
  entityId: string,
  entityType: string,
  enrichedData: Partial<EnrichedCompanyData>,
  overwriteExisting: boolean
): Promise<{
  fieldsEnriched: string[];
  fieldsSkipped: string[];
  errors: EnrichmentError[];
}> {
  const fieldsEnriched: string[] = [];
  const fieldsSkipped: string[] = [];
  const errors: EnrichmentError[] = [];

  try {
    const entity = await prisma.entityRecord.findFirst({
      where: { id: entityId, organizationId },
    });

    if (!entity) {
      errors.push({ field: 'entity', code: 'NOT_FOUND', message: 'Entity not found' });
      return { fieldsEnriched, fieldsSkipped, errors };
    }

    const currentData = entity.data as Record<string, unknown> || {};
    const updatedData = { ...currentData };

    for (const [field, value] of Object.entries(enrichedData)) {
      if (value === undefined) continue;

      const existingValue = currentData[field];
      const hasExistingValue = existingValue !== undefined && existingValue !== null && existingValue !== '';

      if (hasExistingValue && !overwriteExisting) {
        fieldsSkipped.push(field);
      } else {
        updatedData[field] = value;
        fieldsEnriched.push(field);
      }
    }

    if (fieldsEnriched.length > 0) {
      await prisma.entityRecord.update({
        where: { id: entityId },
        data: {
          data: updatedData,
          updatedAt: new Date(),
        },
      });
    }
  } catch (error) {
    errors.push({
      field: 'database',
      code: 'UPDATE_FAILED',
      message: (error as Error).message,
    });
  }

  return { fieldsEnriched, fieldsSkipped, errors };
}

async function logEnrichment(
  organizationId: string,
  data: {
    entityId: string;
    entityType: string;
    source: string;
    fieldsEnriched: string[];
    matchConfidence: number;
    duration: number;
  }
): Promise<void> {
  await prisma.enrichmentLog.create({
    data: {
      organizationId,
      entityId: data.entityId,
      entityType: data.entityType,
      source: data.source,
      fieldsEnriched: data.fieldsEnriched,
      matchConfidence: data.matchConfidence,
      duration: data.duration,
      success: data.fieldsEnriched.length > 0,
      createdAt: new Date(),
    },
  });
}

export default {
  enrichCompany,
  enrichCompanies,
  getEnrichmentStats,
  previewEnrichment,
  verifyVatId,
};
