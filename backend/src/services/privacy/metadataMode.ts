/**
 * Metadata-Only Analysis Mode
 * Enables privacy-preserving analysis using only metadata
 * T294 - Metadata-only analysis mode
 */

import { prisma } from '../../lib/prisma.js';

export interface MetadataModeConfig {
  enabled: boolean;
  allowedMetadataFields: string[];
  excludedContentTypes: string[];
  retainTimestamps: boolean;
  retainParticipantCounts: boolean;
  retainDurations: boolean;
  hashIdentifiers: boolean;
}

export interface MetadataEvent {
  id: string;
  organizationId: string;
  eventType: string;
  timestamp: Date;
  sourceType: string;
  metadata: EventMetadata;
}

export interface EventMetadata {
  participantCount?: number;
  duration?: number;
  hasAttachments?: boolean;
  attachmentCount?: number;
  threadDepth?: number;
  responseTime?: number;
  dayOfWeek?: number;
  hourOfDay?: number;
  isRecurring?: boolean;
  priority?: string;
  categories?: string[];
}

export interface ContentStrippedEvent {
  original: Record<string, unknown>;
  metadata: EventMetadata;
  strippedFields: string[];
}

const DEFAULT_ALLOWED_METADATA = [
  'timestamp',
  'eventType',
  'sourceType',
  'participantCount',
  'duration',
  'hasAttachments',
  'attachmentCount',
  'threadDepth',
  'responseTime',
  'dayOfWeek',
  'hourOfDay',
  'isRecurring',
  'priority',
  'categories',
];

const CONTENT_FIELDS_TO_STRIP = [
  'subject',
  'body',
  'content',
  'text',
  'message',
  'description',
  'notes',
  'comments',
  'title',
  'name',
  'email',
  'phone',
  'address',
];

/**
 * Get metadata mode configuration for an organization
 */
export async function getMetadataModeConfig(
  organizationId: string
): Promise<MetadataModeConfig> {
  const config = await prisma.privacyConfig.findUnique({
    where: { organizationId },
  });

  if (!config) {
    return {
      enabled: false,
      allowedMetadataFields: DEFAULT_ALLOWED_METADATA,
      excludedContentTypes: CONTENT_FIELDS_TO_STRIP,
      retainTimestamps: true,
      retainParticipantCounts: true,
      retainDurations: true,
      hashIdentifiers: true,
    };
  }

  const metadataConfig = config.metadataMode as Record<string, unknown> | null;

  return {
    enabled: metadataConfig?.enabled as boolean ?? false,
    allowedMetadataFields: metadataConfig?.allowedMetadataFields as string[] ?? DEFAULT_ALLOWED_METADATA,
    excludedContentTypes: metadataConfig?.excludedContentTypes as string[] ?? CONTENT_FIELDS_TO_STRIP,
    retainTimestamps: metadataConfig?.retainTimestamps as boolean ?? true,
    retainParticipantCounts: metadataConfig?.retainParticipantCounts as boolean ?? true,
    retainDurations: metadataConfig?.retainDurations as boolean ?? true,
    hashIdentifiers: metadataConfig?.hashIdentifiers as boolean ?? true,
  };
}

/**
 * Update metadata mode configuration
 */
export async function updateMetadataModeConfig(
  organizationId: string,
  config: Partial<MetadataModeConfig>
): Promise<MetadataModeConfig> {
  const existing = await getMetadataModeConfig(organizationId);
  const updated = { ...existing, ...config };

  await prisma.privacyConfig.upsert({
    where: { organizationId },
    create: {
      organizationId,
      metadataMode: updated as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    },
    update: {
      metadataMode: updated as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    },
  });

  return updated;
}

/**
 * Check if metadata-only mode is enabled
 */
export async function isMetadataModeEnabled(organizationId: string): Promise<boolean> {
  const config = await getMetadataModeConfig(organizationId);
  return config.enabled;
}

/**
 * Strip content from an event, retaining only metadata
 */
export function stripContentFromEvent(
  event: Record<string, unknown>,
  config: MetadataModeConfig
): ContentStrippedEvent {
  const metadata: EventMetadata = {};
  const strippedFields: string[] = [];

  // Extract allowed metadata
  if (config.retainTimestamps && event.timestamp) {
    const date = new Date(event.timestamp as string);
    metadata.dayOfWeek = date.getDay();
    metadata.hourOfDay = date.getHours();
  }

  if (config.retainParticipantCounts) {
    if (event.participants && Array.isArray(event.participants)) {
      metadata.participantCount = event.participants.length;
    }
    if (event.attendees && Array.isArray(event.attendees)) {
      metadata.participantCount = event.attendees.length;
    }
    if (event.recipients && Array.isArray(event.recipients)) {
      metadata.participantCount = event.recipients.length;
    }
  }

  if (config.retainDurations) {
    if (event.duration) {
      metadata.duration = event.duration as number;
    }
    if (event.startTime && event.endTime) {
      const start = new Date(event.startTime as string).getTime();
      const end = new Date(event.endTime as string).getTime();
      metadata.duration = Math.floor((end - start) / 1000 / 60); // minutes
    }
  }

  // Extract other metadata
  if (event.attachments && Array.isArray(event.attachments)) {
    metadata.hasAttachments = event.attachments.length > 0;
    metadata.attachmentCount = event.attachments.length;
  }

  if (event.threadId && event.inReplyTo) {
    metadata.threadDepth = (event.threadDepth as number) || 1;
  }

  if (event.isRecurring !== undefined) {
    metadata.isRecurring = event.isRecurring as boolean;
  }

  if (event.priority) {
    metadata.priority = event.priority as string;
  }

  if (event.categories && Array.isArray(event.categories)) {
    metadata.categories = event.categories as string[];
  }

  // Track stripped fields
  for (const field of config.excludedContentTypes) {
    if (event[field] !== undefined) {
      strippedFields.push(field);
    }
  }

  return {
    original: event,
    metadata,
    strippedFields,
  };
}

/**
 * Process events in metadata-only mode
 */
export async function processEventsMetadataOnly(
  organizationId: string,
  events: Array<Record<string, unknown>>
): Promise<MetadataEvent[]> {
  const config = await getMetadataModeConfig(organizationId);

  if (!config.enabled) {
    throw new Error('Metadata-only mode is not enabled');
  }

  return events.map((event) => {
    const stripped = stripContentFromEvent(event, config);

    return {
      id: hashIdentifier(event.id as string, config.hashIdentifiers),
      organizationId,
      eventType: event.eventType as string || 'unknown',
      timestamp: new Date(event.timestamp as string || Date.now()),
      sourceType: event.sourceType as string || 'unknown',
      metadata: stripped.metadata,
    };
  });
}

/**
 * Extract communication patterns from metadata
 */
export async function extractCommunicationPatterns(
  organizationId: string,
  options?: {
    fromDate?: Date;
    toDate?: Date;
  }
): Promise<{
  hourlyDistribution: Record<number, number>;
  weeklyDistribution: Record<number, number>;
  avgParticipants: number;
  avgDuration: number;
  responseTimeDistribution: Record<string, number>;
}> {
  const config = await getMetadataModeConfig(organizationId);

  if (!config.enabled) {
    throw new Error('Metadata-only mode is not enabled');
  }

  // Query metadata events
  const where: Record<string, unknown> = { organizationId };

  if (options?.fromDate || options?.toDate) {
    where.timestamp = {};
    if (options.fromDate) {
      (where.timestamp as Record<string, Date>).gte = options.fromDate;
    }
    if (options.toDate) {
      (where.timestamp as Record<string, Date>).lte = options.toDate;
    }
  }

  const events = await prisma.metadataEvent.findMany({
    where,
    select: {
      metadata: true,
    },
  });

  // Aggregate patterns
  const hourlyDistribution: Record<number, number> = {};
  const weeklyDistribution: Record<number, number> = {};
  const responseTimeDistribution: Record<string, number> = {
    '< 1h': 0,
    '1-4h': 0,
    '4-24h': 0,
    '> 24h': 0,
  };

  let totalParticipants = 0;
  let participantCount = 0;
  let totalDuration = 0;
  let durationCount = 0;

  for (const event of events) {
    const meta = event.metadata as EventMetadata;

    if (meta.hourOfDay !== undefined) {
      hourlyDistribution[meta.hourOfDay] = (hourlyDistribution[meta.hourOfDay] || 0) + 1;
    }

    if (meta.dayOfWeek !== undefined) {
      weeklyDistribution[meta.dayOfWeek] = (weeklyDistribution[meta.dayOfWeek] || 0) + 1;
    }

    if (meta.participantCount !== undefined) {
      totalParticipants += meta.participantCount;
      participantCount++;
    }

    if (meta.duration !== undefined) {
      totalDuration += meta.duration;
      durationCount++;
    }

    if (meta.responseTime !== undefined) {
      const hours = meta.responseTime / 60;
      if (hours < 1) responseTimeDistribution['< 1h']++;
      else if (hours < 4) responseTimeDistribution['1-4h']++;
      else if (hours < 24) responseTimeDistribution['4-24h']++;
      else responseTimeDistribution['> 24h']++;
    }
  }

  return {
    hourlyDistribution,
    weeklyDistribution,
    avgParticipants: participantCount > 0 ? totalParticipants / participantCount : 0,
    avgDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    responseTimeDistribution,
  };
}

/**
 * Get metadata-only analytics summary
 */
export async function getMetadataAnalyticsSummary(
  organizationId: string
): Promise<{
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySource: Record<string, number>;
  avgEventsPerDay: number;
  peakHour: number;
  peakDay: number;
}> {
  const config = await getMetadataModeConfig(organizationId);

  if (!config.enabled) {
    throw new Error('Metadata-only mode is not enabled');
  }

  const [total, byType, bySource, patterns] = await Promise.all([
    prisma.metadataEvent.count({ where: { organizationId } }),
    prisma.metadataEvent.groupBy({
      by: ['eventType'],
      where: { organizationId },
      _count: true,
    }),
    prisma.metadataEvent.groupBy({
      by: ['sourceType'],
      where: { organizationId },
      _count: true,
    }),
    extractCommunicationPatterns(organizationId),
  ]);

  // Find peak hour and day
  let peakHour = 0;
  let peakHourCount = 0;
  for (const [hour, count] of Object.entries(patterns.hourlyDistribution)) {
    if (count > peakHourCount) {
      peakHour = parseInt(hour);
      peakHourCount = count;
    }
  }

  let peakDay = 0;
  let peakDayCount = 0;
  for (const [day, count] of Object.entries(patterns.weeklyDistribution)) {
    if (count > peakDayCount) {
      peakDay = parseInt(day);
      peakDayCount = count;
    }
  }

  // Calculate avg events per day
  const firstEvent = await prisma.metadataEvent.findFirst({
    where: { organizationId },
    orderBy: { timestamp: 'asc' },
  });

  const lastEvent = await prisma.metadataEvent.findFirst({
    where: { organizationId },
    orderBy: { timestamp: 'desc' },
  });

  let avgEventsPerDay = 0;
  if (firstEvent && lastEvent) {
    const days = Math.max(
      1,
      Math.ceil(
        (lastEvent.timestamp.getTime() - firstEvent.timestamp.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    avgEventsPerDay = total / days;
  }

  return {
    totalEvents: total,
    eventsByType: Object.fromEntries(byType.map((t) => [t.eventType, t._count])),
    eventsBySource: Object.fromEntries(bySource.map((s) => [s.sourceType, s._count])),
    avgEventsPerDay,
    peakHour,
    peakDay,
  };
}

// Helper function
function hashIdentifier(id: string, shouldHash: boolean): string {
  if (!shouldHash) return id;

  // Simple hash for privacy (in production, use crypto)
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `anon_${Math.abs(hash).toString(16)}`;
}

export default {
  getMetadataModeConfig,
  updateMetadataModeConfig,
  isMetadataModeEnabled,
  stripContentFromEvent,
  processEventsMetadataOnly,
  extractCommunicationPatterns,
  getMetadataAnalyticsSummary,
};
