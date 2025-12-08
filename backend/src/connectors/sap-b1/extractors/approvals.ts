/**
 * SAP B1 Approval Workflow Extractor
 * Task: T064
 *
 * Extracts approval workflows, pending approvals, and approval history.
 * Tracks document approval chains and authorization levels.
 */

import { ExtractedEvent } from '../../base/connector';
import { SapB1Client } from '../sapClient';

export interface ApprovalTemplate {
  code: number;
  name: string;
  objectType: string;
  isActive: boolean;
  stages: ApprovalStage[];
}

export interface ApprovalStage {
  stageCode: number;
  stageName: string;
  requiredApprovers: number;
  approvers: Approver[];
}

export interface Approver {
  userId: number;
  userName: string;
  approvalLevel: number;
}

export interface ApprovalRequest {
  wddCode: number;
  docEntry: number;
  objectType: string;
  status: 'W' | 'Y' | 'N' | 'P'; // Waiting, Yes, No, Pending
  currentStage?: number;
  remarks?: string;
  originatorId: number;
  originatorName?: string;
  createDate: string;
  updateDate: string;
}

export interface ApprovalDecision {
  wddCode: number;
  docEntry: number;
  stageCode: number;
  userId: number;
  userName?: string;
  status: 'Y' | 'N' | 'P'; // Approved, Rejected, Pending
  remarks?: string;
  decisionDate?: string;
}

export interface ApprovalExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  status?: 'pending' | 'approved' | 'rejected' | 'all';
  objectTypes?: string[];
  limit?: number;
}

export class SapApprovalsExtractor {
  private client: SapB1Client;

  constructor(client: SapB1Client) {
    this.client = client;
  }

  /**
   * Extract approval templates
   */
  async extractApprovalTemplates(
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    templates: ApprovalTemplate[];
  }> {
    const events: ExtractedEvent[] = [];
    const templates: ApprovalTemplate[] = [];

    try {
      const response = await this.client.query<any>('ApprovalTemplates', {
        $expand: 'ApprovalTemplateStages,ApprovalTemplateUsers',
      });

      for (const tmpl of response.value) {
        const template: ApprovalTemplate = {
          code: tmpl.Code,
          name: tmpl.Name,
          objectType: tmpl.ObjectType,
          isActive: tmpl.IsActive === 'tYES',
          stages: (tmpl.ApprovalTemplateStages || []).map((stage: any) => ({
            stageCode: stage.SortID,
            stageName: stage.ApprovalStageName || `Stage ${stage.SortID}`,
            requiredApprovers: stage.RequiredApprovers || 1,
            approvers: (tmpl.ApprovalTemplateUsers || [])
              .filter((u: any) => u.StageCode === stage.SortID)
              .map((u: any) => ({
                userId: u.UserID,
                userName: u.UserName,
                approvalLevel: u.ApprovalLevel,
              })),
          })),
        };

        templates.push(template);

        events.push({
          type: 'erp.approval_template',
          timestamp: new Date(),
          actorId: undefined,
          targetId: String(template.code),
          metadata: {
            source: 'sap_b1',
            organizationId: options.organizationId,
            templateCode: template.code,
            templateName: template.name,
            objectType: template.objectType,
            isActive: template.isActive,
            stageCount: template.stages.length,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to extract approval templates:', error);
    }

    return { events, templates };
  }

  /**
   * Extract pending approvals
   */
  async extractPendingApprovals(
    options: ApprovalExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    requests: ApprovalRequest[];
  }> {
    const events: ExtractedEvent[] = [];
    const requests: ApprovalRequest[] = [];

    try {
      const filters: string[] = [];

      // Filter by status
      if (options.status === 'pending') {
        filters.push("Status eq 'W'");
      } else if (options.status === 'approved') {
        filters.push("Status eq 'Y'");
      } else if (options.status === 'rejected') {
        filters.push("Status eq 'N'");
      }

      // Filter by object types
      if (options.objectTypes?.length) {
        const typeFilter = options.objectTypes
          .map((t) => `ObjectType eq '${t}'`)
          .join(' or ');
        filters.push(`(${typeFilter})`);
      }

      // Filter by date
      if (options.modifiedAfter) {
        filters.push(`UpdateDate ge '${options.modifiedAfter.toISOString().split('T')[0]}'`);
      }

      const response = await this.client.query<any>('ApprovalRequests', {
        $filter: filters.length > 0 ? filters.join(' and ') : undefined,
        $orderby: 'UpdateDate desc',
        $top: options.limit || 100,
      });

      for (const req of response.value) {
        const request: ApprovalRequest = {
          wddCode: req.WddCode,
          docEntry: req.DocEntry,
          objectType: req.ObjectType,
          status: req.Status,
          currentStage: req.CurrentStage,
          remarks: req.Remarks,
          originatorId: req.OriginatorID,
          originatorName: req.OriginatorName,
          createDate: req.CreateDate,
          updateDate: req.UpdateDate,
        };

        requests.push(request);

        // Create event
        let eventType: string;
        switch (request.status) {
          case 'W':
            eventType = 'erp.approval.pending';
            break;
          case 'Y':
            eventType = 'erp.approval.approved';
            break;
          case 'N':
            eventType = 'erp.approval.rejected';
            break;
          default:
            eventType = 'erp.approval.updated';
        }

        events.push({
          type: eventType,
          timestamp: new Date(request.updateDate),
          actorId: request.originatorName,
          targetId: String(request.wddCode),
          metadata: {
            source: 'sap_b1',
            organizationId: options.organizationId,
            wddCode: request.wddCode,
            docEntry: request.docEntry,
            objectType: request.objectType,
            status: request.status,
            currentStage: request.currentStage,
            remarks: request.remarks,
            originatorId: request.originatorId,
            originatorName: request.originatorName,
            createdAt: request.createDate,
            updatedAt: request.updateDate,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to extract pending approvals:', error);
    }

    return { events, requests };
  }

  /**
   * Extract approval decisions/history
   */
  async extractApprovalDecisions(
    options: ApprovalExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    decisions: ApprovalDecision[];
  }> {
    const events: ExtractedEvent[] = [];
    const decisions: ApprovalDecision[] = [];

    try {
      const filters: string[] = [];

      if (options.modifiedAfter) {
        filters.push(`UpdateDate ge '${options.modifiedAfter.toISOString().split('T')[0]}'`);
      }

      const response = await this.client.query<any>('ApprovalStagesHistory', {
        $filter: filters.length > 0 ? filters.join(' and ') : undefined,
        $orderby: 'UpdateDate desc',
        $top: options.limit || 500,
      });

      for (const hist of response.value) {
        const decision: ApprovalDecision = {
          wddCode: hist.WddCode,
          docEntry: hist.DocEntry,
          stageCode: hist.StageCode,
          userId: hist.UserID,
          userName: hist.UserName,
          status: hist.Status,
          remarks: hist.Remarks,
          decisionDate: hist.ApprovalDate,
        };

        decisions.push(decision);

        // Create event
        let eventType: string;
        switch (decision.status) {
          case 'Y':
            eventType = 'erp.approval.decision.approved';
            break;
          case 'N':
            eventType = 'erp.approval.decision.rejected';
            break;
          default:
            eventType = 'erp.approval.decision.pending';
        }

        events.push({
          type: eventType,
          timestamp: decision.decisionDate ? new Date(decision.decisionDate) : new Date(),
          actorId: decision.userName,
          targetId: `${decision.wddCode}:${decision.stageCode}:${decision.userId}`,
          metadata: {
            source: 'sap_b1',
            organizationId: options.organizationId,
            wddCode: decision.wddCode,
            docEntry: decision.docEntry,
            stageCode: decision.stageCode,
            userId: decision.userId,
            userName: decision.userName,
            status: decision.status,
            remarks: decision.remarks,
            decisionDate: decision.decisionDate,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to extract approval decisions:', error);
    }

    return { events, decisions };
  }

  /**
   * Get approval summary for a document
   */
  async getDocumentApprovalSummary(
    docEntry: number,
    objectType: string
  ): Promise<{
    status: string;
    currentStage?: number;
    totalStages?: number;
    approvers: Array<{
      stage: number;
      userId: number;
      userName?: string;
      status: string;
      decisionDate?: string;
    }>;
  } | null> {
    try {
      const requests = await this.client.query<any>('ApprovalRequests', {
        $filter: `DocEntry eq ${docEntry} and ObjectType eq '${objectType}'`,
        $top: 1,
      });

      if (!requests.value.length) {
        return null;
      }

      const request = requests.value[0];

      // Get approval history
      const history = await this.client.query<any>('ApprovalStagesHistory', {
        $filter: `WddCode eq ${request.WddCode}`,
        $orderby: 'StageCode asc',
      });

      return {
        status: request.Status,
        currentStage: request.CurrentStage,
        totalStages: request.NumberOfPendingApprovers,
        approvers: (history.value || []).map((h: any) => ({
          stage: h.StageCode,
          userId: h.UserID,
          userName: h.UserName,
          status: h.Status,
          decisionDate: h.ApprovalDate,
        })),
      };
    } catch {
      return null;
    }
  }
}

/**
 * Create approvals extractor
 */
export function createSapApprovalsExtractor(
  client: SapB1Client
): SapApprovalsExtractor {
  return new SapApprovalsExtractor(client);
}
