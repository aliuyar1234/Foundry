// =============================================================================
// Offline Mode Service
// SCALE Tier - Task T176-T180
//
// Manages offline functionality for air-gapped deployments
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { LicenseService } from './licenseService';
import crypto from 'crypto';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface OfflineStatus {
  isOffline: boolean;
  lastOnline: Date | null;
  offlineSince: Date | null;
  syncPending: boolean;
  pendingChanges: number;
  aiCacheStatus: AiCacheStatus;
}

export interface AiCacheStatus {
  modelsAvailable: boolean;
  lastUpdated: Date | null;
  cachedPrompts: number;
  cachedResponses: number;
}

export interface SyncPackage {
  id: string;
  createdAt: Date;
  type: 'full' | 'incremental';
  data: {
    entities: unknown[];
    processes: unknown[];
    users: unknown[];
    configurations: unknown[];
  };
  checksum: string;
}

export interface AiCacheEntry {
  promptHash: string;
  prompt: string;
  response: string;
  model: string;
  createdAt: Date;
  expiresAt: Date;
  usageCount: number;
}

// -----------------------------------------------------------------------------
// Offline Mode Service
// -----------------------------------------------------------------------------

export class OfflineModeService {
  private prisma: PrismaClient;
  private licenseService: LicenseService;
  private isOfflineMode: boolean = false;
  private lastOnlineCheck: Date | null = null;
  private offlineSince: Date | null = null;

  constructor(prisma: PrismaClient, licenseService: LicenseService) {
    this.prisma = prisma;
    this.licenseService = licenseService;
  }

  // ---------------------------------------------------------------------------
  // Offline Mode Detection
  // ---------------------------------------------------------------------------

  async checkConnectivity(): Promise<boolean> {
    try {
      // Try to reach the license server
      const licenseServerUrl = process.env.LICENSE_SERVER_URL;

      if (!licenseServerUrl) {
        // No server configured, assume offline mode
        return false;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${licenseServerUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const isOnline = response.ok;

      if (isOnline && this.isOfflineMode) {
        // Coming back online
        await this.handleOnlineTransition();
      } else if (!isOnline && !this.isOfflineMode) {
        // Going offline
        await this.handleOfflineTransition();
      }

      this.lastOnlineCheck = new Date();
      return isOnline;
    } catch {
      if (!this.isOfflineMode) {
        await this.handleOfflineTransition();
      }
      return false;
    }
  }

  private async handleOfflineTransition(): Promise<void> {
    this.isOfflineMode = true;
    this.offlineSince = new Date();

    // Log the transition
    await this.prisma.auditLog.create({
      data: {
        action: 'SYSTEM_OFFLINE',
        resourceType: 'SYSTEM',
        resourceId: 'offline-mode',
        details: {
          offlineSince: this.offlineSince.toISOString(),
        },
      },
    });

    console.log('System entered offline mode');
  }

  private async handleOnlineTransition(): Promise<void> {
    this.isOfflineMode = false;
    const wasOfflineSince = this.offlineSince;
    this.offlineSince = null;

    // Log the transition
    await this.prisma.auditLog.create({
      data: {
        action: 'SYSTEM_ONLINE',
        resourceType: 'SYSTEM',
        resourceId: 'offline-mode',
        details: {
          wasOfflineSince: wasOfflineSince?.toISOString(),
          onlineAt: new Date().toISOString(),
        },
      },
    });

    // Trigger sync if there are pending changes
    const pendingCount = await this.getPendingChangesCount();
    if (pendingCount > 0) {
      console.log(`System back online. ${pendingCount} changes pending sync.`);
      // In production, this would trigger a background sync job
    }

    console.log('System back online');
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<OfflineStatus> {
    await this.checkConnectivity();

    const pendingChanges = await this.getPendingChangesCount();
    const aiCacheStatus = await this.getAiCacheStatus();

    return {
      isOffline: this.isOfflineMode,
      lastOnline: this.lastOnlineCheck,
      offlineSince: this.offlineSince,
      syncPending: pendingChanges > 0,
      pendingChanges,
      aiCacheStatus,
    };
  }

  private async getPendingChangesCount(): Promise<number> {
    try {
      const count = await this.prisma.syncQueue.count({
        where: {
          syncedAt: null,
        },
      });
      return count;
    } catch {
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // AI Cache Management
  // ---------------------------------------------------------------------------

  async getAiCacheStatus(): Promise<AiCacheStatus> {
    try {
      const cacheCount = await this.prisma.aiCache.count();
      const latestEntry = await this.prisma.aiCache.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      return {
        modelsAvailable: await this.checkLocalModels(),
        lastUpdated: latestEntry?.createdAt || null,
        cachedPrompts: cacheCount,
        cachedResponses: cacheCount,
      };
    } catch {
      return {
        modelsAvailable: false,
        lastUpdated: null,
        cachedPrompts: 0,
        cachedResponses: 0,
      };
    }
  }

  private async checkLocalModels(): Promise<boolean> {
    // Check if local AI models are available (e.g., Ollama, local embeddings)
    const ollamaUrl = process.env.OLLAMA_URL;

    if (!ollamaUrl) {
      return false;
    }

    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async cacheAiResponse(
    prompt: string,
    response: string,
    model: string,
    ttlHours: number = 24 * 30 // 30 days default
  ): Promise<void> {
    const promptHash = this.hashPrompt(prompt);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.prisma.aiCache.upsert({
      where: { promptHash },
      update: {
        response,
        model,
        expiresAt,
        usageCount: { increment: 1 },
      },
      create: {
        promptHash,
        prompt,
        response,
        model,
        expiresAt,
        usageCount: 1,
      },
    });
  }

  async getCachedAiResponse(prompt: string): Promise<string | null> {
    const promptHash = this.hashPrompt(prompt);

    const cached = await this.prisma.aiCache.findFirst({
      where: {
        promptHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (cached) {
      // Update usage count
      await this.prisma.aiCache.update({
        where: { id: cached.id },
        data: { usageCount: { increment: 1 } },
      });

      return cached.response;
    }

    return null;
  }

  private hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  async cleanupExpiredCache(): Promise<number> {
    const result = await this.prisma.aiCache.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }

  // ---------------------------------------------------------------------------
  // Data Sync
  // ---------------------------------------------------------------------------

  async queueForSync(
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete',
    data: unknown
  ): Promise<void> {
    await this.prisma.syncQueue.create({
      data: {
        entityType,
        entityId,
        action,
        data: JSON.stringify(data),
        createdAt: new Date(),
      },
    });
  }

  async createSyncPackage(type: 'full' | 'incremental'): Promise<SyncPackage> {
    const id = crypto.randomUUID();
    const createdAt = new Date();

    let data: SyncPackage['data'];

    if (type === 'full') {
      // Full export of all data
      data = {
        entities: await this.prisma.entity.findMany(),
        processes: await this.prisma.process.findMany(),
        users: await this.prisma.user.findMany({
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            entityId: true,
          },
        }),
        configurations: await this.prisma.systemConfig.findMany(),
      };
    } else {
      // Incremental: only pending changes
      const pendingItems = await this.prisma.syncQueue.findMany({
        where: { syncedAt: null },
        orderBy: { createdAt: 'asc' },
      });

      // Group by entity type
      const grouped: Record<string, unknown[]> = {};
      for (const item of pendingItems) {
        if (!grouped[item.entityType]) {
          grouped[item.entityType] = [];
        }
        grouped[item.entityType].push({
          id: item.entityId,
          action: item.action,
          data: JSON.parse(item.data as string),
        });
      }

      data = {
        entities: grouped['entity'] || [],
        processes: grouped['process'] || [],
        users: grouped['user'] || [],
        configurations: grouped['config'] || [],
      };
    }

    // Calculate checksum
    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');

    return {
      id,
      createdAt,
      type,
      data,
      checksum,
    };
  }

  async importSyncPackage(pkg: SyncPackage): Promise<{
    success: boolean;
    imported: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let imported = 0;

    // Verify checksum
    const calculatedChecksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(pkg.data))
      .digest('hex');

    if (calculatedChecksum !== pkg.checksum) {
      return {
        success: false,
        imported: 0,
        errors: ['Checksum mismatch. Package may be corrupted.'],
      };
    }

    // Import entities
    for (const entity of pkg.data.entities as unknown[]) {
      try {
        await this.prisma.entity.upsert({
          where: { id: (entity as { id: string }).id },
          update: entity as Record<string, unknown>,
          create: entity as Record<string, unknown>,
        });
        imported++;
      } catch (error) {
        errors.push(`Entity import error: ${(error as Error).message}`);
      }
    }

    // Import processes
    for (const process of pkg.data.processes as unknown[]) {
      try {
        await this.prisma.process.upsert({
          where: { id: (process as { id: string }).id },
          update: process as Record<string, unknown>,
          create: process as Record<string, unknown>,
        });
        imported++;
      } catch (error) {
        errors.push(`Process import error: ${(error as Error).message}`);
      }
    }

    // Import configurations
    for (const config of pkg.data.configurations as unknown[]) {
      try {
        await this.prisma.systemConfig.upsert({
          where: { key: (config as { key: string }).key },
          update: config as Record<string, unknown>,
          create: config as Record<string, unknown>,
        });
        imported++;
      } catch (error) {
        errors.push(`Config import error: ${(error as Error).message}`);
      }
    }

    return {
      success: errors.length === 0,
      imported,
      errors,
    };
  }

  // ---------------------------------------------------------------------------
  // Offline AI Fallback
  // ---------------------------------------------------------------------------

  async getOfflineAiResponse(prompt: string): Promise<string | null> {
    // First, check cache
    const cached = await this.getCachedAiResponse(prompt);
    if (cached) {
      return cached;
    }

    // Try local Ollama if available
    const ollamaUrl = process.env.OLLAMA_URL;
    if (ollamaUrl) {
      try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.OLLAMA_MODEL || 'llama2',
            prompt,
            stream: false,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const aiResponse = result.response;

          // Cache the response
          await this.cacheAiResponse(prompt, aiResponse, 'ollama');

          return aiResponse;
        }
      } catch {
        // Ollama not available
      }
    }

    return null;
  }
}
