/**
 * Event Ingestion Service
 * Orchestrates the ingestion of events from connectors into storage
 * Includes embedding triggers for AI intelligence features (T027)
 */

import { PrismaClient } from '@prisma/client';
import { ExtractedEvent } from '../../connectors/base/connector.js';
import { EventWriter, createEventWriter } from './eventWriter.js';
import { queueDocumentEmbedding } from '../../jobs/embedding.job.js';
import { SourceType } from '../../models/Embedding.js';
import type { SourceDocument } from '../../models/Embedding.js';
import { logger } from '../../lib/logger.js';

export interface IngestionResult {
  success: boolean;
  eventsIngested: number;
  errors: string[];
  duration: number;
}

export interface IngestionOptions {
  batchSize?: number;
  validateEvents?: boolean;
  deduplicateByMessageId?: boolean;
  enableEmbedding?: boolean;
}

export class EventIngestionService {
  private eventWriter: EventWriter;

  constructor(private prisma: PrismaClient) {
    this.eventWriter = createEventWriter();
  }

  /**
   * Ingest a batch of events
   */
  async ingestEvents(
    events: ExtractedEvent[],
    organizationId: string,
    sourceId: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const { batchSize = 1000, validateEvents = true, enableEmbedding = true } = options;
    const errors: string[] = [];
    let eventsIngested = 0;

    if (events.length === 0) {
      return {
        success: true,
        eventsIngested: 0,
        errors: [],
        duration: 0,
      };
    }

    // Validate events if requested
    let validEvents = events;
    if (validateEvents) {
      const validationResult = this.validateEvents(events);
      validEvents = validationResult.valid;
      errors.push(...validationResult.errors);
    }

    // Process in batches
    for (let i = 0; i < validEvents.length; i += batchSize) {
      const batch = validEvents.slice(i, i + batchSize);

      try {
        const result = await this.eventWriter.writeBatch(
          batch,
          organizationId,
          sourceId
        );

        eventsIngested += result.written;
        if (result.errors.length > 0) {
          errors.push(...result.errors);
        }

        // Trigger embedding generation for content with text (T027)
        if (enableEmbedding && result.written > 0) {
          await this.triggerEmbeddings(batch, organizationId);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch ${Math.floor(i / batchSize)} failed: ${errorMessage}`);
      }
    }

    return {
      success: errors.length === 0,
      eventsIngested,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Ingest a single event
   */
  async ingestEvent(
    event: ExtractedEvent,
    organizationId: string,
    sourceId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.eventWriter.writeEvent(event, organizationId, sourceId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate events before ingestion
   */
  private validateEvents(events: ExtractedEvent[]): {
    valid: ExtractedEvent[];
    errors: string[];
  } {
    const valid: ExtractedEvent[] = [];
    const errors: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const validationErrors = this.validateEvent(event);

      if (validationErrors.length === 0) {
        valid.push(event);
      } else {
        errors.push(`Event ${i}: ${validationErrors.join(', ')}`);
      }
    }

    return { valid, errors };
  }

  /**
   * Validate a single event
   */
  private validateEvent(event: ExtractedEvent): string[] {
    const errors: string[] = [];

    if (!event.type) {
      errors.push('Missing event type');
    }

    if (!event.timestamp) {
      errors.push('Missing timestamp');
    } else if (!(event.timestamp instanceof Date) && isNaN(Date.parse(event.timestamp as unknown as string))) {
      errors.push('Invalid timestamp');
    }

    if (event.metadata && typeof event.metadata !== 'object') {
      errors.push('Invalid metadata format');
    }

    return errors;
  }

  /**
   * Get ingestion statistics for an organization
   */
  async getIngestionStats(organizationId: string, days = 30) {
    return this.eventWriter.getStats(organizationId, days);
  }

  /**
   * Delete events for a data source
   */
  async deleteEventsForSource(
    organizationId: string,
    sourceId: string
  ): Promise<number> {
    return this.eventWriter.deleteBySource(organizationId, sourceId);
  }

  /**
   * Trigger embedding generation for events with textual content (T027)
   * Queues embedding jobs for emails, messages, meetings, and documents
   */
  private async triggerEmbeddings(
    events: ExtractedEvent[],
    tenantId: string
  ): Promise<void> {
    const embeddableTypes = ['email', 'message', 'meeting', 'document', 'calendar'];

    for (const event of events) {
      // Only process events with text content
      if (!embeddableTypes.includes(event.type)) {
        continue;
      }

      const textContent = this.extractTextContent(event);
      if (!textContent || textContent.length < 50) {
        continue; // Skip very short content
      }

      try {
        const sourceDocument: SourceDocument = {
          id: event.id || `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: this.mapEventTypeToSourceType(event.type),
          content: textContent,
          tenantId,
          metadata: {
            authorId: event.metadata?.senderId || event.metadata?.organizer,
            participants: event.metadata?.participants || event.metadata?.recipients,
            threadId: event.metadata?.threadId || event.metadata?.conversationId,
            sentAt: event.timestamp instanceof Date
              ? event.timestamp.toISOString()
              : event.timestamp,
            title: event.metadata?.subject || event.metadata?.title,
          },
        };

        await queueDocumentEmbedding(sourceDocument);
        logger.debug(
          { eventType: event.type, documentId: sourceDocument.id },
          'Queued embedding for ingested event'
        );
      } catch (error) {
        // Log but don't fail ingestion
        logger.warn(
          { eventType: event.type, error },
          'Failed to queue embedding for event'
        );
      }
    }
  }

  /**
   * Extract text content from an event for embedding
   */
  private extractTextContent(event: ExtractedEvent): string {
    const parts: string[] = [];

    // Add subject/title
    if (event.metadata?.subject) {
      parts.push(event.metadata.subject as string);
    }
    if (event.metadata?.title) {
      parts.push(event.metadata.title as string);
    }

    // Add body content
    if (event.metadata?.body) {
      parts.push(event.metadata.body as string);
    }
    if (event.metadata?.bodyPreview) {
      parts.push(event.metadata.bodyPreview as string);
    }
    if (event.metadata?.content) {
      parts.push(event.metadata.content as string);
    }
    if (event.metadata?.description) {
      parts.push(event.metadata.description as string);
    }

    // Add any notes
    if (event.metadata?.notes) {
      parts.push(event.metadata.notes as string);
    }

    return parts.filter(Boolean).join('\n\n');
  }

  /**
   * Map event type to SourceType enum
   */
  private mapEventTypeToSourceType(eventType: string): SourceType {
    switch (eventType.toLowerCase()) {
      case 'email':
        return SourceType.EMAIL;
      case 'message':
      case 'chat':
        return SourceType.MESSAGE;
      case 'meeting':
      case 'calendar':
        return SourceType.MEETING;
      case 'document':
      default:
        return SourceType.DOCUMENT;
    }
  }
}

// Factory function
let eventIngestionServiceInstance: EventIngestionService | null = null;

export function createEventIngestionService(prisma: PrismaClient): EventIngestionService {
  if (!eventIngestionServiceInstance) {
    eventIngestionServiceInstance = new EventIngestionService(prisma);
  }
  return eventIngestionServiceInstance;
}
