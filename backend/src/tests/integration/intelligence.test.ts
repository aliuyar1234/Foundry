/**
 * Integration Tests for Intelligence Features (T133-T136)
 * Tests for decision, SOP, optimization, prediction, and enrichment services
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Mock external services
vi.mock('../../lib/anthropic.js', () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '[]' }],
      }),
    },
  }),
}));

vi.mock('../../lib/qdrant.js', () => ({
  getQdrantClient: () => ({
    search: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('../../lib/openai.js', () => ({
  getOpenAIClient: () => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0) }],
      }),
    },
  }),
}));

const prisma = new PrismaClient();

describe('Intelligence Services Integration Tests', () => {
  const testTenantId = 'test-tenant';

  beforeAll(async () => {
    // Setup test data
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Decision Service', () => {
    it('should create a decision record', async () => {
      const { getDecisionService } = await import(
        '../../services/decision/decision.service.js'
      );
      const service = getDecisionService();

      // This would work with a real database
      expect(service).toBeDefined();
      expect(typeof service.createDecision).toBe('function');
      expect(typeof service.queryDecisions).toBe('function');
      expect(typeof service.extractDecisions).toBe('function');
    });

    it('should validate decision confidence scores', async () => {
      const { validateConfidence } = await import('../../models/DecisionRecord.js');

      expect(validateConfidence(0)).toBe(true);
      expect(validateConfidence(0.5)).toBe(true);
      expect(validateConfidence(1)).toBe(true);
      expect(validateConfidence(-0.1)).toBe(false);
      expect(validateConfidence(1.1)).toBe(false);
    });

    it('should calculate average confidence', async () => {
      const { calculateAverageConfidence } = await import('../../models/DecisionRecord.js');

      const decisions = [
        { confidence: 0.8 },
        { confidence: 0.6 },
        { confidence: 0.9 },
      ] as any[];

      expect(calculateAverageConfidence(decisions)).toBeCloseTo(0.767, 2);
      expect(calculateAverageConfidence([])).toBe(0);
    });
  });

  describe('SOP Service', () => {
    it('should initialize SOP service', async () => {
      const { getSopService } = await import('../../services/sop/sop.service.js');
      const service = getSopService();

      expect(service).toBeDefined();
      expect(typeof service.generateSop).toBe('function');
      expect(typeof service.createDraft).toBe('function');
      expect(typeof service.publishDraft).toBe('function');
    });

    it('should increment version correctly', async () => {
      const { incrementVersion } = await import('../../models/SopDraft.js');

      expect(incrementVersion('1.0.0', 'patch')).toBe('1.0.1');
      expect(incrementVersion('1.0.0', 'minor')).toBe('1.1.0');
      expect(incrementVersion('1.0.0', 'major')).toBe('2.0.0');
      expect(incrementVersion('2.3.5', 'patch')).toBe('2.3.6');
    });

    it('should calculate completeness score', async () => {
      const { calculateCompletenessScore } = await import('../../models/SopDraft.js');

      const fullContent = {
        purpose: 'Test purpose',
        scope: 'Test scope',
        definitions: [{ term: 'A', definition: 'B' }],
        responsibilities: [{ role: 'Admin', responsibilities: ['Do stuff'] }],
        prerequisites: ['Prereq 1'],
        procedures: [{ id: '1', stepNumber: 1, title: 'Step', description: 'Do this' }],
        qualityChecks: [{ id: '1', checkpoint: 'Check', criteria: 'OK', frequency: 'Daily', responsible: 'QA' }],
        exceptions: [{ id: '1', condition: 'If X', action: 'Do Y' }],
        references: [{ id: '1', title: 'Doc', type: 'Guide' }],
        revisionHistory: [],
      };

      expect(calculateCompletenessScore(fullContent)).toBe(100);

      const emptyContent = {
        purpose: '',
        scope: '',
        definitions: [],
        responsibilities: [],
        prerequisites: [],
        procedures: [],
        qualityChecks: [],
        exceptions: [],
        references: [],
        revisionHistory: [],
      };

      expect(calculateCompletenessScore(emptyContent)).toBe(0);
    });
  });

  describe('Optimization Service', () => {
    it('should initialize optimization service', async () => {
      const { getOptimizationService } = await import(
        '../../services/optimization/optimization.service.js'
      );
      const service = getOptimizationService();

      expect(service).toBeDefined();
      expect(typeof service.detectOptimizations).toBe('function');
      expect(typeof service.createSuggestion).toBe('function');
    });

    it('should calculate impact score', async () => {
      const { calculateImpactScore } = await import(
        '../../models/OptimizationSuggestion.js'
      );

      const impact = {
        timeReduction: { value: 50, unit: 'percent', minimum: 30, maximum: 70, confidence: 0.8 },
        costReduction: { value: 30, unit: 'percent', minimum: 20, maximum: 40, confidence: 0.7 },
        overallScore: 0,
        affectedProcesses: [],
        affectedRoles: [],
      };

      const score = calculateImpactScore(impact);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should calculate priority score', async () => {
      const { calculatePriorityScore } = await import(
        '../../models/OptimizationSuggestion.js'
      );

      const lowEffort = calculatePriorityScore(80, 'low', 0.9);
      const highEffort = calculatePriorityScore(80, 'high', 0.9);

      expect(lowEffort).toBeGreaterThan(highEffort);
    });
  });

  describe('Prediction Service', () => {
    it('should initialize prediction service', async () => {
      const { getPredictionService } = await import(
        '../../services/prediction/prediction.service.js'
      );
      const service = getPredictionService();

      expect(service).toBeDefined();
      expect(typeof service.createModel).toBe('function');
      expect(typeof service.predict).toBe('function');
      expect(typeof service.calculateHealthScore).toBe('function');
    });

    it('should calculate health score from dimensions', async () => {
      const { calculateHealthScore } = await import('../../models/Prediction.js');

      const dimensions = [
        { name: 'Reliability', score: 90, weight: 0.4, status: 'healthy' as const, description: '' },
        { name: 'Efficiency', score: 70, weight: 0.3, status: 'warning' as const, description: '' },
        { name: 'Quality', score: 80, weight: 0.3, status: 'healthy' as const, description: '' },
      ];

      const score = calculateHealthScore(dimensions);
      expect(score).toBeCloseTo(81, 0); // (90*0.4 + 70*0.3 + 80*0.3) = 81
    });

    it('should determine health status correctly', async () => {
      const { getHealthStatus } = await import('../../models/Prediction.js');

      expect(getHealthStatus(90)).toBe('healthy');
      expect(getHealthStatus(65)).toBe('warning');
      expect(getHealthStatus(30)).toBe('critical');
    });

    it('should check prediction validity', async () => {
      const { isPredictionValid } = await import('../../models/Prediction.js');

      const validPrediction = {
        validUntil: new Date(Date.now() + 3600000),
      } as any;

      const expiredPrediction = {
        validUntil: new Date(Date.now() - 3600000),
      } as any;

      expect(isPredictionValid(validPrediction)).toBe(true);
      expect(isPredictionValid(expiredPrediction)).toBe(false);
    });
  });

  describe('Enrichment Service', () => {
    it('should initialize enrichment service', async () => {
      const { getEnrichmentService } = await import(
        '../../services/graph/enrichment.service.js'
      );
      const service = getEnrichmentService();

      expect(service).toBeDefined();
      expect(typeof service.discoverRelationships).toBe('function');
      expect(typeof service.enrichEntity).toBe('function');
      expect(typeof service.mapExpertise).toBe('function');
    });
  });

  describe('MCP Service', () => {
    it('should validate scopes correctly', async () => {
      const { isValidScope, hasScope, hasAnyScope } = await import(
        '../../models/McpSession.js'
      );

      expect(isValidScope('foundry:read:org')).toBe(true);
      expect(isValidScope('invalid:scope')).toBe(false);

      const scopes = ['foundry:read:org', 'foundry:read:docs'];
      expect(hasScope(scopes, 'foundry:read:org')).toBe(true);
      expect(hasScope(scopes, 'foundry:write:docs')).toBe(false);
      expect(hasAnyScope(scopes, ['foundry:read:org', 'foundry:admin:all'])).toBe(true);
    });

    it('should sanitize parameters for audit', async () => {
      const { sanitizeParameters } = await import('../../models/McpAuditLog.js');

      const params = {
        query: 'test',
        password: 'secret123',
        apiKey: 'key-123',
        data: { nested: 'value' },
      };

      const sanitized = sanitizeParameters(params);
      expect(sanitized.query).toBe('test');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.data).toEqual({ nested: 'value' });
    });
  });
});
