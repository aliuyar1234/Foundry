/**
 * SOP Deviation Detector
 * Compares ongoing process behavior against documented SOPs
 */

import { PrismaClient } from '@prisma/client';
import { ProcessData, ProcessStepData } from './inputFormatter.js';

export interface DeviationReport {
  sopId: string;
  sopTitle: string;
  processId: string;
  processName: string;
  analyzedAt: string;
  deviations: Deviation[];
  summary: DeviationSummary;
  recommendations: string[];
  complianceScore: number;
}

export interface Deviation {
  id: string;
  type: DeviationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: DeviationCategory;
  description: string;
  expectedBehavior: string;
  actualBehavior: string;
  frequency: number; // Percentage of cases with this deviation
  impact: string;
  affectedSteps?: string[];
  examples?: DeviationExample[];
  suggestedAction?: string;
}

export type DeviationType =
  | 'step_skipped'
  | 'step_added'
  | 'order_changed'
  | 'performer_mismatch'
  | 'timing_deviation'
  | 'path_deviation'
  | 'missing_documentation'
  | 'unauthorized_action';

export type DeviationCategory =
  | 'process_flow'
  | 'timing'
  | 'responsibility'
  | 'documentation'
  | 'compliance';

export interface DeviationExample {
  caseId: string;
  occurredAt: string;
  details: string;
}

export interface DeviationSummary {
  totalDeviations: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  mostCommonDeviation: string;
  criticalDeviations: number;
}

export interface DeviationDetectorConfig {
  timingTolerancePercent: number; // How much timing can deviate before flagging
  skipThreshold: number; // Minimum frequency to report step skips
  orderSensitivity: 'strict' | 'moderate' | 'lenient';
  includeExamples: boolean;
  maxExamplesPerDeviation: number;
}

const DEFAULT_CONFIG: DeviationDetectorConfig = {
  timingTolerancePercent: 25,
  skipThreshold: 5, // Report if >5% of cases skip a step
  orderSensitivity: 'moderate',
  includeExamples: true,
  maxExamplesPerDeviation: 5,
};

export class DeviationDetector {
  private prisma: PrismaClient;
  private config: DeviationDetectorConfig;

  constructor(prisma?: PrismaClient, config: Partial<DeviationDetectorConfig> = {}) {
    this.prisma = prisma || new PrismaClient();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect deviations between SOP and actual process behavior
   */
  async detectDeviations(
    sopId: string,
    currentProcessData: ProcessData
  ): Promise<DeviationReport> {
    // Fetch SOP
    const sop = await this.prisma.sOP.findUnique({
      where: { id: sopId },
      include: {
        process: true,
      },
    });

    if (!sop) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    // Parse SOP content to extract expected behavior
    const expectedBehavior = this.parseSOPContent(sop.content);

    // Detect various types of deviations
    const deviations: Deviation[] = [];

    // Check for step deviations
    const stepDeviations = this.detectStepDeviations(
      expectedBehavior.steps,
      currentProcessData.steps || []
    );
    deviations.push(...stepDeviations);

    // Check for timing deviations
    const timingDeviations = this.detectTimingDeviations(
      expectedBehavior,
      currentProcessData
    );
    deviations.push(...timingDeviations);

    // Check for performer deviations
    const performerDeviations = this.detectPerformerDeviations(
      expectedBehavior.steps,
      currentProcessData.steps || []
    );
    deviations.push(...performerDeviations);

    // Check for path deviations
    const pathDeviations = this.detectPathDeviations(
      expectedBehavior,
      currentProcessData
    );
    deviations.push(...pathDeviations);

    // Generate summary
    const summary = this.generateSummary(deviations);

    // Generate recommendations
    const recommendations = this.generateRecommendations(deviations, summary);

    // Calculate compliance score
    const complianceScore = this.calculateComplianceScore(deviations, currentProcessData);

    return {
      sopId: sop.id,
      sopTitle: sop.title,
      processId: currentProcessData.id,
      processName: currentProcessData.name,
      analyzedAt: new Date().toISOString(),
      deviations,
      summary,
      recommendations,
      complianceScore,
    };
  }

  /**
   * Parse SOP content to extract expected behavior
   */
  private parseSOPContent(content: string): {
    steps: ExpectedStep[];
    expectedDuration?: number;
    requiredParticipants: string[];
    mandatorySteps: string[];
  } {
    const steps: ExpectedStep[] = [];
    const requiredParticipants: string[] = [];
    const mandatorySteps: string[] = [];

    // Parse numbered steps from markdown
    const stepRegex = /^(?:\d+\.|\*|-)\s+(.+)$/gm;
    let match;
    let stepIndex = 0;

    while ((match = stepRegex.exec(content)) !== null) {
      const stepText = match[1].trim();
      stepIndex++;

      const step: ExpectedStep = {
        index: stepIndex,
        name: stepText,
        isMandatory: !stepText.toLowerCase().includes('optional'),
      };

      // Extract performer if mentioned
      const performerMatch = stepText.match(/\[([^\]]+)\]/);
      if (performerMatch) {
        step.expectedPerformer = performerMatch[1];
        if (!requiredParticipants.includes(step.expectedPerformer)) {
          requiredParticipants.push(step.expectedPerformer);
        }
      }

      // Extract timing if mentioned
      const timeMatch = stepText.match(/(\d+)\s*(min|hour|minute|h)/i);
      if (timeMatch) {
        const value = parseInt(timeMatch[1], 10);
        const unit = timeMatch[2].toLowerCase();
        step.expectedDuration = unit.startsWith('h') ? value * 60 : value;
      }

      if (step.isMandatory) {
        mandatorySteps.push(step.name);
      }

      steps.push(step);
    }

    return {
      steps,
      requiredParticipants,
      mandatorySteps,
    };
  }

  /**
   * Detect step-related deviations
   */
  private detectStepDeviations(
    expectedSteps: ExpectedStep[],
    actualSteps: ProcessStepData[]
  ): Deviation[] {
    const deviations: Deviation[] = [];
    const actualStepNames = new Set(actualSteps.map((s) => s.name.toLowerCase()));
    const expectedStepNames = new Set(expectedSteps.map((s) => s.name.toLowerCase()));

    // Check for skipped steps
    for (const expected of expectedSteps) {
      if (!actualStepNames.has(expected.name.toLowerCase())) {
        deviations.push({
          id: `skip-${expected.index}`,
          type: 'step_skipped',
          severity: expected.isMandatory ? 'high' : 'medium',
          category: 'process_flow',
          description: `Step "${expected.name}" is defined in SOP but not observed in actual process`,
          expectedBehavior: `Step "${expected.name}" should be executed`,
          actualBehavior: 'Step is being skipped',
          frequency: 100, // Will be updated with actual data if available
          impact: expected.isMandatory
            ? 'May affect process quality or compliance'
            : 'Optional step not being performed',
          affectedSteps: [expected.name],
          suggestedAction: expected.isMandatory
            ? 'Investigate why this mandatory step is being skipped'
            : 'Consider removing from SOP if consistently unnecessary',
        });
      }
    }

    // Check for added steps
    for (const actual of actualSteps) {
      if (!expectedStepNames.has(actual.name.toLowerCase())) {
        const frequency = actual.metrics?.frequency || 0;
        if (frequency > this.config.skipThreshold) {
          deviations.push({
            id: `add-${actual.id}`,
            type: 'step_added',
            severity: frequency > 50 ? 'medium' : 'low',
            category: 'process_flow',
            description: `Step "${actual.name}" is performed but not documented in SOP`,
            expectedBehavior: 'Step not expected according to SOP',
            actualBehavior: `Step is performed in ${frequency.toFixed(1)}% of cases`,
            frequency,
            impact: 'Process may have undocumented procedures',
            affectedSteps: [actual.name],
            suggestedAction: 'Consider adding this step to the SOP if it adds value',
          });
        }
      }
    }

    return deviations;
  }

  /**
   * Detect timing-related deviations
   */
  private detectTimingDeviations(
    expected: { steps: ExpectedStep[]; expectedDuration?: number },
    actual: ProcessData
  ): Deviation[] {
    const deviations: Deviation[] = [];

    // Check step-level timing
    for (const expectedStep of expected.steps) {
      if (expectedStep.expectedDuration) {
        const actualStep = actual.steps?.find(
          (s) => s.name.toLowerCase() === expectedStep.name.toLowerCase()
        );

        if (actualStep?.metrics?.avgDuration) {
          const actualDuration = actualStep.metrics.avgDuration;
          const expectedDuration = expectedStep.expectedDuration;
          const deviation = Math.abs(actualDuration - expectedDuration) / expectedDuration * 100;

          if (deviation > this.config.timingTolerancePercent) {
            const isSlower = actualDuration > expectedDuration;
            deviations.push({
              id: `timing-${expectedStep.index}`,
              type: 'timing_deviation',
              severity: deviation > 100 ? 'high' : deviation > 50 ? 'medium' : 'low',
              category: 'timing',
              description: `Step "${expectedStep.name}" ${isSlower ? 'takes longer' : 'completes faster'} than documented`,
              expectedBehavior: `Expected duration: ${expectedDuration} minutes`,
              actualBehavior: `Actual average: ${actualDuration.toFixed(1)} minutes (${deviation.toFixed(0)}% ${isSlower ? 'slower' : 'faster'})`,
              frequency: 100,
              impact: isSlower
                ? 'Process efficiency may be impacted'
                : 'SOP timing estimates may be outdated',
              affectedSteps: [expectedStep.name],
              suggestedAction: isSlower
                ? 'Investigate bottlenecks or update SOP with realistic timing'
                : 'Update SOP timing to reflect optimized process',
            });
          }
        }
      }
    }

    return deviations;
  }

  /**
   * Detect performer-related deviations
   */
  private detectPerformerDeviations(
    expectedSteps: ExpectedStep[],
    actualSteps: ProcessStepData[]
  ): Deviation[] {
    const deviations: Deviation[] = [];

    for (const expectedStep of expectedSteps) {
      if (expectedStep.expectedPerformer) {
        const actualStep = actualSteps.find(
          (s) => s.name.toLowerCase() === expectedStep.name.toLowerCase()
        );

        if (actualStep?.performer) {
          const actualPerformer = typeof actualStep.performer === 'string'
            ? actualStep.performer
            : actualStep.performer.name;

          if (actualPerformer.toLowerCase() !== expectedStep.expectedPerformer.toLowerCase()) {
            deviations.push({
              id: `performer-${expectedStep.index}`,
              type: 'performer_mismatch',
              severity: 'medium',
              category: 'responsibility',
              description: `Step "${expectedStep.name}" is performed by different role than specified`,
              expectedBehavior: `Should be performed by: ${expectedStep.expectedPerformer}`,
              actualBehavior: `Actually performed by: ${actualPerformer}`,
              frequency: 100,
              impact: 'May indicate unclear responsibilities or unauthorized access',
              affectedSteps: [expectedStep.name],
              suggestedAction: 'Verify role assignments and update SOP or process as needed',
            });
          }
        }
      }
    }

    return deviations;
  }

  /**
   * Detect path-related deviations
   */
  private detectPathDeviations(
    expected: { steps: ExpectedStep[] },
    actual: ProcessData
  ): Deviation[] {
    const deviations: Deviation[] = [];

    // Check if variants significantly deviate from expected sequence
    if (actual.variants && actual.variants.length > 0) {
      const expectedSequence = expected.steps.map((s) => s.name.toLowerCase());

      for (const variant of actual.variants) {
        if (variant.frequency > 10) {
          // Only check significant variants
          const variantSequence = variant.steps.map((s) => s.toLowerCase());

          // Check for order changes
          let orderViolations = 0;
          for (let i = 0; i < variantSequence.length - 1; i++) {
            const currentIdx = expectedSequence.indexOf(variantSequence[i]);
            const nextIdx = expectedSequence.indexOf(variantSequence[i + 1]);

            if (currentIdx !== -1 && nextIdx !== -1 && currentIdx > nextIdx) {
              orderViolations++;
            }
          }

          if (orderViolations > 0 && this.config.orderSensitivity !== 'lenient') {
            deviations.push({
              id: `order-${variant.id}`,
              type: 'order_changed',
              severity: this.config.orderSensitivity === 'strict' ? 'high' : 'medium',
              category: 'process_flow',
              description: `Process variant "${variant.name || 'Unnamed'}" executes steps in different order than SOP`,
              expectedBehavior: `Expected order: ${expectedSequence.slice(0, 5).join(' → ')}...`,
              actualBehavior: `Actual order: ${variantSequence.slice(0, 5).join(' → ')}...`,
              frequency: variant.frequency,
              impact: 'May affect process outcomes or quality',
              suggestedAction: 'Review if order change is intentional optimization or error',
            });
          }
        }
      }
    }

    return deviations;
  }

  /**
   * Generate deviation summary
   */
  private generateSummary(deviations: Deviation[]): DeviationSummary {
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const deviation of deviations) {
      bySeverity[deviation.severity] = (bySeverity[deviation.severity] || 0) + 1;
      byType[deviation.type] = (byType[deviation.type] || 0) + 1;
      byCategory[deviation.category] = (byCategory[deviation.category] || 0) + 1;
    }

    const mostCommonType = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      totalDeviations: deviations.length,
      bySeverity,
      byType,
      byCategory,
      mostCommonDeviation: mostCommonType ? mostCommonType[0] : 'none',
      criticalDeviations: bySeverity['critical'] || 0,
    };
  }

  /**
   * Generate recommendations based on deviations
   */
  private generateRecommendations(
    deviations: Deviation[],
    summary: DeviationSummary
  ): string[] {
    const recommendations: string[] = [];

    if (summary.criticalDeviations > 0) {
      recommendations.push(
        `Address ${summary.criticalDeviations} critical deviation(s) immediately to ensure compliance`
      );
    }

    if (summary.byType['step_skipped'] > 2) {
      recommendations.push(
        'Multiple steps are being skipped - review SOP for unnecessary steps or training gaps'
      );
    }

    if (summary.byType['step_added'] > 2) {
      recommendations.push(
        'Several undocumented steps observed - update SOP to reflect actual best practices'
      );
    }

    if (summary.byType['timing_deviation'] > 2) {
      recommendations.push(
        'Significant timing variations detected - review SOP timing estimates and process efficiency'
      );
    }

    if (summary.byType['performer_mismatch'] > 0) {
      recommendations.push(
        'Role assignments differ from SOP - clarify responsibilities and update documentation'
      );
    }

    if (deviations.length === 0) {
      recommendations.push('Process is well-aligned with SOP - continue monitoring for drift');
    }

    return recommendations;
  }

  /**
   * Calculate compliance score
   */
  private calculateComplianceScore(
    deviations: Deviation[],
    processData: ProcessData
  ): number {
    if (deviations.length === 0) return 100;

    const totalSteps = processData.steps?.length || 1;

    // Weight deviations by severity
    const severityWeights: Record<string, number> = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
    };

    let deductionPoints = 0;
    for (const deviation of deviations) {
      const weight = severityWeights[deviation.severity] || 5;
      const frequencyFactor = deviation.frequency / 100;
      deductionPoints += weight * frequencyFactor;
    }

    // Normalize by total steps
    const maxDeduction = totalSteps * 10;
    const normalizedDeduction = Math.min(deductionPoints, maxDeduction);
    const score = 100 - (normalizedDeduction / maxDeduction) * 100;

    return Math.max(0, Math.round(score));
  }
}

interface ExpectedStep {
  index: number;
  name: string;
  isMandatory: boolean;
  expectedPerformer?: string;
  expectedDuration?: number;
}

// Factory function
export function createDeviationDetector(
  prisma?: PrismaClient,
  config?: Partial<DeviationDetectorConfig>
): DeviationDetector {
  return new DeviationDetector(prisma, config);
}

export default DeviationDetector;
