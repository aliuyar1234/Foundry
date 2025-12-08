/**
 * BMD Payroll Process Extractor (T151)
 * Extracts payroll WORKFLOW events only (no salary amounts!)
 * Tracks payroll run dates, submission status, approval workflow
 * Austrian social insurance (SV) submission tracking
 * Lohnzettel (wage slip) generation events
 */

import { ExtractedEvent } from '../../base/connector';
import { BmdClient } from '../bmdClient';

export interface PayrollRun {
  id: string;
  periodYear: number;
  periodMonth: number;
  periodStart: string;
  periodEnd: string;
  runDate: string;
  status: PayrollStatus;
  employeeCount: number;
  approvedBy?: string;
  approvedAt?: string;
  submittedBy?: string;
  submittedAt?: string;
  svSubmissionStatus?: SocialInsuranceSubmissionStatus;
  lohnzettelGenerated: boolean;
  lohnzettelGeneratedAt?: string;
  createdAt: string;
  modifiedAt: string;
}

export type PayrollStatus =
  | 'draft'           // Entwurf
  | 'calculated'      // Berechnet
  | 'approved'        // Genehmigt
  | 'submitted'       // Übermittelt
  | 'completed'       // Abgeschlossen
  | 'cancelled';      // Storniert

export interface SocialInsuranceSubmissionStatus {
  submitted: boolean;
  submittedAt?: string;
  submittedBy?: string;
  svmeldungGenerated: boolean;  // SV-Meldung (social insurance report)
  svmeldungSubmittedAt?: string;
  confirmationReceived: boolean;
  confirmationReceivedAt?: string;
  errors?: string[];
}

export interface LohnzettelEvent {
  id: string;
  payrollRunId: string;
  employeeId: string;
  periodYear: number;
  periodMonth: number;
  generatedAt: string;
  generatedBy: string;
  deliveryMethod: 'print' | 'email' | 'portal';
  deliveredAt?: string;
  viewed: boolean;
  viewedAt?: string;
}

export interface PayrollApprovalWorkflow {
  id: string;
  payrollRunId: string;
  step: number;
  approverRole: string;
  approverUserId?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
  rejectedAt?: string;
  comments?: string;
  createdAt: string;
}

export interface PayrollExtractionOptions {
  organizationId: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: PayrollStatus[];
  includeLohnzettel?: boolean;
  includeApprovalWorkflow?: boolean;
  includeSvSubmissions?: boolean;
}

export interface PayrollExtractionResult {
  events: ExtractedEvent[];
  payrollRuns: PayrollRun[];
  lohnzettelEvents: LohnzettelEvent[];
  approvalWorkflows: PayrollApprovalWorkflow[];
  summary: {
    totalRuns: number;
    totalEmployees: number;
    byStatus: Record<PayrollStatus, number>;
    svSubmissionsCompleted: number;
    lohnzettelGenerated: number;
  };
}

export class BmdPayrollExtractor {
  private client: BmdClient;
  private payrollCache: Map<string, PayrollRun> = new Map();

  constructor(client: BmdClient) {
    this.client = client;
  }

  /**
   * Extract payroll workflow events
   */
  async extractPayrollWorkflow(
    options: PayrollExtractionOptions
  ): Promise<PayrollExtractionResult> {
    const events: ExtractedEvent[] = [];
    const payrollRuns: PayrollRun[] = [];
    const lohnzettelEvents: LohnzettelEvent[] = [];
    const approvalWorkflows: PayrollApprovalWorkflow[] = [];
    const byStatus: Record<string, number> = {};
    let totalEmployees = 0;
    let svSubmissionsCompleted = 0;
    let lohnzettelGenerated = 0;

    try {
      // Get payroll runs
      const runs = await this.getPayrollRuns(options);

      for (const run of runs) {
        payrollRuns.push(run);
        this.payrollCache.set(run.id, run);

        // Create payroll run event
        events.push(this.createPayrollRunEvent(run, options.organizationId));

        // Update statistics
        byStatus[run.status] = (byStatus[run.status] || 0) + 1;
        totalEmployees += run.employeeCount;

        if (run.svSubmissionStatus?.confirmationReceived) {
          svSubmissionsCompleted++;
        }

        if (run.lohnzettelGenerated) {
          lohnzettelGenerated++;
        }

        // Extract Lohnzettel events if requested
        if (options.includeLohnzettel && run.lohnzettelGenerated) {
          const lohnzettel = await this.getLohnzettelEvents(run.id);
          lohnzettelEvents.push(...lohnzettel);

          for (const lz of lohnzettel) {
            events.push(this.createLohnzettelEvent(lz, options.organizationId));
          }
        }

        // Extract approval workflow if requested
        if (options.includeApprovalWorkflow) {
          const workflows = await this.getApprovalWorkflow(run.id);
          approvalWorkflows.push(...workflows);

          for (const wf of workflows) {
            events.push(this.createApprovalWorkflowEvent(wf, options.organizationId));
          }
        }

        // Extract SV submission events if requested
        if (options.includeSvSubmissions && run.svSubmissionStatus) {
          events.push(this.createSvSubmissionEvent(run, options.organizationId));
        }
      }
    } catch (error) {
      console.warn('Failed to extract payroll workflow:', error);
    }

    return {
      events,
      payrollRuns,
      lohnzettelEvents,
      approvalWorkflows,
      summary: {
        totalRuns: payrollRuns.length,
        totalEmployees,
        byStatus: byStatus as Record<PayrollStatus, number>,
        svSubmissionsCompleted,
        lohnzettelGenerated,
      },
    };
  }

  /**
   * Get payroll runs from BMD
   */
  private async getPayrollRuns(
    options: PayrollExtractionOptions
  ): Promise<PayrollRun[]> {
    try {
      const params = new URLSearchParams();

      if (options.dateFrom) {
        params.set('dateFrom', options.dateFrom.toISOString().split('T')[0]);
      }

      if (options.dateTo) {
        params.set('dateTo', options.dateTo.toISOString().split('T')[0]);
      }

      if (options.status && options.status.length > 0) {
        params.set('status', options.status.join(','));
      }

      const result = await (this.client as any).request<{
        payrollRuns: PayrollRun[];
      }>(`/payroll/runs?${params.toString()}`);

      return result.payrollRuns || [];
    } catch (error) {
      console.warn('Failed to get payroll runs:', error);
      return [];
    }
  }

  /**
   * Get Lohnzettel events for a payroll run
   */
  private async getLohnzettelEvents(payrollRunId: string): Promise<LohnzettelEvent[]> {
    try {
      const result = await (this.client as any).request<{
        lohnzettel: LohnzettelEvent[];
      }>(`/payroll/runs/${payrollRunId}/lohnzettel`);

      return result.lohnzettel || [];
    } catch (error) {
      console.warn('Failed to get Lohnzettel events:', error);
      return [];
    }
  }

  /**
   * Get approval workflow for a payroll run
   */
  private async getApprovalWorkflow(payrollRunId: string): Promise<PayrollApprovalWorkflow[]> {
    try {
      const result = await (this.client as any).request<{
        workflows: PayrollApprovalWorkflow[];
      }>(`/payroll/runs/${payrollRunId}/approval-workflow`);

      return result.workflows || [];
    } catch (error) {
      console.warn('Failed to get approval workflow:', error);
      return [];
    }
  }

  /**
   * Create payroll run event
   */
  private createPayrollRunEvent(
    run: PayrollRun,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'payroll.run',
      timestamp: new Date(run.modifiedAt),
      actorId: run.submittedBy || run.approvedBy,
      targetId: `bmd:payroll:${run.id}`,
      metadata: {
        source: 'bmd',
        organizationId,
        payrollRunId: run.id,
        periodYear: run.periodYear,
        periodMonth: run.periodMonth,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        runDate: run.runDate,
        status: run.status,
        employeeCount: run.employeeCount,
        approvedBy: run.approvedBy,
        approvedAt: run.approvedAt,
        submittedBy: run.submittedBy,
        submittedAt: run.submittedAt,
        lohnzettelGenerated: run.lohnzettelGenerated,
        lohnzettelGeneratedAt: run.lohnzettelGeneratedAt,
        createdAt: run.createdAt,
        modifiedAt: run.modifiedAt,
      },
    };
  }

  /**
   * Create Lohnzettel event
   */
  private createLohnzettelEvent(
    lohnzettel: LohnzettelEvent,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'payroll.lohnzettel',
      timestamp: new Date(lohnzettel.generatedAt),
      actorId: lohnzettel.generatedBy,
      targetId: `bmd:lohnzettel:${lohnzettel.id}`,
      metadata: {
        source: 'bmd',
        organizationId,
        lohnzettelId: lohnzettel.id,
        payrollRunId: lohnzettel.payrollRunId,
        employeeId: lohnzettel.employeeId,
        periodYear: lohnzettel.periodYear,
        periodMonth: lohnzettel.periodMonth,
        generatedAt: lohnzettel.generatedAt,
        generatedBy: lohnzettel.generatedBy,
        deliveryMethod: lohnzettel.deliveryMethod,
        deliveredAt: lohnzettel.deliveredAt,
        viewed: lohnzettel.viewed,
        viewedAt: lohnzettel.viewedAt,
      },
    };
  }

  /**
   * Create approval workflow event
   */
  private createApprovalWorkflowEvent(
    workflow: PayrollApprovalWorkflow,
    organizationId: string
  ): ExtractedEvent {
    return {
      type: 'payroll.approval',
      timestamp: new Date(workflow.approvedAt || workflow.rejectedAt || workflow.createdAt),
      actorId: workflow.approverUserId,
      targetId: `bmd:payroll-approval:${workflow.id}`,
      metadata: {
        source: 'bmd',
        organizationId,
        workflowId: workflow.id,
        payrollRunId: workflow.payrollRunId,
        step: workflow.step,
        approverRole: workflow.approverRole,
        approverUserId: workflow.approverUserId,
        status: workflow.status,
        approvedAt: workflow.approvedAt,
        rejectedAt: workflow.rejectedAt,
        comments: workflow.comments,
        createdAt: workflow.createdAt,
      },
    };
  }

  /**
   * Create social insurance submission event
   */
  private createSvSubmissionEvent(
    run: PayrollRun,
    organizationId: string
  ): ExtractedEvent {
    const sv = run.svSubmissionStatus!;

    return {
      type: 'payroll.sv_submission',
      timestamp: new Date(sv.submittedAt || run.modifiedAt),
      actorId: sv.submittedBy,
      targetId: `bmd:sv-submission:${run.id}`,
      metadata: {
        source: 'bmd',
        organizationId,
        payrollRunId: run.id,
        periodYear: run.periodYear,
        periodMonth: run.periodMonth,
        submitted: sv.submitted,
        submittedAt: sv.submittedAt,
        submittedBy: sv.submittedBy,
        svmeldungGenerated: sv.svmeldungGenerated,
        svmeldungSubmittedAt: sv.svmeldungSubmittedAt,
        confirmationReceived: sv.confirmationReceived,
        confirmationReceivedAt: sv.confirmationReceivedAt,
        errors: sv.errors,
      },
    };
  }

  /**
   * Get payroll run by ID
   */
  getPayrollRun(id: string): PayrollRun | undefined {
    return this.payrollCache.get(id);
  }

  /**
   * Get payroll runs by status
   */
  getPayrollRunsByStatus(status: PayrollStatus): PayrollRun[] {
    return Array.from(this.payrollCache.values()).filter(
      (run) => run.status === status
    );
  }

  /**
   * Get pending SV submissions
   */
  getPendingSvSubmissions(): PayrollRun[] {
    return Array.from(this.payrollCache.values()).filter(
      (run) => run.svSubmissionStatus?.submitted &&
               !run.svSubmissionStatus?.confirmationReceived
    );
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.payrollCache.clear();
  }
}

/**
 * Create payroll extractor
 */
export function createPayrollExtractor(client: BmdClient): BmdPayrollExtractor {
  return new BmdPayrollExtractor(client);
}
