/**
 * Salesforce Opportunity Pipeline Extractor
 * Task: T079
 *
 * Extracts opportunities with pipeline stages, probability, and forecasting data.
 * Tracks deal progression and win/loss analysis.
 */

import { ExtractedEvent } from '../../base/connector';
import { SalesforceClient, SalesforceOpportunity, SalesforceRecord } from '../salesforceClient';

export interface OpportunityStage {
  name: string;
  probability: number;
  forecastCategory: string;
  isClosed: boolean;
  isWon: boolean;
}

export interface PipelineMetrics {
  totalValue: number;
  totalCount: number;
  byStage: Record<string, { count: number; value: number }>;
  avgDealSize: number;
  avgCloseTime: number;
  winRate: number;
}

export interface OpportunityExtractionOptions {
  organizationId: string;
  modifiedSince?: Date;
  limit?: number;
  stages?: string[];
  includeProducts?: boolean;
  includeContactRoles?: boolean;
}

export interface OpportunityLineItem extends SalesforceRecord {
  OpportunityId: string;
  PricebookEntryId?: string;
  Product2Id?: string;
  Name: string;
  Quantity: number;
  UnitPrice: number;
  TotalPrice: number;
  Description?: string;
}

export interface OpportunityContactRole extends SalesforceRecord {
  OpportunityId: string;
  ContactId: string;
  Role?: string;
  IsPrimary: boolean;
}

export class SalesforceOpportunitiesExtractor {
  private client: SalesforceClient;
  private stageCache: Map<string, OpportunityStage> = new Map();

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Extract opportunities with full pipeline data
   */
  async extractOpportunities(
    options: OpportunityExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    opportunities: SalesforceOpportunity[];
    metrics: PipelineMetrics;
  }> {
    const events: ExtractedEvent[] = [];

    // Build SOQL query
    let soql = `SELECT Id, Name, AccountId, Amount, CloseDate, StageName, Probability,
                Type, LeadSource, IsClosed, IsWon, Description, OwnerId,
                ForecastCategory, ForecastCategoryName, ExpectedRevenue, NextStep,
                CampaignId, Pricebook2Id, ContractId,
                CreatedDate, LastModifiedDate, SystemModstamp
                FROM Opportunity`;

    const conditions: string[] = [];

    if (options.modifiedSince) {
      conditions.push(`LastModifiedDate >= ${options.modifiedSince.toISOString()}`);
    }

    if (options.stages?.length) {
      const stageList = options.stages.map((s) => `'${s}'`).join(',');
      conditions.push(`StageName IN (${stageList})`);
    }

    if (conditions.length > 0) {
      soql += ` WHERE ${conditions.join(' AND ')}`;
    }

    soql += ` ORDER BY LastModifiedDate DESC`;

    if (options.limit) {
      soql += ` LIMIT ${options.limit}`;
    }

    const opportunities = await this.client.queryAll<SalesforceOpportunity>(soql);

    // Calculate metrics
    const metrics = this.calculateMetrics(opportunities);

    // Generate events
    for (const opp of opportunities) {
      events.push(this.opportunityToEvent(opp, options.organizationId));

      // Extract line items if requested
      if (options.includeProducts) {
        const lineItemEvents = await this.extractLineItems(opp.Id, options.organizationId);
        events.push(...lineItemEvents);
      }

      // Extract contact roles if requested
      if (options.includeContactRoles) {
        const contactRoleEvents = await this.extractContactRoles(opp.Id, options.organizationId);
        events.push(...contactRoleEvents);
      }
    }

    return { events, opportunities, metrics };
  }

  /**
   * Extract opportunity line items (products)
   */
  async extractLineItems(
    opportunityId: string,
    organizationId: string
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      const soql = `SELECT Id, OpportunityId, PricebookEntryId, Product2Id, Name,
                    Quantity, UnitPrice, TotalPrice, Description,
                    CreatedDate, LastModifiedDate, SystemModstamp
                    FROM OpportunityLineItem
                    WHERE OpportunityId = '${opportunityId}'`;

      const lineItems = await this.client.queryAll<OpportunityLineItem>(soql);

      for (const item of lineItems) {
        events.push({
          type: 'crm.opportunity.line_item',
          timestamp: new Date(item.LastModifiedDate),
          actorId: undefined,
          targetId: item.Id,
          metadata: {
            source: 'salesforce',
            organizationId,
            opportunityId: item.OpportunityId,
            productId: item.Product2Id,
            name: item.Name,
            quantity: item.Quantity,
            unitPrice: item.UnitPrice,
            totalPrice: item.TotalPrice,
            description: item.Description,
            createdAt: item.CreatedDate,
            updatedAt: item.LastModifiedDate,
          },
        });
      }
    } catch (error) {
      console.warn(`Failed to extract line items for opportunity ${opportunityId}:`, error);
    }

    return events;
  }

  /**
   * Extract opportunity contact roles
   */
  async extractContactRoles(
    opportunityId: string,
    organizationId: string
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    try {
      const soql = `SELECT Id, OpportunityId, ContactId, Role, IsPrimary,
                    CreatedDate, LastModifiedDate, SystemModstamp
                    FROM OpportunityContactRole
                    WHERE OpportunityId = '${opportunityId}'`;

      const roles = await this.client.queryAll<OpportunityContactRole>(soql);

      for (const role of roles) {
        events.push({
          type: 'crm.opportunity.contact_role',
          timestamp: new Date(role.LastModifiedDate),
          actorId: undefined,
          targetId: role.Id,
          metadata: {
            source: 'salesforce',
            organizationId,
            opportunityId: role.OpportunityId,
            contactId: role.ContactId,
            role: role.Role,
            isPrimary: role.IsPrimary,
            createdAt: role.CreatedDate,
            updatedAt: role.LastModifiedDate,
          },
        });
      }
    } catch (error) {
      console.warn(`Failed to extract contact roles for opportunity ${opportunityId}:`, error);
    }

    return events;
  }

  /**
   * Get pipeline stages
   */
  async getPipelineStages(): Promise<OpportunityStage[]> {
    try {
      const soql = `SELECT MasterLabel, SortOrder, DefaultProbability, ForecastCategory,
                    IsClosed, IsWon FROM OpportunityStage ORDER BY SortOrder`;

      const result = await this.client.queryAll<any>(soql);

      const stages: OpportunityStage[] = result.map((s) => ({
        name: s.MasterLabel,
        probability: s.DefaultProbability || 0,
        forecastCategory: s.ForecastCategory,
        isClosed: s.IsClosed,
        isWon: s.IsWon,
      }));

      // Update cache
      for (const stage of stages) {
        this.stageCache.set(stage.name, stage);
      }

      return stages;
    } catch (error) {
      console.warn('Failed to get pipeline stages:', error);
      return [];
    }
  }

  /**
   * Get pipeline summary for a date range
   */
  async getPipelineSummary(
    startDate: Date,
    endDate: Date,
    organizationId: string
  ): Promise<{
    events: ExtractedEvent[];
    metrics: PipelineMetrics;
  }> {
    const soql = `SELECT Id, Name, Amount, StageName, Probability, IsClosed, IsWon, CloseDate,
                  CreatedDate, LastModifiedDate
                  FROM Opportunity
                  WHERE CloseDate >= ${startDate.toISOString().split('T')[0]}
                  AND CloseDate <= ${endDate.toISOString().split('T')[0]}`;

    const opportunities = await this.client.queryAll<SalesforceOpportunity>(soql);
    const metrics = this.calculateMetrics(opportunities);

    const events: ExtractedEvent[] = [{
      type: 'crm.pipeline.summary',
      timestamp: new Date(),
      actorId: undefined,
      targetId: `pipeline:${startDate.toISOString().split('T')[0]}:${endDate.toISOString().split('T')[0]}`,
      metadata: {
        source: 'salesforce',
        organizationId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalValue: metrics.totalValue,
        totalCount: metrics.totalCount,
        avgDealSize: metrics.avgDealSize,
        winRate: metrics.winRate,
        byStage: metrics.byStage,
      },
    }];

    return { events, metrics };
  }

  /**
   * Calculate pipeline metrics
   */
  private calculateMetrics(opportunities: SalesforceOpportunity[]): PipelineMetrics {
    const byStage: Record<string, { count: number; value: number }> = {};
    let totalValue = 0;
    let wonCount = 0;
    let closedCount = 0;
    let totalDays = 0;

    for (const opp of opportunities) {
      const amount = opp.Amount || 0;
      totalValue += amount;

      if (!byStage[opp.StageName]) {
        byStage[opp.StageName] = { count: 0, value: 0 };
      }
      byStage[opp.StageName].count++;
      byStage[opp.StageName].value += amount;

      if (opp.IsClosed) {
        closedCount++;
        if (opp.IsWon) {
          wonCount++;
        }
        // Calculate days to close
        const createdDate = new Date(opp.CreatedDate);
        const closeDate = new Date(opp.CloseDate);
        totalDays += Math.ceil((closeDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      totalValue,
      totalCount: opportunities.length,
      byStage,
      avgDealSize: opportunities.length > 0 ? totalValue / opportunities.length : 0,
      avgCloseTime: closedCount > 0 ? totalDays / closedCount : 0,
      winRate: closedCount > 0 ? wonCount / closedCount : 0,
    };
  }

  /**
   * Convert opportunity to event
   */
  private opportunityToEvent(
    opp: SalesforceOpportunity,
    organizationId: string
  ): ExtractedEvent {
    let eventType: string;

    if (opp.IsClosed) {
      eventType = opp.IsWon ? 'crm.opportunity.won' : 'crm.opportunity.lost';
    } else {
      const createdDate = new Date(opp.CreatedDate);
      const modifiedDate = new Date(opp.LastModifiedDate);
      const isNew = Math.abs(modifiedDate.getTime() - createdDate.getTime()) < 60000;
      eventType = isNew ? 'crm.opportunity.created' : 'crm.opportunity.updated';
    }

    return {
      type: eventType,
      timestamp: new Date(opp.LastModifiedDate),
      actorId: opp.OwnerId,
      targetId: opp.Id,
      metadata: {
        source: 'salesforce',
        organizationId,
        opportunityId: opp.Id,
        name: opp.Name,
        accountId: opp.AccountId,
        amount: opp.Amount,
        closeDate: opp.CloseDate,
        stageName: opp.StageName,
        probability: opp.Probability,
        type: opp.Type,
        leadSource: opp.LeadSource,
        isClosed: opp.IsClosed,
        isWon: opp.IsWon,
        forecastCategory: opp.ForecastCategory,
        forecastCategoryName: opp.ForecastCategoryName,
        ownerId: opp.OwnerId,
        createdAt: opp.CreatedDate,
        updatedAt: opp.LastModifiedDate,
      },
    };
  }
}

/**
 * Create opportunities extractor
 */
export function createOpportunitiesExtractor(client: SalesforceClient): SalesforceOpportunitiesExtractor {
  return new SalesforceOpportunitiesExtractor(client);
}
