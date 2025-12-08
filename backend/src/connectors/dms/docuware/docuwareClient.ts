/**
 * Docuware API Client Wrapper
 * Task: T162
 * Provides wrapper methods for Docuware REST API operations
 */

import { DocuwareAuthConfig } from './auth.js';

export interface DocuwareCabinet {
  Id: string;
  Name: string;
  Color: string;
  IsBasket: boolean;
  FileCabinetType: string;
  Default: boolean;
  Archived: boolean;
  AssignedDialogId?: string;
}

export interface DocuwareDocument {
  Id: number;
  Fields: DocuwareField[];
  ContentType: string;
  FileSize: number;
  Title?: string;
  Created: string;
  CreatedBy?: string;
  LastModified: string;
  LastModifiedBy?: string;
  Version?: number;
  Pages?: number;
}

export interface DocuwareField {
  FieldName: string;
  FieldLabel: string;
  FieldValue: any;
  ItemElementName: string;
  IsNull: boolean;
}

export interface DocuwareWorkflow {
  Id: string;
  WorkflowName: string;
  State: string;
  FileCabinetId: string;
  DocumentId: number;
  AssignedUser?: string;
  StartedAt: string;
  CompletedAt?: string;
  CurrentStep?: string;
}

export interface DocuwareTask {
  Id: string;
  WorkflowId: string;
  ActivityName: string;
  AssignedTo: string;
  DueDate?: string;
  CompletedAt?: string;
  Status: string;
}

export interface DocuwareApproval {
  Id: string;
  DocumentId: number;
  ApprovalStatus: string;
  Approvers: DocuwareApprover[];
  CreatedAt: string;
  CompletedAt?: string;
}

export interface DocuwareApprover {
  UserId: string;
  UserName: string;
  Decision?: 'approved' | 'rejected' | 'pending';
  DecisionDate?: string;
  Comments?: string;
}

export interface DocuwareVersion {
  Version: number;
  DocumentId: number;
  Created: string;
  CreatedBy: string;
  Comment?: string;
  FileSize: number;
}

export interface DocuwareSearchOptions {
  dialogId?: string;
  condition?: any[];
  operation?: 'And' | 'Or';
  sortOrder?: string;
  start?: number;
  count?: number;
}

export interface DocuwareSearchResult<T = DocuwareDocument> {
  Items: T[];
  Count: {
    Value: number;
  };
  TimeStamp?: string;
}

/**
 * Docuware API Client
 */
export class DocuwareClient {
  private baseUrl: string;
  private accessToken: string;

  constructor(config: DocuwareAuthConfig, accessToken: string) {
    this.baseUrl = config.hostUrl;
    this.accessToken = accessToken;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Docuware API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Get organization information
   */
  async getOrganization(): Promise<{
    Id: string;
    Name: string;
    AdditionalInfo: any[];
  }> {
    return this.request('/DocuWare/Platform/Organizations/1');
  }

  /**
   * Get all file cabinets
   */
  async getCabinets(): Promise<DocuwareCabinet[]> {
    const result = await this.request<{ FileCabinet: DocuwareCabinet[] }>(
      '/DocuWare/Platform/FileCabinets'
    );
    return result.FileCabinet || [];
  }

  /**
   * Get cabinet by ID
   */
  async getCabinet(cabinetId: string): Promise<DocuwareCabinet> {
    return this.request(`/DocuWare/Platform/FileCabinets/${cabinetId}`);
  }

  /**
   * Get documents from cabinet
   */
  async getDocuments(
    cabinetId: string,
    options?: DocuwareSearchOptions
  ): Promise<DocuwareSearchResult> {
    const dialogId = options?.dialogId || 'default';
    const endpoint = `/DocuWare/Platform/FileCabinets/${cabinetId}/Query/DialogExpression`;

    const searchParams = {
      Condition: options?.condition || [],
      Operation: options?.operation || 'And',
      SortOrder: options?.sortOrder,
      Start: options?.start || 0,
      Count: options?.count || 100,
    };

    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(searchParams),
    });
  }

  /**
   * Get document by ID
   */
  async getDocument(cabinetId: string, documentId: number): Promise<DocuwareDocument> {
    return this.request(
      `/DocuWare/Platform/FileCabinets/${cabinetId}/Documents/${documentId}`
    );
  }

  /**
   * Get document fields (index data)
   */
  async getDocumentFields(cabinetId: string, documentId: number): Promise<DocuwareField[]> {
    const doc = await this.getDocument(cabinetId, documentId);
    return doc.Fields;
  }

  /**
   * Search documents with conditions
   */
  async searchDocuments(
    cabinetId: string,
    conditions: any[],
    options?: {
      operation?: 'And' | 'Or';
      start?: number;
      count?: number;
    }
  ): Promise<DocuwareSearchResult> {
    return this.getDocuments(cabinetId, {
      condition: conditions,
      operation: options?.operation,
      start: options?.start,
      count: options?.count,
    });
  }

  /**
   * Get documents modified since date
   */
  async getDocumentsModifiedSince(
    cabinetId: string,
    modifiedSince: Date
  ): Promise<DocuwareDocument[]> {
    const condition = [
      {
        DBName: 'DWSTOREDATETIME',
        Value: [modifiedSince.toISOString()],
        Operation: 'GreaterThan',
      },
    ];

    const result = await this.searchDocuments(cabinetId, condition);
    return result.Items || [];
  }

  /**
   * Get active workflows
   */
  async getWorkflows(cabinetId?: string): Promise<DocuwareWorkflow[]> {
    const endpoint = cabinetId
      ? `/DocuWare/Platform/FileCabinets/${cabinetId}/Workflows`
      : '/DocuWare/Platform/Workflows';

    try {
      const result = await this.request<{ Workflow: DocuwareWorkflow[] }>(endpoint);
      return result.Workflow || [];
    } catch {
      // Workflows may not be available in all installations
      return [];
    }
  }

  /**
   * Get workflow instance
   */
  async getWorkflowInstance(workflowId: string): Promise<DocuwareWorkflow> {
    return this.request(`/DocuWare/Platform/Workflows/${workflowId}`);
  }

  /**
   * Get workflow tasks
   */
  async getWorkflowTasks(workflowId: string): Promise<DocuwareTask[]> {
    try {
      const result = await this.request<{ Task: DocuwareTask[] }>(
        `/DocuWare/Platform/Workflows/${workflowId}/Tasks`
      );
      return result.Task || [];
    } catch {
      return [];
    }
  }

  /**
   * Get document workflow state
   */
  async getDocumentWorkflows(
    cabinetId: string,
    documentId: number
  ): Promise<DocuwareWorkflow[]> {
    try {
      const result = await this.request<{ Workflow: DocuwareWorkflow[] }>(
        `/DocuWare/Platform/FileCabinets/${cabinetId}/Documents/${documentId}/Workflows`
      );
      return result.Workflow || [];
    } catch {
      return [];
    }
  }

  /**
   * Get document versions (version history)
   */
  async getDocumentVersions(
    cabinetId: string,
    documentId: number
  ): Promise<DocuwareVersion[]> {
    try {
      const result = await this.request<{ Version: DocuwareVersion[] }>(
        `/DocuWare/Platform/FileCabinets/${cabinetId}/Documents/${documentId}/Versions`
      );
      return result.Version || [];
    } catch {
      return [];
    }
  }

  /**
   * Get specific document version
   */
  async getDocumentVersion(
    cabinetId: string,
    documentId: number,
    versionNumber: number
  ): Promise<DocuwareVersion> {
    return this.request(
      `/DocuWare/Platform/FileCabinets/${cabinetId}/Documents/${documentId}/Versions/${versionNumber}`
    );
  }

  /**
   * Get document approval status (custom implementation)
   * Note: Docuware doesn't have a standard approval API, this uses workflow states
   */
  async getDocumentApprovals(
    cabinetId: string,
    documentId: number
  ): Promise<DocuwareApproval[]> {
    try {
      const workflows = await this.getDocumentWorkflows(cabinetId, documentId);

      // Convert workflow data to approval format
      return workflows
        .filter(wf => wf.WorkflowName?.toLowerCase().includes('approval'))
        .map(wf => ({
          Id: wf.Id,
          DocumentId: documentId,
          ApprovalStatus: wf.State || 'pending',
          Approvers: [], // Would need to be extracted from workflow tasks
          CreatedAt: wf.StartedAt,
          CompletedAt: wf.CompletedAt,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Get approval chain for document
   */
  async getApprovalChain(
    cabinetId: string,
    documentId: number
  ): Promise<DocuwareApprover[]> {
    try {
      const workflows = await this.getDocumentWorkflows(cabinetId, documentId);
      const approvers: DocuwareApprover[] = [];

      for (const workflow of workflows) {
        const tasks = await this.getWorkflowTasks(workflow.Id);

        for (const task of tasks) {
          approvers.push({
            UserId: task.AssignedTo,
            UserName: task.AssignedTo,
            Decision: this.mapTaskStatusToDecision(task.Status),
            DecisionDate: task.CompletedAt,
            Comments: task.ActivityName,
          });
        }
      }

      return approvers;
    } catch {
      return [];
    }
  }

  /**
   * Test connection to Docuware
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/DocuWare/Platform/Home');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get dialogs for a cabinet
   */
  async getDialogs(cabinetId: string): Promise<any[]> {
    try {
      const result = await this.request<{ Dialog: any[] }>(
        `/DocuWare/Platform/FileCabinets/${cabinetId}/Dialogs`
      );
      return result.Dialog || [];
    } catch {
      return [];
    }
  }

  /**
   * Map task status to approval decision
   */
  private mapTaskStatusToDecision(
    status: string
  ): 'approved' | 'rejected' | 'pending' {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('approved') || statusLower.includes('complete')) {
      return 'approved';
    }
    if (statusLower.includes('rejected') || statusLower.includes('decline')) {
      return 'rejected';
    }
    return 'pending';
  }
}

/**
 * Create Docuware client instance
 */
export function createDocuwareClient(
  config: DocuwareAuthConfig,
  accessToken: string
): DocuwareClient {
  return new DocuwareClient(config, accessToken);
}
