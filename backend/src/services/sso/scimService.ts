// =============================================================================
// SCIM Service
// SCALE Tier - Task T280-T295
//
// SCIM 2.0 User Provisioning service for enterprise directory sync
// =============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ScimUser {
  schemas: string[];
  id?: string;
  externalId?: string;
  userName: string;
  name?: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
  };
  displayName?: string;
  emails?: Array<{
    value: string;
    type?: string;
    primary?: boolean;
  }>;
  active?: boolean;
  groups?: Array<{
    value: string;
    display?: string;
    $ref?: string;
  }>;
  roles?: Array<{
    value: string;
    display?: string;
    type?: string;
  }>;
  meta?: {
    resourceType: string;
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

export interface ScimGroup {
  schemas: string[];
  id?: string;
  externalId?: string;
  displayName: string;
  members?: Array<{
    value: string;
    display?: string;
    $ref?: string;
  }>;
  meta?: {
    resourceType: string;
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

export interface ScimError {
  schemas: string[];
  status: string;
  scimType?: string;
  detail: string;
}

export interface ScimSyncLog {
  id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  resourceType: 'USER' | 'GROUP';
  externalId: string;
  internalId?: string;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
}

// -----------------------------------------------------------------------------
// SCIM Service
// -----------------------------------------------------------------------------

export class ScimService {
  private prisma: PrismaClient;
  private baseUrl: string;
  private organizationId: string;

  constructor(prisma: PrismaClient, baseUrl: string, organizationId: string) {
    this.prisma = prisma;
    this.baseUrl = baseUrl;
    this.organizationId = organizationId;
  }

  // ---------------------------------------------------------------------------
  // User Operations
  // ---------------------------------------------------------------------------

  async getUsers(
    filter?: string,
    startIndex: number = 1,
    count: number = 100
  ): Promise<ScimListResponse<ScimUser>> {
    // Parse filter (simplified - supports "userName eq 'value'" and "externalId eq 'value'")
    let where: Record<string, unknown> = {
      organizationId: this.organizationId,
    };

    if (filter) {
      const eqMatch = filter.match(/(\w+)\s+eq\s+"([^"]+)"/);
      if (eqMatch) {
        const [, field, value] = eqMatch;
        if (field === 'userName') {
          where.email = value;
        } else if (field === 'externalId') {
          where.externalId = value;
        }
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: startIndex - 1,
        take: count,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map((u) => this.mapUserToScim(u)),
    };
  }

  async getUser(id: string): Promise<ScimUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });

    return user ? this.mapUserToScim(user) : null;
  }

  async createUser(scimUser: ScimUser): Promise<ScimUser> {
    const email = scimUser.emails?.find((e) => e.primary)?.value || scimUser.userName;

    // Check if user already exists
    const existing = await this.prisma.user.findFirst({
      where: {
        email,
        organizationId: this.organizationId,
      },
    });

    if (existing) {
      throw this.createScimError(
        '409',
        'uniqueness',
        `User with email ${email} already exists`
      );
    }

    const user = await this.prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        firstName: scimUser.name?.givenName || '',
        lastName: scimUser.name?.familyName || '',
        displayName: scimUser.displayName,
        externalId: scimUser.externalId,
        active: scimUser.active ?? true,
        organizationId: this.organizationId,
        ssoProvided: true,
      },
    });

    // Log the sync operation
    await this.logSync('CREATE', 'USER', scimUser.externalId || email, user.id, true);

    return this.mapUserToScim(user);
  }

  async updateUser(id: string, scimUser: ScimUser): Promise<ScimUser | null> {
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });

    if (!existing) {
      return null;
    }

    const email = scimUser.emails?.find((e) => e.primary)?.value || scimUser.userName;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email,
        firstName: scimUser.name?.givenName,
        lastName: scimUser.name?.familyName,
        displayName: scimUser.displayName,
        externalId: scimUser.externalId,
        active: scimUser.active,
      },
    });

    await this.logSync('UPDATE', 'USER', scimUser.externalId || email, user.id, true);

    return this.mapUserToScim(user);
  }

  async patchUser(
    id: string,
    operations: ScimPatchOperation[]
  ): Promise<ScimUser | null> {
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });

    if (!existing) {
      return null;
    }

    const updates: Record<string, unknown> = {};

    for (const op of operations) {
      if (op.op === 'replace' || op.op === 'add') {
        switch (op.path) {
          case 'active':
            updates.active = op.value as boolean;
            break;
          case 'userName':
            updates.email = op.value as string;
            break;
          case 'name.givenName':
            updates.firstName = op.value as string;
            break;
          case 'name.familyName':
            updates.lastName = op.value as string;
            break;
          case 'displayName':
            updates.displayName = op.value as string;
            break;
        }
      } else if (op.op === 'remove') {
        switch (op.path) {
          case 'displayName':
            updates.displayName = null;
            break;
        }
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updates,
    });

    await this.logSync('UPDATE', 'USER', existing.externalId || existing.email, user.id, true);

    return this.mapUserToScim(user);
  }

  async deleteUser(id: string): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });

    if (!existing) {
      return false;
    }

    // Soft delete - deactivate instead of removing
    await this.prisma.user.update({
      where: { id },
      data: {
        active: false,
        deletedAt: new Date(),
      },
    });

    await this.logSync('DELETE', 'USER', existing.externalId || existing.email, id, true);

    return true;
  }

  // ---------------------------------------------------------------------------
  // Group Operations
  // ---------------------------------------------------------------------------

  async getGroups(
    filter?: string,
    startIndex: number = 1,
    count: number = 100
  ): Promise<ScimListResponse<ScimGroup>> {
    let where: Record<string, unknown> = {
      organizationId: this.organizationId,
    };

    if (filter) {
      const eqMatch = filter.match(/displayName\s+eq\s+"([^"]+)"/);
      if (eqMatch) {
        where.name = eqMatch[1];
      }
    }

    const [groups, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        skip: startIndex - 1,
        take: count,
        include: {
          members: {
            include: { user: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.group.count({ where }),
    ]);

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex,
      itemsPerPage: groups.length,
      Resources: groups.map((g) => this.mapGroupToScim(g)),
    };
  }

  async getGroup(id: string): Promise<ScimGroup | null> {
    const group = await this.prisma.group.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    return group ? this.mapGroupToScim(group) : null;
  }

  async createGroup(scimGroup: ScimGroup): Promise<ScimGroup> {
    const existing = await this.prisma.group.findFirst({
      where: {
        name: scimGroup.displayName,
        organizationId: this.organizationId,
      },
    });

    if (existing) {
      throw this.createScimError(
        '409',
        'uniqueness',
        `Group with name ${scimGroup.displayName} already exists`
      );
    }

    const group = await this.prisma.group.create({
      data: {
        id: crypto.randomUUID(),
        name: scimGroup.displayName,
        externalId: scimGroup.externalId,
        organizationId: this.organizationId,
      },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    // Add members if provided
    if (scimGroup.members && scimGroup.members.length > 0) {
      for (const member of scimGroup.members) {
        await this.prisma.groupMember.create({
          data: {
            groupId: group.id,
            userId: member.value,
          },
        });
      }
    }

    await this.logSync('CREATE', 'GROUP', scimGroup.externalId || scimGroup.displayName, group.id, true);

    return this.mapGroupToScim(group);
  }

  async updateGroup(id: string, scimGroup: ScimGroup): Promise<ScimGroup | null> {
    const existing = await this.prisma.group.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });

    if (!existing) {
      return null;
    }

    // Update group
    const group = await this.prisma.group.update({
      where: { id },
      data: {
        name: scimGroup.displayName,
        externalId: scimGroup.externalId,
      },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    // Sync members
    if (scimGroup.members !== undefined) {
      // Remove all existing members
      await this.prisma.groupMember.deleteMany({
        where: { groupId: id },
      });

      // Add new members
      for (const member of scimGroup.members) {
        await this.prisma.groupMember.create({
          data: {
            groupId: id,
            userId: member.value,
          },
        });
      }
    }

    await this.logSync('UPDATE', 'GROUP', scimGroup.externalId || scimGroup.displayName, group.id, true);

    return this.mapGroupToScim(group);
  }

  async patchGroup(
    id: string,
    operations: ScimPatchOperation[]
  ): Promise<ScimGroup | null> {
    const existing = await this.prisma.group.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
      include: {
        members: true,
      },
    });

    if (!existing) {
      return null;
    }

    for (const op of operations) {
      if (op.path === 'members') {
        const members = op.value as Array<{ value: string }>;

        if (op.op === 'add') {
          for (const member of members) {
            await this.prisma.groupMember.upsert({
              where: {
                groupId_userId: {
                  groupId: id,
                  userId: member.value,
                },
              },
              update: {},
              create: {
                groupId: id,
                userId: member.value,
              },
            });
          }
        } else if (op.op === 'remove') {
          for (const member of members) {
            await this.prisma.groupMember.deleteMany({
              where: {
                groupId: id,
                userId: member.value,
              },
            });
          }
        } else if (op.op === 'replace') {
          await this.prisma.groupMember.deleteMany({
            where: { groupId: id },
          });
          for (const member of members) {
            await this.prisma.groupMember.create({
              data: {
                groupId: id,
                userId: member.value,
              },
            });
          }
        }
      } else if (op.path === 'displayName' && (op.op === 'replace' || op.op === 'add')) {
        await this.prisma.group.update({
          where: { id },
          data: { name: op.value as string },
        });
      }
    }

    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    if (!group) return null;

    await this.logSync('UPDATE', 'GROUP', existing.externalId || existing.name, group.id, true);

    return this.mapGroupToScim(group);
  }

  async deleteGroup(id: string): Promise<boolean> {
    const existing = await this.prisma.group.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });

    if (!existing) {
      return false;
    }

    // Delete group members first
    await this.prisma.groupMember.deleteMany({
      where: { groupId: id },
    });

    // Delete group
    await this.prisma.group.delete({
      where: { id },
    });

    await this.logSync('DELETE', 'GROUP', existing.externalId || existing.name, id, true);

    return true;
  }

  // ---------------------------------------------------------------------------
  // Sync Logging
  // ---------------------------------------------------------------------------

  private async logSync(
    operation: ScimSyncLog['operation'],
    resourceType: ScimSyncLog['resourceType'],
    externalId: string,
    internalId: string | undefined,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    await this.prisma.scimSyncLog.create({
      data: {
        id: crypto.randomUUID(),
        operation,
        resourceType,
        externalId,
        internalId,
        success,
        errorMessage,
        organizationId: this.organizationId,
      },
    });
  }

  async getSyncLogs(limit: number = 100): Promise<ScimSyncLog[]> {
    const logs = await this.prisma.scimSyncLog.findMany({
      where: { organizationId: this.organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map((l) => ({
      id: l.id,
      operation: l.operation as ScimSyncLog['operation'],
      resourceType: l.resourceType as ScimSyncLog['resourceType'],
      externalId: l.externalId,
      internalId: l.internalId || undefined,
      success: l.success,
      errorMessage: l.errorMessage || undefined,
      timestamp: l.createdAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapUserToScim(user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    externalId?: string | null;
    active?: boolean | null;
    createdAt: Date;
    updatedAt: Date;
  }): ScimUser {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      externalId: user.externalId || undefined,
      userName: user.email,
      name: {
        formatted: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        givenName: user.firstName || undefined,
        familyName: user.lastName || undefined,
      },
      displayName: user.displayName || undefined,
      emails: [
        {
          value: user.email,
          type: 'work',
          primary: true,
        },
      ],
      active: user.active ?? true,
      meta: {
        resourceType: 'User',
        created: user.createdAt.toISOString(),
        lastModified: user.updatedAt.toISOString(),
        location: `${this.baseUrl}/scim/v2/Users/${user.id}`,
      },
    };
  }

  private mapGroupToScim(group: {
    id: string;
    name: string;
    externalId?: string | null;
    createdAt: Date;
    updatedAt: Date;
    members?: Array<{
      user: {
        id: string;
        displayName?: string | null;
      };
    }>;
  }): ScimGroup {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: group.id,
      externalId: group.externalId || undefined,
      displayName: group.name,
      members: group.members?.map((m) => ({
        value: m.user.id,
        display: m.user.displayName || undefined,
        $ref: `${this.baseUrl}/scim/v2/Users/${m.user.id}`,
      })),
      meta: {
        resourceType: 'Group',
        created: group.createdAt.toISOString(),
        lastModified: group.updatedAt.toISOString(),
        location: `${this.baseUrl}/scim/v2/Groups/${group.id}`,
      },
    };
  }

  private createScimError(
    status: string,
    scimType: string,
    detail: string
  ): ScimError {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status,
      scimType,
      detail,
    };
  }
}
