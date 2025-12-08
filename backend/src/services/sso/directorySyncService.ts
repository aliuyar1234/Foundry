// =============================================================================
// Directory Sync Service
// SCALE Tier - Task T281-T290
//
// Scheduled directory synchronization for enterprise SSO (SCIM/LDAP)
// =============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { ScimService } from './scimService';
import { RoleMappingService } from './roleMappingService';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DirectorySyncConfig {
  id: string;
  organizationId: string;
  name: string;
  // Sync source
  sourceType: 'scim' | 'ldap' | 'azure-ad' | 'okta' | 'google';
  sourceConfig: Record<string, unknown>;
  // Sync options
  syncUsers: boolean;
  syncGroups: boolean;
  syncRoles: boolean;
  // Schedule
  scheduleEnabled: boolean;
  scheduleInterval: number; // minutes
  scheduleCron?: string;
  // Filters
  userFilter?: string;
  groupFilter?: string;
  // Status
  enabled: boolean;
  lastSyncAt?: Date;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  lastSyncError?: string;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncJob {
  id: string;
  configId: string;
  organizationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  type: 'full' | 'incremental';
  startedAt?: Date;
  completedAt?: Date;
  stats: SyncStats;
  errors: SyncError[];
  createdAt: Date;
}

export interface SyncStats {
  usersProcessed: number;
  usersCreated: number;
  usersUpdated: number;
  usersDeactivated: number;
  usersSkipped: number;
  groupsProcessed: number;
  groupsCreated: number;
  groupsUpdated: number;
  groupsDeleted: number;
  membershipsUpdated: number;
  rolesAssigned: number;
  duration: number;
}

export interface SyncError {
  timestamp: Date;
  type: 'user' | 'group' | 'membership' | 'role';
  entityId?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SyncDelta {
  users: {
    create: Array<{ externalId: string; email: string; data: Record<string, unknown> }>;
    update: Array<{ id: string; externalId: string; changes: Record<string, unknown> }>;
    deactivate: Array<{ id: string; externalId: string }>;
  };
  groups: {
    create: Array<{ externalId: string; name: string; data: Record<string, unknown> }>;
    update: Array<{ id: string; externalId: string; changes: Record<string, unknown> }>;
    delete: Array<{ id: string; externalId: string }>;
  };
  memberships: {
    add: Array<{ userId: string; groupId: string }>;
    remove: Array<{ userId: string; groupId: string }>;
  };
}

// -----------------------------------------------------------------------------
// Directory Sync Service
// -----------------------------------------------------------------------------

export class DirectorySyncService {
  private prisma: PrismaClient;
  private scimService: ScimService;
  private roleMappingService: RoleMappingService;
  private runningJobs: Map<string, boolean> = new Map();

  constructor(prisma: PrismaClient, baseUrl: string) {
    this.prisma = prisma;
    // ScimService needs organizationId per call
    this.scimService = new ScimService(prisma, baseUrl, '');
    this.roleMappingService = new RoleMappingService(prisma);
  }

  // ---------------------------------------------------------------------------
  // Configuration Management
  // ---------------------------------------------------------------------------

  async createConfig(
    organizationId: string,
    config: Omit<DirectorySyncConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<DirectorySyncConfig> {
    const id = crypto.randomUUID();

    const created = await this.prisma.directorySyncConfig.create({
      data: {
        id,
        organizationId,
        name: config.name,
        sourceType: config.sourceType,
        sourceConfig: config.sourceConfig as object,
        syncUsers: config.syncUsers,
        syncGroups: config.syncGroups,
        syncRoles: config.syncRoles,
        scheduleEnabled: config.scheduleEnabled,
        scheduleInterval: config.scheduleInterval,
        scheduleCron: config.scheduleCron,
        userFilter: config.userFilter,
        groupFilter: config.groupFilter,
        enabled: config.enabled,
      },
    });

    return this.mapToConfig(created);
  }

  async getConfig(id: string): Promise<DirectorySyncConfig | null> {
    const config = await this.prisma.directorySyncConfig.findUnique({
      where: { id },
    });

    return config ? this.mapToConfig(config) : null;
  }

  async getConfigs(organizationId: string): Promise<DirectorySyncConfig[]> {
    const configs = await this.prisma.directorySyncConfig.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return configs.map((c) => this.mapToConfig(c));
  }

  async updateConfig(
    id: string,
    updates: Partial<DirectorySyncConfig>
  ): Promise<DirectorySyncConfig> {
    const updated = await this.prisma.directorySyncConfig.update({
      where: { id },
      data: {
        name: updates.name,
        sourceConfig: updates.sourceConfig as object,
        syncUsers: updates.syncUsers,
        syncGroups: updates.syncGroups,
        syncRoles: updates.syncRoles,
        scheduleEnabled: updates.scheduleEnabled,
        scheduleInterval: updates.scheduleInterval,
        scheduleCron: updates.scheduleCron,
        userFilter: updates.userFilter,
        groupFilter: updates.groupFilter,
        enabled: updates.enabled,
      },
    });

    return this.mapToConfig(updated);
  }

  async deleteConfig(id: string): Promise<void> {
    await this.prisma.directorySyncConfig.delete({
      where: { id },
    });
  }

  // ---------------------------------------------------------------------------
  // Sync Job Execution
  // ---------------------------------------------------------------------------

  async startSync(
    configId: string,
    type: 'full' | 'incremental' = 'incremental'
  ): Promise<SyncJob> {
    const config = await this.getConfig(configId);
    if (!config) {
      throw new Error('Sync configuration not found');
    }

    if (!config.enabled) {
      throw new Error('Sync configuration is disabled');
    }

    // Check if already running
    if (this.runningJobs.get(configId)) {
      throw new Error('Sync job already running for this configuration');
    }

    // Create job record
    const jobId = crypto.randomUUID();
    const job = await this.prisma.directorySyncJob.create({
      data: {
        id: jobId,
        configId,
        organizationId: config.organizationId,
        status: 'pending',
        type,
        stats: {
          usersProcessed: 0,
          usersCreated: 0,
          usersUpdated: 0,
          usersDeactivated: 0,
          usersSkipped: 0,
          groupsProcessed: 0,
          groupsCreated: 0,
          groupsUpdated: 0,
          groupsDeleted: 0,
          membershipsUpdated: 0,
          rolesAssigned: 0,
          duration: 0,
        },
        errors: [],
      },
    });

    // Start sync in background
    this.executeSync(config, job.id, type).catch(console.error);

    return this.mapToJob(job);
  }

  private async executeSync(
    config: DirectorySyncConfig,
    jobId: string,
    type: 'full' | 'incremental'
  ): Promise<void> {
    const startTime = Date.now();
    this.runningJobs.set(config.id, true);

    const stats: SyncStats = {
      usersProcessed: 0,
      usersCreated: 0,
      usersUpdated: 0,
      usersDeactivated: 0,
      usersSkipped: 0,
      groupsProcessed: 0,
      groupsCreated: 0,
      groupsUpdated: 0,
      groupsDeleted: 0,
      membershipsUpdated: 0,
      rolesAssigned: 0,
      duration: 0,
    };
    const errors: SyncError[] = [];

    try {
      // Update job to running
      await this.prisma.directorySyncJob.update({
        where: { id: jobId },
        data: {
          status: 'running',
          startedAt: new Date(),
        },
      });

      // Fetch data from source
      const delta = await this.fetchDelta(config, type);

      // Process users
      if (config.syncUsers) {
        await this.processUsers(config, delta.users, stats, errors);
      }

      // Process groups
      if (config.syncGroups) {
        await this.processGroups(config, delta.groups, stats, errors);
        await this.processMemberships(config, delta.memberships, stats, errors);
      }

      // Process role mappings
      if (config.syncRoles) {
        await this.processRoles(config, stats, errors);
      }

      // Update job status
      stats.duration = Date.now() - startTime;
      const finalStatus = errors.length > 0 ? 'partial' : 'completed';

      await this.prisma.directorySyncJob.update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          stats: stats as object,
          errors: errors as object[],
        },
      });

      // Update config with last sync info
      await this.prisma.directorySyncConfig.update({
        where: { id: config.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: finalStatus === 'partial' ? 'partial' : 'success',
          lastSyncError: errors.length > 0 ? errors[0].message : null,
        },
      });
    } catch (error) {
      stats.duration = Date.now() - startTime;

      await this.prisma.directorySyncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          stats: stats as object,
          errors: [
            ...errors,
            {
              timestamp: new Date(),
              type: 'user',
              message: (error as Error).message,
            },
          ] as object[],
        },
      });

      await this.prisma.directorySyncConfig.update({
        where: { id: config.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'failed',
          lastSyncError: (error as Error).message,
        },
      });
    } finally {
      this.runningJobs.delete(config.id);
    }
  }

  private async fetchDelta(
    config: DirectorySyncConfig,
    type: 'full' | 'incremental'
  ): Promise<SyncDelta> {
    // Initialize SCIM service for this organization
    const scim = new ScimService(
      this.prisma,
      (config.sourceConfig as { baseUrl?: string }).baseUrl || '',
      config.organizationId
    );

    const delta: SyncDelta = {
      users: { create: [], update: [], deactivate: [] },
      groups: { create: [], update: [], delete: [] },
      memberships: { add: [], remove: [] },
    };

    // Fetch users from directory
    const existingUsers = await this.prisma.user.findMany({
      where: {
        organizationId: config.organizationId,
        ssoExternalId: { not: null },
      },
      select: {
        id: true,
        ssoExternalId: true,
        email: true,
        updatedAt: true,
      },
    });

    const existingUserMap = new Map(
      existingUsers.map((u) => [u.ssoExternalId, u])
    );

    // For incremental sync, only get changes since last sync
    const filter = type === 'incremental' && config.lastSyncAt
      ? `meta.lastModified gt "${config.lastSyncAt.toISOString()}"`
      : config.userFilter;

    // Fetch from SCIM endpoint
    const scimUsers = await scim.getUsers(filter);

    for (const scimUser of scimUsers.Resources || []) {
      const existing = existingUserMap.get(scimUser.id);

      if (!existing) {
        delta.users.create.push({
          externalId: scimUser.id,
          email: scimUser.emails?.[0]?.value || '',
          data: scimUser as Record<string, unknown>,
        });
      } else {
        delta.users.update.push({
          id: existing.id,
          externalId: scimUser.id,
          changes: scimUser as Record<string, unknown>,
        });
      }
    }

    // For full sync, deactivate users not in directory
    if (type === 'full') {
      const scimUserIds = new Set(
        (scimUsers.Resources || []).map((u) => u.id)
      );
      for (const [externalId, user] of existingUserMap) {
        if (!scimUserIds.has(externalId || '')) {
          delta.users.deactivate.push({
            id: user.id,
            externalId: externalId || '',
          });
        }
      }
    }

    // Fetch groups
    if (config.syncGroups) {
      const existingGroups = await this.prisma.group.findMany({
        where: {
          organizationId: config.organizationId,
          ssoExternalId: { not: null },
        },
        select: {
          id: true,
          ssoExternalId: true,
          name: true,
        },
      });

      const existingGroupMap = new Map(
        existingGroups.map((g) => [g.ssoExternalId, g])
      );

      const scimGroups = await scim.getGroups(config.groupFilter);

      for (const scimGroup of scimGroups.Resources || []) {
        const existing = existingGroupMap.get(scimGroup.id);

        if (!existing) {
          delta.groups.create.push({
            externalId: scimGroup.id,
            name: scimGroup.displayName,
            data: scimGroup as Record<string, unknown>,
          });
        } else {
          delta.groups.update.push({
            id: existing.id,
            externalId: scimGroup.id,
            changes: scimGroup as Record<string, unknown>,
          });
        }
      }
    }

    return delta;
  }

  private async processUsers(
    config: DirectorySyncConfig,
    users: SyncDelta['users'],
    stats: SyncStats,
    errors: SyncError[]
  ): Promise<void> {
    // Create new users
    for (const user of users.create) {
      try {
        stats.usersProcessed++;
        await this.prisma.user.create({
          data: {
            id: crypto.randomUUID(),
            organizationId: config.organizationId,
            email: user.email,
            ssoExternalId: user.externalId,
            ssoProvider: config.sourceType,
            ssoGroups: (user.data as { groups?: Array<{ value: string }> }).groups?.map((g) => g.value) || [],
            ssoAttributes: user.data,
            status: 'ACTIVE',
          },
        });
        stats.usersCreated++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'user',
          entityId: user.externalId,
          message: `Failed to create user: ${(error as Error).message}`,
        });
      }
    }

    // Update existing users
    for (const user of users.update) {
      try {
        stats.usersProcessed++;
        const data = user.changes as {
          name?: { givenName?: string; familyName?: string };
          emails?: Array<{ value: string }>;
          groups?: Array<{ value: string }>;
          active?: boolean;
        };

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            firstName: data.name?.givenName,
            lastName: data.name?.familyName,
            email: data.emails?.[0]?.value,
            ssoGroups: data.groups?.map((g) => g.value) || [],
            ssoAttributes: user.changes,
            status: data.active === false ? 'INACTIVE' : 'ACTIVE',
          },
        });
        stats.usersUpdated++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'user',
          entityId: user.externalId,
          message: `Failed to update user: ${(error as Error).message}`,
        });
      }
    }

    // Deactivate removed users
    for (const user of users.deactivate) {
      try {
        stats.usersProcessed++;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { status: 'INACTIVE' },
        });
        stats.usersDeactivated++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'user',
          entityId: user.externalId,
          message: `Failed to deactivate user: ${(error as Error).message}`,
        });
      }
    }
  }

  private async processGroups(
    config: DirectorySyncConfig,
    groups: SyncDelta['groups'],
    stats: SyncStats,
    errors: SyncError[]
  ): Promise<void> {
    // Create new groups
    for (const group of groups.create) {
      try {
        stats.groupsProcessed++;
        await this.prisma.group.create({
          data: {
            id: crypto.randomUUID(),
            organizationId: config.organizationId,
            name: group.name,
            ssoExternalId: group.externalId,
            ssoProvider: config.sourceType,
            ssoAttributes: group.data,
          },
        });
        stats.groupsCreated++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'group',
          entityId: group.externalId,
          message: `Failed to create group: ${(error as Error).message}`,
        });
      }
    }

    // Update existing groups
    for (const group of groups.update) {
      try {
        stats.groupsProcessed++;
        const data = group.changes as { displayName?: string };
        await this.prisma.group.update({
          where: { id: group.id },
          data: {
            name: data.displayName,
            ssoAttributes: group.changes,
          },
        });
        stats.groupsUpdated++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'group',
          entityId: group.externalId,
          message: `Failed to update group: ${(error as Error).message}`,
        });
      }
    }

    // Delete removed groups
    for (const group of groups.delete) {
      try {
        stats.groupsProcessed++;
        await this.prisma.group.delete({
          where: { id: group.id },
        });
        stats.groupsDeleted++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'group',
          entityId: group.externalId,
          message: `Failed to delete group: ${(error as Error).message}`,
        });
      }
    }
  }

  private async processMemberships(
    _config: DirectorySyncConfig,
    memberships: SyncDelta['memberships'],
    stats: SyncStats,
    errors: SyncError[]
  ): Promise<void> {
    // Add memberships
    for (const membership of memberships.add) {
      try {
        await this.prisma.groupMembership.upsert({
          where: {
            userId_groupId: {
              userId: membership.userId,
              groupId: membership.groupId,
            },
          },
          create: {
            id: crypto.randomUUID(),
            userId: membership.userId,
            groupId: membership.groupId,
          },
          update: {},
        });
        stats.membershipsUpdated++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'membership',
          message: `Failed to add membership: ${(error as Error).message}`,
          details: { userId: membership.userId, groupId: membership.groupId },
        });
      }
    }

    // Remove memberships
    for (const membership of memberships.remove) {
      try {
        await this.prisma.groupMembership.deleteMany({
          where: {
            userId: membership.userId,
            groupId: membership.groupId,
          },
        });
        stats.membershipsUpdated++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'membership',
          message: `Failed to remove membership: ${(error as Error).message}`,
          details: { userId: membership.userId, groupId: membership.groupId },
        });
      }
    }
  }

  private async processRoles(
    config: DirectorySyncConfig,
    stats: SyncStats,
    errors: SyncError[]
  ): Promise<void> {
    // Get all SSO users
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: config.organizationId,
        ssoExternalId: { not: null },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        ssoGroups: true,
        ssoRoles: true,
        ssoAttributes: true,
      },
    });

    for (const user of users) {
      try {
        await this.roleMappingService.assignRolesToUser(
          user.id,
          config.organizationId,
          {
            groups: (user.ssoGroups as string[]) || [],
            roles: (user.ssoRoles as string[]) || [],
            attributes: (user.ssoAttributes as Record<string, string | string[]>) || {},
          }
        );
        stats.rolesAssigned++;
      } catch (error) {
        errors.push({
          timestamp: new Date(),
          type: 'role',
          entityId: user.id,
          message: `Failed to assign roles: ${(error as Error).message}`,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Job Management
  // ---------------------------------------------------------------------------

  async getJob(jobId: string): Promise<SyncJob | null> {
    const job = await this.prisma.directorySyncJob.findUnique({
      where: { id: jobId },
    });

    return job ? this.mapToJob(job) : null;
  }

  async getJobs(
    configId: string,
    limit: number = 10
  ): Promise<SyncJob[]> {
    const jobs = await this.prisma.directorySyncJob.findMany({
      where: { configId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return jobs.map((j) => this.mapToJob(j));
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'running' && job.status !== 'pending') {
      throw new Error('Job is not running');
    }

    // Mark as cancelled (running job will check this)
    await this.prisma.directorySyncJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    });

    // Remove from running jobs
    this.runningJobs.delete(job.configId);
  }

  // ---------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------

  async checkScheduledSyncs(): Promise<void> {
    const configs = await this.prisma.directorySyncConfig.findMany({
      where: {
        enabled: true,
        scheduleEnabled: true,
      },
    });

    const now = new Date();

    for (const config of configs) {
      // Skip if already running
      if (this.runningJobs.get(config.id)) {
        continue;
      }

      // Check if due for sync
      const lastSync = config.lastSyncAt;
      const interval = config.scheduleInterval * 60 * 1000; // Convert minutes to ms

      if (!lastSync || now.getTime() - lastSync.getTime() >= interval) {
        try {
          await this.startSync(config.id, 'incremental');
        } catch (error) {
          console.error(`Failed to start scheduled sync for ${config.id}:`, error);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapToConfig(record: {
    id: string;
    organizationId: string;
    name: string;
    sourceType: string;
    sourceConfig: unknown;
    syncUsers: boolean;
    syncGroups: boolean;
    syncRoles: boolean;
    scheduleEnabled: boolean;
    scheduleInterval: number;
    scheduleCron: string | null;
    userFilter: string | null;
    groupFilter: string | null;
    enabled: boolean;
    lastSyncAt: Date | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): DirectorySyncConfig {
    return {
      id: record.id,
      organizationId: record.organizationId,
      name: record.name,
      sourceType: record.sourceType as DirectorySyncConfig['sourceType'],
      sourceConfig: record.sourceConfig as Record<string, unknown>,
      syncUsers: record.syncUsers,
      syncGroups: record.syncGroups,
      syncRoles: record.syncRoles,
      scheduleEnabled: record.scheduleEnabled,
      scheduleInterval: record.scheduleInterval,
      scheduleCron: record.scheduleCron || undefined,
      userFilter: record.userFilter || undefined,
      groupFilter: record.groupFilter || undefined,
      enabled: record.enabled,
      lastSyncAt: record.lastSyncAt || undefined,
      lastSyncStatus: record.lastSyncStatus as DirectorySyncConfig['lastSyncStatus'],
      lastSyncError: record.lastSyncError || undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private mapToJob(record: {
    id: string;
    configId: string;
    organizationId: string;
    status: string;
    type: string;
    startedAt: Date | null;
    completedAt: Date | null;
    stats: unknown;
    errors: unknown;
    createdAt: Date;
  }): SyncJob {
    return {
      id: record.id,
      configId: record.configId,
      organizationId: record.organizationId,
      status: record.status as SyncJob['status'],
      type: record.type as SyncJob['type'],
      startedAt: record.startedAt || undefined,
      completedAt: record.completedAt || undefined,
      stats: record.stats as SyncStats,
      errors: record.errors as SyncError[],
      createdAt: record.createdAt,
    };
  }
}
