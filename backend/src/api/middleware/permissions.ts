/**
 * RBAC Permission Checker Middleware
 * Implements role-based access control for API endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest, AuthUser } from './auth.js';

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY = ['VIEWER', 'ANALYST', 'ADMIN', 'OWNER'] as const;
type Role = (typeof ROLE_HIERARCHY)[number];

// Permission definitions per resource type
interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'manage';
  minRole: Role;
}

// Define permissions for each resource
const PERMISSIONS: Permission[] = [
  // Organization permissions
  { resource: 'organization', action: 'read', minRole: 'VIEWER' },
  { resource: 'organization', action: 'update', minRole: 'ADMIN' },
  { resource: 'organization', action: 'delete', minRole: 'OWNER' },
  { resource: 'organization', action: 'manage', minRole: 'OWNER' },

  // User permissions
  { resource: 'user', action: 'read', minRole: 'ADMIN' },
  { resource: 'user', action: 'create', minRole: 'ADMIN' },
  { resource: 'user', action: 'update', minRole: 'ADMIN' },
  { resource: 'user', action: 'delete', minRole: 'OWNER' },

  // Data source permissions
  { resource: 'dataSource', action: 'read', minRole: 'VIEWER' },
  { resource: 'dataSource', action: 'create', minRole: 'ADMIN' },
  { resource: 'dataSource', action: 'update', minRole: 'ADMIN' },
  { resource: 'dataSource', action: 'delete', minRole: 'ADMIN' },

  // Discovery permissions
  { resource: 'discovery', action: 'read', minRole: 'VIEWER' },
  { resource: 'discovery', action: 'create', minRole: 'ANALYST' },

  // Process permissions
  { resource: 'process', action: 'read', minRole: 'VIEWER' },
  { resource: 'process', action: 'update', minRole: 'ANALYST' },

  // Assessment permissions
  { resource: 'assessment', action: 'read', minRole: 'VIEWER' },
  { resource: 'assessment', action: 'create', minRole: 'ANALYST' },
  { resource: 'assessment', action: 'update', minRole: 'ANALYST' },
  { resource: 'assessment', action: 'delete', minRole: 'ADMIN' },

  // SOP permissions
  { resource: 'sop', action: 'read', minRole: 'VIEWER' },
  { resource: 'sop', action: 'create', minRole: 'ANALYST' },
  { resource: 'sop', action: 'update', minRole: 'ANALYST' },
  { resource: 'sop', action: 'delete', minRole: 'ADMIN' },

  // Entity record permissions
  { resource: 'entityRecord', action: 'read', minRole: 'VIEWER' },
  { resource: 'entityRecord', action: 'create', minRole: 'ANALYST' },
  { resource: 'entityRecord', action: 'update', minRole: 'ANALYST' },
  { resource: 'entityRecord', action: 'delete', minRole: 'ADMIN' },

  // Simulation permissions
  { resource: 'simulation', action: 'read', minRole: 'VIEWER' },
  { resource: 'simulation', action: 'create', minRole: 'ANALYST' },

  // Insights permissions
  { resource: 'insights', action: 'read', minRole: 'VIEWER' },

  // Alerts permissions
  { resource: 'alerts', action: 'read', minRole: 'VIEWER' },
  { resource: 'alerts', action: 'create', minRole: 'ANALYST' },
  { resource: 'alerts', action: 'update', minRole: 'ANALYST' },

  // Audit log permissions
  { resource: 'auditLog', action: 'read', minRole: 'ADMIN' },

  // GDPR permissions
  { resource: 'gdpr', action: 'read', minRole: 'ADMIN' },
  { resource: 'gdpr', action: 'delete', minRole: 'OWNER' },
];

/**
 * Check if a role has sufficient permissions
 */
function hasRolePermission(userRole: string, requiredRole: Role): boolean {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole as Role);
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);

  if (userRoleIndex === -1) {
    return false;
  }

  return userRoleIndex >= requiredRoleIndex;
}

/**
 * Check if user has permission for a specific resource action
 */
export function hasPermission(
  user: AuthUser,
  resource: string,
  action: Permission['action']
): boolean {
  const permission = PERMISSIONS.find(
    (p) => p.resource === resource && p.action === action
  );

  if (!permission) {
    // If no explicit permission defined, deny by default
    return false;
  }

  return hasRolePermission(user.role, permission.minRole);
}

/**
 * Create a permission check middleware
 */
export function requirePermission(
  resource: string,
  action: Permission['action']
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!hasPermission(user, resource, action)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: `Insufficient permissions for ${action} on ${resource}`,
      });
      return;
    }
  };
}

/**
 * Require minimum role level
 */
export function requireRole(minRole: Role) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!hasRolePermission(user.role, minRole)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: `Role ${minRole} or higher required`,
      });
      return;
    }
  };
}

/**
 * Check multiple permissions (all must pass)
 */
export function requireAllPermissions(
  permissions: Array<{ resource: string; action: Permission['action'] }>
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const missingPermissions = permissions.filter(
      (p) => !hasPermission(user, p.resource, p.action)
    );

    if (missingPermissions.length > 0) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        missing: missingPermissions,
      });
      return;
    }
  };
}

/**
 * Check at least one permission passes
 */
export function requireAnyPermission(
  permissions: Array<{ resource: string; action: Permission['action'] }>
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const hasAny = permissions.some((p) =>
      hasPermission(user, p.resource, p.action)
    );

    if (!hasAny) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
      return;
    }
  };
}
