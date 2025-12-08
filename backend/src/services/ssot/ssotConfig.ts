/**
 * SSOT Configuration Service
 * Manages Single Source of Truth mode configuration
 * T280 - SSOT mode configuration
 */

import { prisma } from '../../lib/prisma.js';

export type SsotMode = 'disabled' | 'shadow' | 'active' | 'primary';

export interface SsotConfig {
  id: string;
  organizationId: string;
  mode: SsotMode;
  enabledEntityTypes: string[];
  syncDirection: 'read_only' | 'write_back' | 'bidirectional';
  conflictResolution: 'newest_wins' | 'source_priority' | 'manual_review';
  sourcePriority: string[];
  validationRulesEnabled: boolean;
  autoMergeEnabled: boolean;
  autoMergeThreshold: number;
  retentionDays: number;
  webhookUrl?: string;
  notifyOnConflict: boolean;
  notifyOnSync: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SsotConfigInput {
  mode?: SsotMode;
  enabledEntityTypes?: string[];
  syncDirection?: 'read_only' | 'write_back' | 'bidirectional';
  conflictResolution?: 'newest_wins' | 'source_priority' | 'manual_review';
  sourcePriority?: string[];
  validationRulesEnabled?: boolean;
  autoMergeEnabled?: boolean;
  autoMergeThreshold?: number;
  retentionDays?: number;
  webhookUrl?: string;
  notifyOnConflict?: boolean;
  notifyOnSync?: boolean;
}

const DEFAULT_CONFIG: Omit<SsotConfig, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'> = {
  mode: 'disabled',
  enabledEntityTypes: ['company', 'person', 'product', 'address', 'contact'],
  syncDirection: 'read_only',
  conflictResolution: 'newest_wins',
  sourcePriority: [],
  validationRulesEnabled: true,
  autoMergeEnabled: false,
  autoMergeThreshold: 0.95,
  retentionDays: 365,
  webhookUrl: undefined,
  notifyOnConflict: true,
  notifyOnSync: false,
};

/**
 * Get SSOT configuration for an organization
 */
export async function getSsotConfig(organizationId: string): Promise<SsotConfig> {
  const existing = await prisma.ssotConfig.findUnique({
    where: { organizationId },
  });

  if (existing) {
    return {
      id: existing.id,
      organizationId: existing.organizationId,
      mode: existing.mode as SsotMode,
      enabledEntityTypes: existing.enabledEntityTypes as string[],
      syncDirection: existing.syncDirection as SsotConfig['syncDirection'],
      conflictResolution: existing.conflictResolution as SsotConfig['conflictResolution'],
      sourcePriority: existing.sourcePriority as string[],
      validationRulesEnabled: existing.validationRulesEnabled,
      autoMergeEnabled: existing.autoMergeEnabled,
      autoMergeThreshold: existing.autoMergeThreshold,
      retentionDays: existing.retentionDays,
      webhookUrl: existing.webhookUrl || undefined,
      notifyOnConflict: existing.notifyOnConflict,
      notifyOnSync: existing.notifyOnSync,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
  }

  // Return default config if none exists
  return {
    id: '',
    organizationId,
    ...DEFAULT_CONFIG,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Update SSOT configuration
 */
export async function updateSsotConfig(
  organizationId: string,
  input: SsotConfigInput
): Promise<SsotConfig> {
  const existing = await prisma.ssotConfig.findUnique({
    where: { organizationId },
  });

  const data = {
    mode: input.mode,
    enabledEntityTypes: input.enabledEntityTypes,
    syncDirection: input.syncDirection,
    conflictResolution: input.conflictResolution,
    sourcePriority: input.sourcePriority,
    validationRulesEnabled: input.validationRulesEnabled,
    autoMergeEnabled: input.autoMergeEnabled,
    autoMergeThreshold: input.autoMergeThreshold,
    retentionDays: input.retentionDays,
    webhookUrl: input.webhookUrl,
    notifyOnConflict: input.notifyOnConflict,
    notifyOnSync: input.notifyOnSync,
  };

  // Remove undefined values
  Object.keys(data).forEach((key) => {
    if ((data as Record<string, unknown>)[key] === undefined) {
      delete (data as Record<string, unknown>)[key];
    }
  });

  let result;
  if (existing) {
    result = await prisma.ssotConfig.update({
      where: { organizationId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  } else {
    result = await prisma.ssotConfig.create({
      data: {
        organizationId,
        ...DEFAULT_CONFIG,
        ...data,
      },
    });
  }

  return getSsotConfig(organizationId);
}

/**
 * Check if SSOT mode is enabled for an organization
 */
export async function isSsotEnabled(organizationId: string): Promise<boolean> {
  const config = await getSsotConfig(organizationId);
  return config.mode !== 'disabled';
}

/**
 * Check if SSOT is the primary source for an entity type
 */
export async function isSsotPrimaryFor(
  organizationId: string,
  entityType: string
): Promise<boolean> {
  const config = await getSsotConfig(organizationId);
  return (
    config.mode === 'primary' &&
    config.enabledEntityTypes.includes(entityType)
  );
}

/**
 * Get sync direction for an organization
 */
export async function getSyncDirection(
  organizationId: string
): Promise<'read_only' | 'write_back' | 'bidirectional'> {
  const config = await getSsotConfig(organizationId);
  return config.syncDirection;
}

/**
 * Get conflict resolution strategy
 */
export async function getConflictResolutionStrategy(
  organizationId: string
): Promise<'newest_wins' | 'source_priority' | 'manual_review'> {
  const config = await getSsotConfig(organizationId);
  return config.conflictResolution;
}

/**
 * Enable SSOT mode
 */
export async function enableSsotMode(
  organizationId: string,
  mode: SsotMode = 'shadow'
): Promise<SsotConfig> {
  return updateSsotConfig(organizationId, { mode });
}

/**
 * Disable SSOT mode
 */
export async function disableSsotMode(organizationId: string): Promise<SsotConfig> {
  return updateSsotConfig(organizationId, { mode: 'disabled' });
}

/**
 * Transition SSOT mode (with validation)
 */
export async function transitionSsotMode(
  organizationId: string,
  targetMode: SsotMode
): Promise<{ success: boolean; config?: SsotConfig; error?: string }> {
  const currentConfig = await getSsotConfig(organizationId);
  const validTransitions: Record<SsotMode, SsotMode[]> = {
    disabled: ['shadow'],
    shadow: ['disabled', 'active'],
    active: ['shadow', 'primary'],
    primary: ['active'],
  };

  if (!validTransitions[currentConfig.mode].includes(targetMode)) {
    return {
      success: false,
      error: `Invalid transition from ${currentConfig.mode} to ${targetMode}. Valid transitions: ${validTransitions[currentConfig.mode].join(', ')}`,
    };
  }

  const config = await updateSsotConfig(organizationId, { mode: targetMode });
  return { success: true, config };
}

export default {
  getSsotConfig,
  updateSsotConfig,
  isSsotEnabled,
  isSsotPrimaryFor,
  getSyncDirection,
  getConflictResolutionStrategy,
  enableSsotMode,
  disableSsotMode,
  transitionSsotMode,
};
