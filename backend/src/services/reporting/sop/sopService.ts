/**
 * SOP Service
 * CRUD operations and business logic for Standard Operating Procedures
 */

import { PrismaClient, SOP, SOPVersion } from '@prisma/client';

export type SOPStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';

export interface CreateSOPInput {
  processId: string;
  title: string;
  content: string;
  language?: string;
  status?: SOPStatus;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSOPInput {
  title?: string;
  content?: string;
  status?: SOPStatus;
  metadata?: Record<string, unknown>;
  updatedBy: string;
  changeNotes?: string;
}

export interface SOPQueryOptions {
  processIds?: string[];
  statuses?: SOPStatus[];
  languages?: string[];
  createdBy?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface SOPWithVersions extends SOP {
  versions: SOPVersion[];
  process?: {
    id: string;
    name: string;
  };
  creator?: {
    id: string;
    name: string;
  };
}

export class SOPService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Create a new SOP
   */
  async createSOP(organizationId: string, input: CreateSOPInput): Promise<SOP> {
    const version = this.generateVersion();

    const sop = await this.prisma.sOP.create({
      data: {
        organizationId,
        processId: input.processId,
        title: input.title,
        content: input.content,
        version,
        language: input.language || 'en',
        status: input.status || 'draft',
        generatedBy: input.createdBy,
        metadata: input.metadata || {},
      },
    });

    // Create initial version record
    await this.prisma.sOPVersion.create({
      data: {
        sopId: sop.id,
        version,
        content: input.content,
        createdBy: input.createdBy,
        changeNotes: 'Initial creation',
      },
    });

    return sop;
  }

  /**
   * Get SOP by ID
   */
  async getSOP(
    organizationId: string,
    sopId: string,
    includeVersions = false
  ): Promise<SOPWithVersions | null> {
    const sop = await this.prisma.sOP.findFirst({
      where: {
        id: sopId,
        organizationId,
      },
      include: {
        versions: includeVersions
          ? {
              orderBy: { createdAt: 'desc' },
            }
          : false,
        process: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return sop as SOPWithVersions | null;
  }

  /**
   * Query SOPs with filtering
   */
  async querySOPs(
    organizationId: string,
    options: SOPQueryOptions = {}
  ): Promise<{ data: SOP[]; total: number }> {
    const {
      processIds,
      statuses,
      languages,
      createdBy,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = options;

    const where: Record<string, unknown> = {
      organizationId,
    };

    if (processIds && processIds.length > 0) {
      where.processId = { in: processIds };
    }

    if (statuses && statuses.length > 0) {
      where.status = { in: statuses };
    }

    if (languages && languages.length > 0) {
      where.language = { in: languages };
    }

    if (createdBy) {
      where.generatedBy = createdBy;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.sOP.findMany({
        where,
        include: {
          process: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.sOP.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Update an SOP
   */
  async updateSOP(
    organizationId: string,
    sopId: string,
    input: UpdateSOPInput
  ): Promise<SOP> {
    // Get current SOP
    const currentSOP = await this.getSOP(organizationId, sopId);
    if (!currentSOP) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    // Determine if content changed (needs new version)
    const contentChanged = input.content && input.content !== currentSOP.content;
    const newVersion = contentChanged
      ? this.incrementVersion(currentSOP.version)
      : currentSOP.version;

    // Update SOP
    const sop = await this.prisma.sOP.update({
      where: { id: sopId },
      data: {
        title: input.title,
        content: input.content,
        status: input.status,
        version: newVersion,
        metadata: input.metadata
          ? { ...(currentSOP.metadata as Record<string, unknown>), ...input.metadata }
          : undefined,
        updatedAt: new Date(),
      },
    });

    // Create version record if content changed
    if (contentChanged && input.content) {
      await this.prisma.sOPVersion.create({
        data: {
          sopId: sop.id,
          version: newVersion,
          content: input.content,
          createdBy: input.updatedBy,
          changeNotes: input.changeNotes || 'Content updated',
        },
      });
    }

    return sop;
  }

  /**
   * Delete an SOP
   */
  async deleteSOP(organizationId: string, sopId: string): Promise<void> {
    const sop = await this.getSOP(organizationId, sopId);
    if (!sop) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    // Delete versions first
    await this.prisma.sOPVersion.deleteMany({
      where: { sopId },
    });

    // Delete SOP
    await this.prisma.sOP.delete({
      where: { id: sopId },
    });
  }

  /**
   * Get SOP versions
   */
  async getSOPVersions(organizationId: string, sopId: string): Promise<SOPVersion[]> {
    const sop = await this.getSOP(organizationId, sopId);
    if (!sop) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    return this.prisma.sOPVersion.findMany({
      where: { sopId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get specific version
   */
  async getSOPVersion(
    organizationId: string,
    sopId: string,
    versionId: string
  ): Promise<SOPVersion | null> {
    const sop = await this.getSOP(organizationId, sopId);
    if (!sop) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    return this.prisma.sOPVersion.findFirst({
      where: {
        id: versionId,
        sopId,
      },
    });
  }

  /**
   * Restore a previous version
   */
  async restoreVersion(
    organizationId: string,
    sopId: string,
    versionId: string,
    restoredBy: string
  ): Promise<SOP> {
    const version = await this.getSOPVersion(organizationId, sopId, versionId);
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }

    return this.updateSOP(organizationId, sopId, {
      content: version.content,
      updatedBy: restoredBy,
      changeNotes: `Restored from version ${version.version}`,
    });
  }

  /**
   * Update SOP status
   */
  async updateStatus(
    organizationId: string,
    sopId: string,
    status: SOPStatus,
    updatedBy: string
  ): Promise<SOP> {
    const sop = await this.getSOP(organizationId, sopId);
    if (!sop) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    // Validate status transition
    this.validateStatusTransition(sop.status as SOPStatus, status);

    return this.prisma.sOP.update({
      where: { id: sopId },
      data: {
        status,
        updatedAt: new Date(),
        metadata: {
          ...(sop.metadata as Record<string, unknown>),
          lastStatusChange: {
            from: sop.status,
            to: status,
            at: new Date().toISOString(),
            by: updatedBy,
          },
        },
      },
    });
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(from: SOPStatus, to: SOPStatus): void {
    const validTransitions: Record<SOPStatus, SOPStatus[]> = {
      draft: ['review', 'archived'],
      review: ['draft', 'approved', 'archived'],
      approved: ['review', 'published', 'archived'],
      published: ['review', 'archived'],
      archived: ['draft'],
    };

    if (!validTransitions[from].includes(to)) {
      throw new Error(`Invalid status transition from '${from}' to '${to}'`);
    }
  }

  /**
   * Generate initial version string
   */
  private generateVersion(): string {
    const now = new Date();
    return `1.0.${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  /**
   * Increment version string
   */
  private incrementVersion(currentVersion: string): string {
    const parts = currentVersion.split('.');
    if (parts.length >= 2) {
      const minor = parseInt(parts[1], 10) || 0;
      parts[1] = String(minor + 1);
    }
    return parts.join('.');
  }

  /**
   * Get SOP statistics for organization
   */
  async getSOPStats(organizationId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byLanguage: Record<string, number>;
    avgConfidence: number;
    recentlyUpdated: number;
  }> {
    const [total, byStatus, byLanguage, avgConfidence, recentlyUpdated] = await Promise.all([
      this.prisma.sOP.count({ where: { organizationId } }),
      this.prisma.sOP.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { status: true },
      }),
      this.prisma.sOP.groupBy({
        by: ['language'],
        where: { organizationId },
        _count: { language: true },
      }),
      this.prisma.sOP.aggregate({
        where: { organizationId },
        _avg: { confidence: true },
      }),
      this.prisma.sOP.count({
        where: {
          organizationId,
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);

    return {
      total,
      byStatus: Object.fromEntries(
        byStatus.map((s) => [s.status, s._count.status])
      ),
      byLanguage: Object.fromEntries(
        byLanguage.map((l) => [l.language, l._count.language])
      ),
      avgConfidence: avgConfidence._avg.confidence || 0,
      recentlyUpdated,
    };
  }
}

// Factory function
let serviceInstance: SOPService | null = null;

export function createSOPService(prisma?: PrismaClient): SOPService {
  if (!serviceInstance) {
    serviceInstance = new SOPService(prisma);
  }
  return serviceInstance;
}

export function resetSOPService(): void {
  serviceInstance = null;
}

export default SOPService;
