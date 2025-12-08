/**
 * Docuware Cabinet Metadata Extractor
 * Task: T163
 * Discovers and extracts document cabinet information
 */

import { DocuwareClient, DocuwareCabinet } from '../docuwareClient.js';

export interface ExtractedEvent {
  externalId: string;
  source: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface CabinetExtractionOptions {
  organizationId: string;
  includeArchived?: boolean;
  includeBaskets?: boolean;
}

export interface CabinetExtractionResult {
  events: ExtractedEvent[];
  stats: {
    totalCabinets: number;
    activeCabinets: number;
    archivedCabinets: number;
    baskets: number;
  };
}

/**
 * Determine cabinet category
 */
function getCabinetCategory(cabinet: DocuwareCabinet): string {
  if (cabinet.IsBasket) return 'basket';
  if (cabinet.Archived) return 'archived';
  return 'active';
}

/**
 * Convert Docuware cabinet to ExtractedEvent
 */
export function cabinetToEvent(
  cabinet: DocuwareCabinet,
  organizationId: string
): ExtractedEvent {
  return {
    externalId: `docuware-cabinet-${cabinet.Id}`,
    source: 'docuware',
    eventType: 'dms.cabinet.discovered',
    timestamp: new Date(),
    data: {
      cabinetId: cabinet.Id,
      name: cabinet.Name,
      color: cabinet.Color,
      type: cabinet.FileCabinetType,
      category: getCabinetCategory(cabinet),
      isBasket: cabinet.IsBasket,
      isArchived: cabinet.Archived,
      isDefault: cabinet.Default,
      assignedDialogId: cabinet.AssignedDialogId,
    },
    metadata: {
      organizationId,
      objectType: 'Cabinet',
      source: 'docuware',
    },
  };
}

/**
 * Extract all cabinets from Docuware
 */
export async function extractCabinets(
  client: DocuwareClient,
  options: CabinetExtractionOptions
): Promise<CabinetExtractionResult> {
  const events: ExtractedEvent[] = [];
  const stats = {
    totalCabinets: 0,
    activeCabinets: 0,
    archivedCabinets: 0,
    baskets: 0,
  };

  try {
    const cabinets = await client.getCabinets();

    for (const cabinet of cabinets) {
      // Filter based on options
      if (!options.includeArchived && cabinet.Archived) {
        continue;
      }

      if (!options.includeBaskets && cabinet.IsBasket) {
        continue;
      }

      // Create event
      events.push(cabinetToEvent(cabinet, options.organizationId));

      // Update stats
      stats.totalCabinets++;

      if (cabinet.IsBasket) {
        stats.baskets++;
      } else if (cabinet.Archived) {
        stats.archivedCabinets++;
      } else {
        stats.activeCabinets++;
      }
    }
  } catch (error) {
    console.error('Error extracting cabinets:', error);
    throw new Error(`Failed to extract cabinets: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return { events, stats };
}

/**
 * Get cabinet details with dialogs
 */
export async function extractCabinetDetails(
  client: DocuwareClient,
  cabinetId: string,
  organizationId: string
): Promise<ExtractedEvent> {
  try {
    const cabinet = await client.getCabinet(cabinetId);
    const dialogs = await client.getDialogs(cabinetId);

    const event = cabinetToEvent(cabinet, organizationId);

    // Enhance with dialog information
    event.data.dialogCount = dialogs.length;
    event.data.dialogs = dialogs.map(d => ({
      id: d.Id,
      displayName: d.DisplayName,
      type: d.Type,
    }));

    return event;
  } catch (error) {
    throw new Error(`Failed to extract cabinet details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate cabinet statistics
 */
export function calculateCabinetStats(events: ExtractedEvent[]): {
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  defaultCabinets: number;
  totalDialogs: number;
} {
  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let defaultCabinets = 0;
  let totalDialogs = 0;

  for (const event of events) {
    const type = event.data.type as string;
    const category = event.data.category as string;

    if (type) {
      byType[type] = (byType[type] || 0) + 1;
    }

    if (category) {
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    if (event.data.isDefault) {
      defaultCabinets++;
    }

    if (event.data.dialogCount) {
      totalDialogs += event.data.dialogCount as number;
    }
  }

  return {
    byType,
    byCategory,
    defaultCabinets,
    totalDialogs,
  };
}
