/**
 * Salesforce Field History Tracker
 * Task: T083
 *
 * Tracks field changes on records using Salesforce history tracking.
 * Supports Account, Contact, Lead, Opportunity, and Case history.
 */

import { ExtractedEvent } from '../base/connector';
import { SalesforceClient, SalesforceRecord } from './salesforceClient';

export interface FieldHistoryRecord extends SalesforceRecord {
  ParentId: string;
  Field: string;
  OldValue?: unknown;
  NewValue?: unknown;
  DataType?: string;
}

export interface FieldChange {
  recordId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: Date;
  changedBy?: string;
}

export interface HistoryExtractionOptions {
  organizationId: string;
  modifiedSince?: Date;
  limit?: number;
  recordIds?: string[];
  fields?: string[];
}

// Objects that support history tracking
const HISTORY_OBJECTS: Record<string, string> = {
  Account: 'AccountHistory',
  Contact: 'ContactHistory',
  Lead: 'LeadHistory',
  Opportunity: 'OpportunityHistory',
  Case: 'CaseHistory',
  Contract: 'ContractHistory',
  Solution: 'SolutionHistory',
  Asset: 'AssetHistory',
};

export class SalesforceFieldHistoryTracker {
  private client: SalesforceClient;

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Extract field history for a standard object
   */
  async extractFieldHistory(
    objectType: keyof typeof HISTORY_OBJECTS,
    options: HistoryExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    changes: FieldChange[];
  }> {
    const events: ExtractedEvent[] = [];
    const changes: FieldChange[] = [];

    const historyObjectName = HISTORY_OBJECTS[objectType];
    if (!historyObjectName) {
      console.warn(`No history object found for ${objectType}`);
      return { events, changes };
    }

    try {
      let soql = `SELECT Id, ParentId, Field, OldValue, NewValue, DataType,
                  CreatedDate, CreatedById
                  FROM ${historyObjectName}`;

      const conditions: string[] = [];

      if (options.modifiedSince) {
        conditions.push(`CreatedDate >= ${options.modifiedSince.toISOString()}`);
      }

      if (options.recordIds?.length) {
        const idList = options.recordIds.map((id) => `'${id}'`).join(',');
        conditions.push(`ParentId IN (${idList})`);
      }

      if (options.fields?.length) {
        const fieldList = options.fields.map((f) => `'${f}'`).join(',');
        conditions.push(`Field IN (${fieldList})`);
      }

      if (conditions.length > 0) {
        soql += ` WHERE ${conditions.join(' AND ')}`;
      }

      soql += ` ORDER BY CreatedDate DESC`;

      if (options.limit) {
        soql += ` LIMIT ${options.limit}`;
      }

      const historyRecords = await this.client.queryAll<FieldHistoryRecord & { CreatedById?: string }>(soql);

      for (const record of historyRecords) {
        const change: FieldChange = {
          recordId: record.ParentId,
          field: record.Field,
          oldValue: record.OldValue,
          newValue: record.NewValue,
          changedAt: new Date(record.CreatedDate),
          changedBy: record.CreatedById,
        };

        changes.push(change);

        events.push({
          type: `crm.${objectType.toLowerCase()}.field_changed`,
          timestamp: new Date(record.CreatedDate),
          actorId: record.CreatedById,
          targetId: record.Id,
          metadata: {
            source: 'salesforce',
            organizationId: options.organizationId,
            objectType,
            recordId: record.ParentId,
            field: record.Field,
            oldValue: record.OldValue,
            newValue: record.NewValue,
            dataType: record.DataType,
            historyId: record.Id,
          },
        });
      }
    } catch (error) {
      console.warn(`Failed to extract history for ${objectType}:`, error);
    }

    return { events, changes };
  }

  /**
   * Get stage history for an opportunity
   */
  async getOpportunityStageHistory(
    opportunityId: string,
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    stageChanges: Array<{
      fromStage: string;
      toStage: string;
      changedAt: Date;
      changedBy?: string;
      daysInStage: number;
    }>;
  }> {
    const events: ExtractedEvent[] = [];
    const stageChanges: Array<{
      fromStage: string;
      toStage: string;
      changedAt: Date;
      changedBy?: string;
      daysInStage: number;
    }> = [];

    try {
      const soql = `SELECT Id, StageName, Amount, Probability, ExpectedRevenue,
                    CloseDate, ForecastCategory, CreatedDate, CreatedById
                    FROM OpportunityHistory
                    WHERE OpportunityId = '${opportunityId}'
                    ORDER BY CreatedDate ASC`;

      const history = await this.client.queryAll<any>(soql);

      let previousStage: string | null = null;
      let previousDate: Date | null = null;

      for (const record of history) {
        const currentStage = record.StageName;
        const currentDate = new Date(record.CreatedDate);

        if (previousStage && previousStage !== currentStage) {
          const daysInStage = previousDate
            ? Math.ceil((currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          stageChanges.push({
            fromStage: previousStage,
            toStage: currentStage,
            changedAt: currentDate,
            changedBy: record.CreatedById,
            daysInStage,
          });

          events.push({
            type: 'crm.opportunity.stage_changed',
            timestamp: currentDate,
            actorId: record.CreatedById,
            targetId: opportunityId,
            metadata: {
              source: 'salesforce',
              organizationId: options.organizationId,
              opportunityId,
              fromStage: previousStage,
              toStage: currentStage,
              amount: record.Amount,
              probability: record.Probability,
              expectedRevenue: record.ExpectedRevenue,
              closeDate: record.CloseDate,
              forecastCategory: record.ForecastCategory,
              daysInStage,
            },
          });
        }

        previousStage = currentStage;
        previousDate = currentDate;
      }
    } catch (error) {
      console.warn(`Failed to get stage history for opportunity ${opportunityId}:`, error);
    }

    return { events, stageChanges };
  }

  /**
   * Get case status history
   */
  async getCaseStatusHistory(
    caseId: string,
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    statusChanges: Array<{
      fromStatus: string;
      toStatus: string;
      changedAt: Date;
      changedBy?: string;
    }>;
  }> {
    const events: ExtractedEvent[] = [];
    const statusChanges: Array<{
      fromStatus: string;
      toStatus: string;
      changedAt: Date;
      changedBy?: string;
    }> = [];

    try {
      const soql = `SELECT Id, Field, OldValue, NewValue, CreatedDate, CreatedById
                    FROM CaseHistory
                    WHERE CaseId = '${caseId}' AND Field = 'Status'
                    ORDER BY CreatedDate ASC`;

      const history = await this.client.queryAll<FieldHistoryRecord & { CreatedById?: string }>(soql);

      for (const record of history) {
        statusChanges.push({
          fromStatus: String(record.OldValue || ''),
          toStatus: String(record.NewValue || ''),
          changedAt: new Date(record.CreatedDate),
          changedBy: record.CreatedById,
        });

        events.push({
          type: 'crm.case.status_changed',
          timestamp: new Date(record.CreatedDate),
          actorId: record.CreatedById,
          targetId: caseId,
          metadata: {
            source: 'salesforce',
            organizationId: options.organizationId,
            caseId,
            fromStatus: record.OldValue,
            toStatus: record.NewValue,
          },
        });
      }
    } catch (error) {
      console.warn(`Failed to get status history for case ${caseId}:`, error);
    }

    return { events, statusChanges };
  }

  /**
   * Get lead conversion history
   */
  async getLeadConversionHistory(
    options: HistoryExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    conversions: Array<{
      leadId: string;
      accountId?: string;
      contactId?: string;
      opportunityId?: string;
      convertedAt: Date;
      convertedBy?: string;
    }>;
  }> {
    const events: ExtractedEvent[] = [];
    const conversions: Array<{
      leadId: string;
      accountId?: string;
      contactId?: string;
      opportunityId?: string;
      convertedAt: Date;
      convertedBy?: string;
    }> = [];

    try {
      let soql = `SELECT Id, ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId,
                  ConvertedDate, OwnerId, LastModifiedDate
                  FROM Lead
                  WHERE IsConverted = true`;

      if (options.modifiedSince) {
        soql += ` AND ConvertedDate >= ${options.modifiedSince.toISOString()}`;
      }

      if (options.recordIds?.length) {
        const idList = options.recordIds.map((id) => `'${id}'`).join(',');
        soql += ` AND Id IN (${idList})`;
      }

      soql += ` ORDER BY ConvertedDate DESC`;

      if (options.limit) {
        soql += ` LIMIT ${options.limit}`;
      }

      const leads = await this.client.queryAll<any>(soql);

      for (const lead of leads) {
        conversions.push({
          leadId: lead.Id,
          accountId: lead.ConvertedAccountId,
          contactId: lead.ConvertedContactId,
          opportunityId: lead.ConvertedOpportunityId,
          convertedAt: new Date(lead.ConvertedDate),
          convertedBy: lead.OwnerId,
        });

        events.push({
          type: 'crm.lead.converted',
          timestamp: new Date(lead.ConvertedDate),
          actorId: lead.OwnerId,
          targetId: lead.Id,
          metadata: {
            source: 'salesforce',
            organizationId: options.organizationId,
            leadId: lead.Id,
            accountId: lead.ConvertedAccountId,
            contactId: lead.ConvertedContactId,
            opportunityId: lead.ConvertedOpportunityId,
            convertedDate: lead.ConvertedDate,
          },
        });
      }
    } catch (error) {
      console.warn('Failed to get lead conversion history:', error);
    }

    return { events, conversions };
  }

  /**
   * Get all field changes for a record
   */
  async getRecordHistory(
    objectType: keyof typeof HISTORY_OBJECTS,
    recordId: string,
    options: { organizationId: string; limit?: number }
  ): Promise<{
    events: ExtractedEvent[];
    changes: FieldChange[];
  }> {
    return this.extractFieldHistory(objectType, {
      organizationId: options.organizationId,
      recordIds: [recordId],
      limit: options.limit,
    });
  }

  /**
   * Check if history tracking is enabled for a field
   */
  async isHistoryEnabled(objectType: string): Promise<boolean> {
    const historyObjectName = HISTORY_OBJECTS[objectType];
    if (!historyObjectName) {
      return false;
    }

    try {
      // Try to query the history object
      await this.client.queryAll<any>(`SELECT Id FROM ${historyObjectName} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create field history tracker
 */
export function createFieldHistoryTracker(client: SalesforceClient): SalesforceFieldHistoryTracker {
  return new SalesforceFieldHistoryTracker(client);
}
