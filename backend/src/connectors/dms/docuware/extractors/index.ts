/**
 * Docuware Extractors Index
 * Aggregates all extractor functions and provides unified extraction interface
 */

import { DocuwareClient } from '../docuwareClient.js';

// Re-export all extractors
export * from './cabinets.js';
export * from './documents.js';
export * from './workflows.js';
export * from './approvals.js';
export * from './versions.js';

// Import specific functions for aggregation
import { extractCabinets, CabinetExtractionOptions, CabinetExtractionResult } from './cabinets.js';
import { extractDocuments, DocumentExtractionOptions, DocumentExtractionResult } from './documents.js';
import { extractWorkflows, WorkflowExtractionOptions, WorkflowExtractionResult } from './workflows.js';
import { extractApprovals, ApprovalExtractionOptions, ApprovalExtractionResult } from './approvals.js';
import { extractVersions, VersionExtractionOptions, VersionExtractionResult } from './versions.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface DocuwareExtractionOptions {
  organizationId: string;
  cabinetIds?: string[];
  modifiedSince?: Date;
  extractCabinets?: boolean;
  extractDocuments?: boolean;
  extractWorkflows?: boolean;
  extractApprovals?: boolean;
  extractVersions?: boolean;
  maxDocuments?: number;
}

export interface DocuwareExtractionResult {
  events: ExtractedEvent[];
  stats: {
    totalEvents: number;
    cabinets?: CabinetExtractionResult['stats'];
    documents?: DocumentExtractionResult['stats'];
    workflows?: WorkflowExtractionResult['stats'];
    approvals?: ApprovalExtractionResult['stats'];
    versions?: VersionExtractionResult['stats'];
  };
}

/**
 * Extract all Docuware data
 * Performs comprehensive extraction across all enabled data types
 */
export async function extractAllDocuwareData(
  client: DocuwareClient,
  options: DocuwareExtractionOptions
): Promise<DocuwareExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats: DocuwareExtractionResult['stats'] = {
    totalEvents: 0,
  };

  // Default to extracting everything if not specified
  const extractCabinetsFlag = options.extractCabinets ?? true;
  const extractDocumentsFlag = options.extractDocuments ?? true;
  const extractWorkflowsFlag = options.extractWorkflows ?? true;
  const extractApprovalsFlag = options.extractApprovals ?? true;
  const extractVersionsFlag = options.extractVersions ?? true;

  try {
    // Step 1: Extract cabinets
    if (extractCabinetsFlag) {
      const cabinetOptions: CabinetExtractionOptions = {
        organizationId: options.organizationId,
        includeArchived: false,
        includeBaskets: false,
      };

      const cabinetResult = await extractCabinets(client, cabinetOptions);
      events.push(...cabinetResult.events);
      stats.cabinets = cabinetResult.stats;
    }

    // Step 2: Extract documents from specified cabinets
    if (extractDocumentsFlag) {
      const documentOptions: DocumentExtractionOptions = {
        organizationId: options.organizationId,
        cabinetIds: options.cabinetIds,
        modifiedSince: options.modifiedSince,
        includeFields: true,
        maxDocuments: options.maxDocuments,
      };

      const documentResult = await extractDocuments(client, documentOptions);
      events.push(...documentResult.events);
      stats.documents = documentResult.stats;
    }

    // Step 3: Extract workflows
    if (extractWorkflowsFlag) {
      const workflowOptions: WorkflowExtractionOptions = {
        organizationId: options.organizationId,
        includeCompleted: true,
        includeTasks: true,
      };

      const workflowResult = await extractWorkflows(client, workflowOptions);
      events.push(...workflowResult.events);
      stats.workflows = workflowResult.stats;
    }

    // Step 4: Extract approvals (if cabinets specified)
    if (extractApprovalsFlag && options.cabinetIds && options.cabinetIds.length > 0) {
      for (const cabinetId of options.cabinetIds) {
        const approvalOptions: ApprovalExtractionOptions = {
          organizationId: options.organizationId,
          cabinetId,
          includeDecisions: true,
        };

        const approvalResult = await extractApprovals(client, approvalOptions);
        events.push(...approvalResult.events);

        // Merge approval stats
        if (!stats.approvals) {
          stats.approvals = approvalResult.stats;
        } else {
          stats.approvals.totalApprovals += approvalResult.stats.totalApprovals;
          stats.approvals.pending += approvalResult.stats.pending;
          stats.approvals.approved += approvalResult.stats.approved;
          stats.approvals.rejected += approvalResult.stats.rejected;
          stats.approvals.totalDecisions += approvalResult.stats.totalDecisions;
        }
      }
    }

    // Step 5: Extract versions (if cabinets specified)
    if (extractVersionsFlag && options.cabinetIds && options.cabinetIds.length > 0) {
      for (const cabinetId of options.cabinetIds) {
        const versionOptions: VersionExtractionOptions = {
          organizationId: options.organizationId,
          cabinetId,
          includeComparison: true,
        };

        const versionResult = await extractVersions(client, versionOptions);
        events.push(...versionResult.events);

        // Merge version stats
        if (!stats.versions) {
          stats.versions = versionResult.stats;
        } else {
          stats.versions.totalVersions += versionResult.stats.totalVersions;
          stats.versions.documentsWithVersions += versionResult.stats.documentsWithVersions;
          stats.versions.totalSizeChange += versionResult.stats.totalSizeChange;
          stats.versions.versionsWithComments += versionResult.stats.versionsWithComments;
        }
      }
    }

    stats.totalEvents = events.length;

  } catch (error) {
    console.error('Error during Docuware extraction:', error);
    throw new Error(`Failed to extract Docuware data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return { events, stats };
}

/**
 * Extract specific data type
 */
export async function extractDocuwareDataType(
  client: DocuwareClient,
  dataType: 'cabinets' | 'documents' | 'workflows' | 'approvals' | 'versions',
  options: DocuwareExtractionOptions
): Promise<ExtractedEvent[]> {
  switch (dataType) {
    case 'cabinets': {
      const result = await extractCabinets(client, {
        organizationId: options.organizationId,
        includeArchived: false,
        includeBaskets: false,
      });
      return result.events;
    }

    case 'documents': {
      const result = await extractDocuments(client, {
        organizationId: options.organizationId,
        cabinetIds: options.cabinetIds,
        modifiedSince: options.modifiedSince,
        includeFields: true,
        maxDocuments: options.maxDocuments,
      });
      return result.events;
    }

    case 'workflows': {
      const result = await extractWorkflows(client, {
        organizationId: options.organizationId,
        includeCompleted: true,
        includeTasks: true,
      });
      return result.events;
    }

    case 'approvals': {
      if (!options.cabinetIds || options.cabinetIds.length === 0) {
        throw new Error('cabinetIds required for approval extraction');
      }

      const events: ExtractedEvent[] = [];
      for (const cabinetId of options.cabinetIds) {
        const result = await extractApprovals(client, {
          organizationId: options.organizationId,
          cabinetId,
          includeDecisions: true,
        });
        events.push(...result.events);
      }
      return events;
    }

    case 'versions': {
      if (!options.cabinetIds || options.cabinetIds.length === 0) {
        throw new Error('cabinetIds required for version extraction');
      }

      const events: ExtractedEvent[] = [];
      for (const cabinetId of options.cabinetIds) {
        const result = await extractVersions(client, {
          organizationId: options.organizationId,
          cabinetId,
          includeComparison: true,
        });
        events.push(...result.events);
      }
      return events;
    }

    default:
      throw new Error(`Unknown data type: ${dataType}`);
  }
}
