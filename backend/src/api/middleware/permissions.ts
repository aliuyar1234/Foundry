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

  // ==========================================
  // OPERATE Tier Permissions (T238-T240)
  // ==========================================

  // Routing permissions (T238)
  { resource: 'routing', action: 'read', minRole: 'VIEWER' },
  { resource: 'routing', action: 'create', minRole: 'ANALYST' },
  { resource: 'routing', action: 'update', minRole: 'ADMIN' },
  { resource: 'routing', action: 'delete', minRole: 'ADMIN' },
  { resource: 'routing', action: 'manage', minRole: 'ADMIN' },
  { resource: 'routingRules', action: 'read', minRole: 'VIEWER' },
  { resource: 'routingRules', action: 'create', minRole: 'ADMIN' },
  { resource: 'routingRules', action: 'update', minRole: 'ADMIN' },
  { resource: 'routingRules', action: 'delete', minRole: 'ADMIN' },
  { resource: 'routingDecisions', action: 'read', minRole: 'VIEWER' },
  { resource: 'routingMetrics', action: 'read', minRole: 'VIEWER' },

  // Compliance permissions (T239)
  { resource: 'compliance', action: 'read', minRole: 'VIEWER' },
  { resource: 'compliance', action: 'create', minRole: 'ANALYST' },
  { resource: 'compliance', action: 'update', minRole: 'ADMIN' },
  { resource: 'compliance', action: 'delete', minRole: 'ADMIN' },
  { resource: 'compliance', action: 'manage', minRole: 'ADMIN' },
  { resource: 'complianceRules', action: 'read', minRole: 'VIEWER' },
  { resource: 'complianceRules', action: 'create', minRole: 'ADMIN' },
  { resource: 'complianceRules', action: 'update', minRole: 'ADMIN' },
  { resource: 'complianceRules', action: 'delete', minRole: 'OWNER' },
  { resource: 'complianceChecks', action: 'read', minRole: 'VIEWER' },
  { resource: 'complianceChecks', action: 'create', minRole: 'ANALYST' },
  { resource: 'complianceReports', action: 'read', minRole: 'VIEWER' },
  { resource: 'complianceReports', action: 'create', minRole: 'ANALYST' },
  { resource: 'complianceExceptions', action: 'read', minRole: 'ANALYST' },
  { resource: 'complianceExceptions', action: 'create', minRole: 'ADMIN' },
  { resource: 'complianceExceptions', action: 'update', minRole: 'ADMIN' },

  // Self-healing permissions (T240)
  { resource: 'selfHealing', action: 'read', minRole: 'VIEWER' },
  { resource: 'selfHealing', action: 'create', minRole: 'ADMIN' },
  { resource: 'selfHealing', action: 'update', minRole: 'ADMIN' },
  { resource: 'selfHealing', action: 'delete', minRole: 'OWNER' },
  { resource: 'selfHealing', action: 'manage', minRole: 'ADMIN' },
  { resource: 'healingPatterns', action: 'read', minRole: 'VIEWER' },
  { resource: 'healingPatterns', action: 'create', minRole: 'ADMIN' },
  { resource: 'healingPatterns', action: 'update', minRole: 'ADMIN' },
  { resource: 'healingPatterns', action: 'delete', minRole: 'ADMIN' },
  { resource: 'healingActions', action: 'read', minRole: 'VIEWER' },
  { resource: 'healingActions', action: 'create', minRole: 'ADMIN' },
  { resource: 'healingActions', action: 'update', minRole: 'ADMIN' },
  { resource: 'healingExecutions', action: 'read', minRole: 'VIEWER' },
  { resource: 'healingExecutions', action: 'create', minRole: 'ADMIN' },

  // AI Assistant permissions
  { resource: 'aiAssistant', action: 'read', minRole: 'VIEWER' },
  { resource: 'aiAssistant', action: 'create', minRole: 'ANALYST' },
  { resource: 'aiContext', action: 'read', minRole: 'ADMIN' },

  // Command Center permissions
  { resource: 'commandCenter', action: 'read', minRole: 'VIEWER' },
  { resource: 'commandCenter', action: 'manage', minRole: 'ADMIN' },
  { resource: 'dashboardMetrics', action: 'read', minRole: 'VIEWER' },
  { resource: 'systemAlerts', action: 'read', minRole: 'VIEWER' },
  { resource: 'systemAlerts', action: 'create', minRole: 'ANALYST' },
  { resource: 'systemAlerts', action: 'update', minRole: 'ANALYST' },

  // Workload management permissions
  { resource: 'workload', action: 'read', minRole: 'VIEWER' },
  { resource: 'workload', action: 'update', minRole: 'ANALYST' },
  { resource: 'workload', action: 'manage', minRole: 'ADMIN' },
  { resource: 'burnoutRisk', action: 'read', minRole: 'ANALYST' },
  { resource: 'taskRedistribution', action: 'read', minRole: 'ANALYST' },
  { resource: 'taskRedistribution', action: 'create', minRole: 'ADMIN' },
  { resource: 'workloadSettings', action: 'read', minRole: 'VIEWER' },
  { resource: 'workloadSettings', action: 'update', minRole: 'ADMIN' },
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
