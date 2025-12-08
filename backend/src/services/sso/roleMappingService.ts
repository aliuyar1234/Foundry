// =============================================================================
// Role Mapping Service
// SCALE Tier - Task T271-T280
//
// Maps SSO groups/roles to application roles for enterprise SSO
// =============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RoleMapping {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  // Source (from IdP)
  sourceType: 'group' | 'role' | 'attribute';
  sourceValue: string;
  sourcePattern?: string; // Regex pattern for matching
  // Target (application role)
  targetRole: string;
  targetPermissions?: string[];
  // Options
  priority: number;
  enabled: boolean;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleMappingRule {
  id: string;
  mappingId: string;
  condition: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches';
  value: string;
  caseSensitive: boolean;
}

export interface UserRoleAssignment {
  userId: string;
  roles: string[];
  permissions: string[];
  mappingsApplied: string[];
  source: 'sso' | 'manual';
}

export interface RoleMappingResult {
  roles: string[];
  permissions: string[];
  mappingsApplied: Array<{
    mappingId: string;
    mappingName: string;
    sourceValue: string;
    targetRole: string;
  }>;
}

// -----------------------------------------------------------------------------
// Default Role Definitions
// -----------------------------------------------------------------------------

export const DEFAULT_ROLES = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    permissions: ['*'],
    description: 'Full system access',
  },
  ADMIN: {
    name: 'Admin',
    permissions: [
      'users:read',
      'users:write',
      'users:delete',
      'entities:read',
      'entities:write',
      'settings:read',
      'settings:write',
      'reports:read',
      'reports:write',
      'sso:read',
      'sso:write',
    ],
    description: 'Organization administrator',
  },
  MANAGER: {
    name: 'Manager',
    permissions: [
      'users:read',
      'entities:read',
      'entities:write',
      'reports:read',
      'reports:write',
      'processes:read',
      'processes:write',
    ],
    description: 'Team manager',
  },
  ANALYST: {
    name: 'Analyst',
    permissions: [
      'entities:read',
      'reports:read',
      'reports:write',
      'processes:read',
      'analytics:read',
    ],
    description: 'Data analyst',
  },
  USER: {
    name: 'User',
    permissions: ['entities:read', 'processes:read', 'reports:read'],
    description: 'Standard user',
  },
  VIEWER: {
    name: 'Viewer',
    permissions: ['entities:read', 'reports:read'],
    description: 'Read-only access',
  },
};

// -----------------------------------------------------------------------------
// Role Mapping Service
// -----------------------------------------------------------------------------

export class RoleMappingService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // ---------------------------------------------------------------------------
  // Mapping Management
  // ---------------------------------------------------------------------------

  async createMapping(
    organizationId: string,
    mapping: Omit<RoleMapping, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RoleMapping> {
    const id = crypto.randomUUID();

    const created = await this.prisma.ssoRoleMapping.create({
      data: {
        id,
        organizationId,
        name: mapping.name,
        description: mapping.description,
        sourceType: mapping.sourceType,
        sourceValue: mapping.sourceValue,
        sourcePattern: mapping.sourcePattern,
        targetRole: mapping.targetRole,
        targetPermissions: mapping.targetPermissions || [],
        priority: mapping.priority,
        enabled: mapping.enabled,
      },
    });

    return this.mapToRoleMapping(created);
  }

  async getMappings(organizationId: string): Promise<RoleMapping[]> {
    const mappings = await this.prisma.ssoRoleMapping.findMany({
      where: { organizationId },
      orderBy: { priority: 'asc' },
    });

    return mappings.map((m) => this.mapToRoleMapping(m));
  }

  async getMapping(id: string): Promise<RoleMapping | null> {
    const mapping = await this.prisma.ssoRoleMapping.findUnique({
      where: { id },
    });

    return mapping ? this.mapToRoleMapping(mapping) : null;
  }

  async updateMapping(
    id: string,
    updates: Partial<RoleMapping>
  ): Promise<RoleMapping> {
    const updated = await this.prisma.ssoRoleMapping.update({
      where: { id },
      data: {
        name: updates.name,
        description: updates.description,
        sourceType: updates.sourceType,
        sourceValue: updates.sourceValue,
        sourcePattern: updates.sourcePattern,
        targetRole: updates.targetRole,
        targetPermissions: updates.targetPermissions,
        priority: updates.priority,
        enabled: updates.enabled,
      },
    });

    return this.mapToRoleMapping(updated);
  }

  async deleteMapping(id: string): Promise<void> {
    await this.prisma.ssoRoleMapping.delete({
      where: { id },
    });
  }

  // ---------------------------------------------------------------------------
  // Role Resolution
  // ---------------------------------------------------------------------------

  async resolveRoles(
    organizationId: string,
    ssoAttributes: {
      groups?: string[];
      roles?: string[];
      attributes?: Record<string, string | string[]>;
    }
  ): Promise<RoleMappingResult> {
    const mappings = await this.getMappings(organizationId);
    const enabledMappings = mappings.filter((m) => m.enabled);

    const result: RoleMappingResult = {
      roles: [],
      permissions: [],
      mappingsApplied: [],
    };

    // Sort by priority (lower = higher priority)
    enabledMappings.sort((a, b) => a.priority - b.priority);

    for (const mapping of enabledMappings) {
      const matches = this.checkMapping(mapping, ssoAttributes);

      if (matches) {
        // Add role
        if (!result.roles.includes(mapping.targetRole)) {
          result.roles.push(mapping.targetRole);
        }

        // Add permissions
        if (mapping.targetPermissions) {
          for (const perm of mapping.targetPermissions) {
            if (!result.permissions.includes(perm)) {
              result.permissions.push(perm);
            }
          }
        }

        // Add default permissions for role
        const defaultRole = DEFAULT_ROLES[mapping.targetRole as keyof typeof DEFAULT_ROLES];
        if (defaultRole) {
          for (const perm of defaultRole.permissions) {
            if (!result.permissions.includes(perm)) {
              result.permissions.push(perm);
            }
          }
        }

        // Record applied mapping
        result.mappingsApplied.push({
          mappingId: mapping.id,
          mappingName: mapping.name,
          sourceValue: mapping.sourceValue,
          targetRole: mapping.targetRole,
        });
      }
    }

    // Default role if no mappings matched
    if (result.roles.length === 0) {
      result.roles.push('USER');
      result.permissions.push(...DEFAULT_ROLES.USER.permissions);
    }

    return result;
  }

  private checkMapping(
    mapping: RoleMapping,
    ssoAttributes: {
      groups?: string[];
      roles?: string[];
      attributes?: Record<string, string | string[]>;
    }
  ): boolean {
    let values: string[] = [];

    // Get values based on source type
    switch (mapping.sourceType) {
      case 'group':
        values = ssoAttributes.groups || [];
        break;
      case 'role':
        values = ssoAttributes.roles || [];
        break;
      case 'attribute':
        if (ssoAttributes.attributes) {
          const attrValue = ssoAttributes.attributes[mapping.sourceValue];
          if (Array.isArray(attrValue)) {
            values = attrValue;
          } else if (attrValue) {
            values = [attrValue];
          }
        }
        break;
    }

    // Check if any value matches
    for (const value of values) {
      if (this.matchValue(value, mapping)) {
        return true;
      }
    }

    return false;
  }

  private matchValue(value: string, mapping: RoleMapping): boolean {
    // If pattern is specified, use regex
    if (mapping.sourcePattern) {
      try {
        const regex = new RegExp(mapping.sourcePattern, 'i');
        return regex.test(value);
      } catch {
        return false;
      }
    }

    // Otherwise, exact match (case-insensitive)
    return value.toLowerCase() === mapping.sourceValue.toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // User Role Assignment
  // ---------------------------------------------------------------------------

  async assignRolesToUser(
    userId: string,
    organizationId: string,
    ssoAttributes: {
      groups?: string[];
      roles?: string[];
      attributes?: Record<string, string | string[]>;
    }
  ): Promise<UserRoleAssignment> {
    const resolved = await this.resolveRoles(organizationId, ssoAttributes);

    // Update user roles in database
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        roles: resolved.roles,
        permissions: resolved.permissions,
        ssoMappingsApplied: resolved.mappingsApplied.map((m) => m.mappingId),
      },
    });

    // Log role assignment
    await this.prisma.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        entityType: 'USER',
        entityId: userId,
        action: 'SSO_ROLE_ASSIGNMENT',
        details: {
          roles: resolved.roles,
          permissions: resolved.permissions,
          mappingsApplied: resolved.mappingsApplied,
          ssoGroups: ssoAttributes.groups,
          ssoRoles: ssoAttributes.roles,
        },
        performedBy: 'SYSTEM',
        performedAt: new Date(),
      },
    });

    return {
      userId,
      roles: resolved.roles,
      permissions: resolved.permissions,
      mappingsApplied: resolved.mappingsApplied.map((m) => m.mappingId),
      source: 'sso',
    };
  }

  async getUserRoles(userId: string): Promise<UserRoleAssignment | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        roles: true,
        permissions: true,
        ssoMappingsApplied: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      roles: (user.roles as string[]) || [],
      permissions: (user.permissions as string[]) || [],
      mappingsApplied: (user.ssoMappingsApplied as string[]) || [],
      source: (user.ssoMappingsApplied as string[])?.length > 0 ? 'sso' : 'manual',
    };
  }

  // ---------------------------------------------------------------------------
  // Bulk Operations
  // ---------------------------------------------------------------------------

  async syncUserRoles(organizationId: string): Promise<{
    processed: number;
    updated: number;
    errors: number;
  }> {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        ssoExternalId: { not: null },
      },
      select: {
        id: true,
        ssoGroups: true,
        ssoRoles: true,
        ssoAttributes: true,
      },
    });

    let processed = 0;
    let updated = 0;
    let errors = 0;

    for (const user of users) {
      try {
        processed++;

        const ssoAttributes = {
          groups: (user.ssoGroups as string[]) || [],
          roles: (user.ssoRoles as string[]) || [],
          attributes: (user.ssoAttributes as Record<string, string | string[]>) || {},
        };

        await this.assignRolesToUser(user.id, organizationId, ssoAttributes);
        updated++;
      } catch {
        errors++;
      }
    }

    return { processed, updated, errors };
  }

  // ---------------------------------------------------------------------------
  // Preset Mappings
  // ---------------------------------------------------------------------------

  async createPresetMappings(
    organizationId: string,
    preset: 'azure-ad' | 'okta' | 'google' | 'onelogin'
  ): Promise<RoleMapping[]> {
    const presets = this.getPresetMappings(preset);
    const created: RoleMapping[] = [];

    for (const mapping of presets) {
      const result = await this.createMapping(organizationId, {
        ...mapping,
        organizationId,
        enabled: true,
      });
      created.push(result);
    }

    return created;
  }

  private getPresetMappings(
    preset: string
  ): Array<Omit<RoleMapping, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>> {
    switch (preset) {
      case 'azure-ad':
        return [
          {
            name: 'Azure AD Global Admins',
            sourceType: 'group',
            sourceValue: 'Global Administrators',
            targetRole: 'SUPER_ADMIN',
            priority: 1,
            enabled: true,
          },
          {
            name: 'Azure AD App Admins',
            sourceType: 'group',
            sourceValue: 'Application Administrators',
            targetRole: 'ADMIN',
            priority: 2,
            enabled: true,
          },
          {
            name: 'Azure AD Users',
            sourceType: 'group',
            sourceValue: 'Users',
            targetRole: 'USER',
            priority: 10,
            enabled: true,
          },
        ];

      case 'okta':
        return [
          {
            name: 'Okta Super Admins',
            sourceType: 'group',
            sourceValue: 'SUPER_ADMIN',
            targetRole: 'SUPER_ADMIN',
            priority: 1,
            enabled: true,
          },
          {
            name: 'Okta Org Admins',
            sourceType: 'group',
            sourceValue: 'ORG_ADMIN',
            targetRole: 'ADMIN',
            priority: 2,
            enabled: true,
          },
          {
            name: 'Okta Everyone',
            sourceType: 'group',
            sourceValue: 'Everyone',
            targetRole: 'USER',
            priority: 10,
            enabled: true,
          },
        ];

      case 'google':
        return [
          {
            name: 'Google Super Admins',
            sourceType: 'role',
            sourceValue: 'admin#directory#admin',
            targetRole: 'SUPER_ADMIN',
            priority: 1,
            enabled: true,
          },
          {
            name: 'Google Users',
            sourceType: 'group',
            sourceValue: 'users@',
            sourcePattern: 'users@.*',
            targetRole: 'USER',
            priority: 10,
            enabled: true,
          },
        ];

      case 'onelogin':
        return [
          {
            name: 'OneLogin Super Users',
            sourceType: 'role',
            sourceValue: 'Super user',
            targetRole: 'SUPER_ADMIN',
            priority: 1,
            enabled: true,
          },
          {
            name: 'OneLogin Account Owners',
            sourceType: 'role',
            sourceValue: 'Account owner',
            targetRole: 'ADMIN',
            priority: 2,
            enabled: true,
          },
          {
            name: 'OneLogin Users',
            sourceType: 'role',
            sourceValue: 'User',
            targetRole: 'USER',
            priority: 10,
            enabled: true,
          },
        ];

      default:
        return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapToRoleMapping(record: {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    sourceType: string;
    sourceValue: string;
    sourcePattern: string | null;
    targetRole: string;
    targetPermissions: unknown;
    priority: number;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): RoleMapping {
    return {
      id: record.id,
      organizationId: record.organizationId,
      name: record.name,
      description: record.description || undefined,
      sourceType: record.sourceType as 'group' | 'role' | 'attribute',
      sourceValue: record.sourceValue,
      sourcePattern: record.sourcePattern || undefined,
      targetRole: record.targetRole,
      targetPermissions: (record.targetPermissions as string[]) || undefined,
      priority: record.priority,
      enabled: record.enabled,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
