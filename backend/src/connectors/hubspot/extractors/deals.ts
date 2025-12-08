/**
 * HubSpot Deal Pipeline Extractor
 * Task: T097
 *
 * Extracts deals with pipeline stages, amounts, and forecasting data.
 * Tracks deal progression and win/loss analysis.
 */

import { ExtractedEvent } from '../../base/connector';
import { HubSpotClient, HubSpotDeal, HubSpotPaginatedResult } from '../hubspotClient';

export interface DealPipeline {
  id: string;
  label: string;
  displayOrder: number;
  stages: DealStage[];
}

export interface DealStage {
  id: string;
  label: string;
  displayOrder: number;
  metadata: {
    isClosed: boolean;
    probability: number;
  };
}

export interface PipelineMetrics {
  totalValue: number;
  totalCount: number;
  byStage: Record<string, { count: number; value: number }>;
  byPipeline: Record<string, { count: number; value: number }>;
  avgDealSize: number;
  winRate: number;
}

export interface DealExtractionOptions {
  organizationId: string;
  modifiedAfter?: Date;
  limit?: number;
  pipelines?: string[];
  stages?: string[];
  includeAssociations?: boolean;
}

export class HubSpotDealsExtractor {
  private client: HubSpotClient;
  private pipelineCache: Map<string, DealPipeline> = new Map();
  private stageCache: Map<string, DealStage> = new Map();

  constructor(client: HubSpotClient) {
    this.client = client;
  }

  /**
   * Extract deals with full pipeline data
   */
  async extractDeals(
    options: DealExtractionOptions
  ): Promise<{
    events: ExtractedEvent[];
    deals: HubSpotDeal[];
    metrics: PipelineMetrics;
  }> {
    const events: ExtractedEvent[] = [];
    const deals: HubSpotDeal[] = [];

    // Load pipeline data
    await this.loadPipelines();

    // Fetch deals
    const properties = [
      'dealname', 'amount', 'closedate', 'dealstage', 'pipeline',
      'hubspot_owner_id', 'description', 'dealtype', 'hs_priority',
      'hs_deal_stage_probability', 'hs_forecast_amount', 'hs_forecast_probability',
      'hs_is_closed', 'hs_is_closed_won', 'createdate', 'hs_lastmodifieddate',
    ];

    let after: string | undefined;
    let processedCount = 0;
    const maxRecords = options.limit || 10000;

    do {
      const result = await this.client.getDeals({
        after,
        limit: Math.min(100, maxRecords - processedCount),
        properties,
      });

      for (const deal of result.results) {
        // Filter by pipeline if specified
        if (options.pipelines?.length && !options.pipelines.includes(deal.properties.pipeline || '')) {
          continue;
        }

        // Filter by stage if specified
        if (options.stages?.length && !options.stages.includes(deal.properties.dealstage || '')) {
          continue;
        }

        // Filter by modified date
        if (options.modifiedAfter) {
          const modifiedDate = new Date(deal.updatedAt);
          if (modifiedDate < options.modifiedAfter) {
            continue;
          }
        }

        deals.push(deal);
        events.push(this.dealToEvent(deal, options.organizationId));
        processedCount++;

        if (processedCount >= maxRecords) break;
      }

      after = result.paging?.next?.after;
    } while (after && processedCount < maxRecords);

    // Calculate metrics
    const metrics = this.calculateMetrics(deals);

    return { events, deals, metrics };
  }

  /**
   * Get all deal pipelines
   */
  async getPipelines(): Promise<DealPipeline[]> {
    if (this.pipelineCache.size > 0) {
      return Array.from(this.pipelineCache.values());
    }

    await this.loadPipelines();
    return Array.from(this.pipelineCache.values());
  }

  /**
   * Load pipelines into cache
   */
  private async loadPipelines(): Promise<void> {
    try {
      const response = await (this.client as any).request<{
        results: Array<{
          id: string;
          label: string;
          displayOrder: number;
          stages: Array<{
            id: string;
            label: string;
            displayOrder: number;
            metadata: {
              isClosed: string;
              probability: string;
            };
          }>;
        }>;
      }>('/crm/v3/pipelines/deals');

      for (const pipeline of response.results) {
        const stages: DealStage[] = pipeline.stages.map((s) => ({
          id: s.id,
          label: s.label,
          displayOrder: s.displayOrder,
          metadata: {
            isClosed: s.metadata.isClosed === 'true',
            probability: parseFloat(s.metadata.probability) || 0,
          },
        }));

        // Cache stages
        for (const stage of stages) {
          this.stageCache.set(stage.id, stage);
        }

        this.pipelineCache.set(pipeline.id, {
          id: pipeline.id,
          label: pipeline.label,
          displayOrder: pipeline.displayOrder,
          stages,
        });
      }
    } catch (error) {
      console.warn('Failed to load deal pipelines:', error);
    }
  }

  /**
   * Get pipeline summary
   */
  async getPipelineSummary(
    pipelineId: string,
    options: { organizationId: string }
  ): Promise<{
    events: ExtractedEvent[];
    metrics: PipelineMetrics;
    stageBreakdown: Array<{
      stage: DealStage;
      count: number;
      value: number;
    }>;
  }> {
    const result = await this.extractDeals({
      organizationId: options.organizationId,
      pipelines: [pipelineId],
    });

    const stageBreakdown: Array<{
      stage: DealStage;
      count: number;
      value: number;
    }> = [];

    const pipeline = this.pipelineCache.get(pipelineId);
    if (pipeline) {
      for (const stage of pipeline.stages) {
        const stageDeals = result.deals.filter(
          (d) => d.properties.dealstage === stage.id
        );
        const totalValue = stageDeals.reduce(
          (sum, d) => sum + (parseFloat(d.properties.amount || '0') || 0),
          0
        );

        stageBreakdown.push({
          stage,
          count: stageDeals.length,
          value: totalValue,
        });
      }
    }

    // Create summary event
    const events: ExtractedEvent[] = [{
      type: 'crm.pipeline.summary',
      timestamp: new Date(),
      actorId: undefined,
      targetId: `pipeline:${pipelineId}`,
      metadata: {
        source: 'hubspot',
        organizationId: options.organizationId,
        pipelineId,
        pipelineName: pipeline?.label,
        totalDeals: result.metrics.totalCount,
        totalValue: result.metrics.totalValue,
        avgDealSize: result.metrics.avgDealSize,
        winRate: result.metrics.winRate,
        byStage: result.metrics.byStage,
      },
    }];

    return { events, metrics: result.metrics, stageBreakdown };
  }

  /**
   * Calculate pipeline metrics
   */
  private calculateMetrics(deals: HubSpotDeal[]): PipelineMetrics {
    const byStage: Record<string, { count: number; value: number }> = {};
    const byPipeline: Record<string, { count: number; value: number }> = {};
    let totalValue = 0;
    let wonCount = 0;
    let closedCount = 0;

    for (const deal of deals) {
      const amount = parseFloat(deal.properties.amount || '0') || 0;
      totalValue += amount;

      // By stage
      const stageId = deal.properties.dealstage || 'unknown';
      if (!byStage[stageId]) {
        byStage[stageId] = { count: 0, value: 0 };
      }
      byStage[stageId].count++;
      byStage[stageId].value += amount;

      // By pipeline
      const pipelineId = deal.properties.pipeline || 'default';
      if (!byPipeline[pipelineId]) {
        byPipeline[pipelineId] = { count: 0, value: 0 };
      }
      byPipeline[pipelineId].count++;
      byPipeline[pipelineId].value += amount;

      // Check if closed
      const stage = this.stageCache.get(stageId);
      if (stage?.metadata.isClosed) {
        closedCount++;
        if (deal.properties.hs_is_closed_won === 'true' || stage.metadata.probability === 1) {
          wonCount++;
        }
      }
    }

    return {
      totalValue,
      totalCount: deals.length,
      byStage,
      byPipeline,
      avgDealSize: deals.length > 0 ? totalValue / deals.length : 0,
      winRate: closedCount > 0 ? wonCount / closedCount : 0,
    };
  }

  /**
   * Convert deal to event
   */
  private dealToEvent(deal: HubSpotDeal, organizationId: string): ExtractedEvent {
    const stage = this.stageCache.get(deal.properties.dealstage || '');
    const isClosed = stage?.metadata.isClosed || deal.properties.hs_is_closed === 'true';
    const isWon = deal.properties.hs_is_closed_won === 'true';

    let eventType: string;
    if (isClosed) {
      eventType = isWon ? 'crm.deal.won' : 'crm.deal.lost';
    } else {
      const createdDate = new Date(deal.createdAt);
      const modifiedDate = new Date(deal.updatedAt);
      const isNew = Math.abs(modifiedDate.getTime() - createdDate.getTime()) < 60000;
      eventType = isNew ? 'crm.deal.created' : 'crm.deal.updated';
    }

    return {
      type: eventType,
      timestamp: new Date(deal.updatedAt),
      actorId: deal.properties.hubspot_owner_id || undefined,
      targetId: deal.id,
      metadata: {
        source: 'hubspot',
        organizationId,
        dealId: deal.id,
        name: deal.properties.dealname,
        amount: parseFloat(deal.properties.amount || '0') || 0,
        closeDate: deal.properties.closedate,
        stage: deal.properties.dealstage,
        stageName: stage?.label,
        pipeline: deal.properties.pipeline,
        pipelineName: this.pipelineCache.get(deal.properties.pipeline || '')?.label,
        probability: stage?.metadata.probability,
        dealType: deal.properties.dealtype,
        priority: deal.properties.hs_priority,
        isClosed,
        isWon,
        ownerId: deal.properties.hubspot_owner_id,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      },
    };
  }
}

/**
 * Create deals extractor
 */
export function createDealsExtractor(client: HubSpotClient): HubSpotDealsExtractor {
  return new HubSpotDealsExtractor(client);
}
