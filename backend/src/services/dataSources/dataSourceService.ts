/**
 * DataSource Service
 * CRUD operations for data source management
 */

import { PrismaClient, DataSource, DataSourceType, DataSourceStatus } from '@prisma/client';
import { createAuditService, AuditActions } from '../audit/auditService.js';

export interface CreateDataSourceInput {
  type: DataSourceType;
  name: string;
  config?: Record<string, unknown>;
  syncSchedule?: string;
  organizationId: string;
}

export interface UpdateDataSourceInput {
  name?: string;
  config?: Record<string, unknown>;
  syncSchedule?: string;
  status?: DataSourceStatus;
}

export interface DataSourceFilters {
  type?: DataSourceType;
  status?: DataSourceStatus;
  search?: string;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: DataSourceFilters;
}

export class DataSourceService {
  private auditService;

  constructor(private prisma: PrismaClient) {
    this.auditService = createAuditService(prisma);
  }

  /**
   * Create a new data source
   */
  async create(
    input: CreateDataSourceInput,
    userId?: string
  ): Promise<DataSource> {
    const dataSource = await this.prisma.dataSource.create({
      data: {
        type: input.type,
        name: input.name,
        config: input.config || {},
        syncSchedule: input.syncSchedule,
        status: DataSourceStatus.PENDING,
        organizationId: input.organizationId,
      },
    });

    await this.auditService.log({
      action: AuditActions.DATASOURCE_CREATE,
      resourceType: 'DataSource',
      resourceId: dataSource.id,
      details: { type: input.type, name: input.name },
      userId,
      organizationId: input.organizationId,
    });

    return dataSource;
  }

  /**
   * Get a data source by ID
   */
  async getById(
    id: string,
    organizationId: string
  ): Promise<DataSource | null> {
    return this.prisma.dataSource.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  /**
   * Get a data source with recent sync jobs
   */
  async getWithJobs(
    id: string,
    organizationId: string,
    jobLimit = 10
  ) {
    return this.prisma.dataSource.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        syncJobs: {
          orderBy: { createdAt: 'desc' },
          take: jobLimit,
        },
      },
    });
  }

  /**
   * List data sources for an organization
   */
  async list(organizationId: string, options: ListOptions = {}) {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      filters = {},
    } = options;

    const where = {
      organizationId,
      ...(filters.type && { type: filters.type }),
      ...(filters.status && { status: filters.status }),
      ...(filters.search && {
        name: { contains: filters.search, mode: 'insensitive' as const },
      }),
    };

    const [dataSources, total] = await Promise.all([
      this.prisma.dataSource.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          syncJobs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.dataSource.count({ where }),
    ]);

    return {
      data: dataSources,
      meta: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Update a data source
   */
  async update(
    id: string,
    organizationId: string,
    input: UpdateDataSourceInput,
    userId?: string
  ): Promise<DataSource | null> {
    // Verify ownership
    const existing = await this.getById(id, organizationId);
    if (!existing) {
      return null;
    }

    const dataSource = await this.prisma.dataSource.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.config && { config: input.config }),
        ...(input.syncSchedule !== undefined && { syncSchedule: input.syncSchedule }),
        ...(input.status && { status: input.status }),
      },
    });

    await this.auditService.log({
      action: AuditActions.DATASOURCE_UPDATE,
      resourceType: 'DataSource',
      resourceId: id,
      details: { changes: input },
      userId,
      organizationId,
    });

    return dataSource;
  }

  /**
   * Update data source status
   */
  async updateStatus(
    id: string,
    status: DataSourceStatus,
    metadata?: Record<string, unknown>
  ): Promise<DataSource> {
    return this.prisma.dataSource.update({
      where: { id },
      data: {
        status,
        ...(metadata && { metadata }),
      },
    });
  }

  /**
   * Update sync information after a sync job
   */
  async updateSyncInfo(
    id: string,
    syncStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED',
    deltaToken?: string
  ): Promise<DataSource> {
    return this.prisma.dataSource.update({
      where: { id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: syncStatus,
        ...(deltaToken && { deltaToken }),
      },
    });
  }

  /**
   * Delete a data source
   */
  async delete(
    id: string,
    organizationId: string,
    userId?: string
  ): Promise<boolean> {
    // Verify ownership
    const existing = await this.getById(id, organizationId);
    if (!existing) {
      return false;
    }

    await this.prisma.dataSource.delete({
      where: { id },
    });

    await this.auditService.log({
      action: AuditActions.DATASOURCE_DELETE,
      resourceType: 'DataSource',
      resourceId: id,
      details: { type: existing.type, name: existing.name },
      userId,
      organizationId,
    });

    return true;
  }

  /**
   * Get data sources due for sync
   */
  async getDueForSync(): Promise<DataSource[]> {
    // Get connected data sources with a sync schedule
    return this.prisma.dataSource.findMany({
      where: {
        status: DataSourceStatus.CONNECTED,
        syncSchedule: { not: null },
      },
    });
  }

  /**
   * Count data sources by status for an organization
   */
  async countByStatus(organizationId: string) {
    const counts = await this.prisma.dataSource.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: true,
    });

    return counts.reduce(
      (acc, { status, _count }) => {
        acc[status] = _count;
        return acc;
      },
      {} as Record<DataSourceStatus, number>
    );
  }
}

// Factory function
let dataSourceServiceInstance: DataSourceService | null = null;

export function createDataSourceService(prisma: PrismaClient): DataSourceService {
  if (!dataSourceServiceInstance) {
    dataSourceServiceInstance = new DataSourceService(prisma);
  }
  return dataSourceServiceInstance;
}
