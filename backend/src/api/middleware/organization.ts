/**
 * Organization Context Middleware
 * Ensures requests are scoped to the user's organization
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from './auth.js';

export interface OrganizationScopedRequest extends AuthenticatedRequest {
  organizationId: string;
}

/**
 * Extract organization ID from route params or user context
 */
export async function organizationContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as AuthenticatedRequest).user;

  if (!user) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // Get organization ID from route params or use user's organization
  const params = request.params as { organizationId?: string };
  const requestedOrgId = params.organizationId || user.organizationId;

  // Verify user has access to the requested organization
  if (requestedOrgId !== user.organizationId) {
    // In the future, we could support multi-org access here
    // For now, users can only access their own organization
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Access denied to this organization',
    });
    return;
  }

  // Attach organization ID to request
  (request as OrganizationScopedRequest).organizationId = requestedOrgId;
}

/**
 * Verify organization exists and is active
 * This middleware should be used after organizationContext
 */
export function verifyOrganization(prisma: { organization: { findUnique: Function } }) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const orgId = (request as OrganizationScopedRequest).organizationId;

    if (!orgId) {
      reply.code(400).send({
        error: 'Bad Request',
        message: 'Organization ID required',
      });
      return;
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, tier: true },
    });

    if (!organization) {
      reply.code(404).send({
        error: 'Not Found',
        message: 'Organization not found',
      });
      return;
    }

    // Could add tier-based feature checks here
  };
}

/**
 * Helper to get organization ID from request
 */
export function getOrganizationId(request: FastifyRequest): string {
  const orgRequest = request as OrganizationScopedRequest;
  if (!orgRequest.organizationId) {
    throw new Error('Organization context not set');
  }
  return orgRequest.organizationId;
}

/**
 * Ensure resource belongs to user's organization
 */
export function ensureOrgResource<T extends { organizationId: string }>(
  request: FastifyRequest,
  resource: T | null
): T {
  if (!resource) {
    throw new ResourceNotFoundError();
  }

  const orgId = getOrganizationId(request);
  if (resource.organizationId !== orgId) {
    throw new ResourceForbiddenError();
  }

  return resource;
}

class ResourceNotFoundError extends Error {
  statusCode = 404;
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'ResourceNotFoundError';
  }
}

class ResourceForbiddenError extends Error {
  statusCode = 403;
  constructor(message = 'Access denied to this resource') {
    super(message);
    this.name = 'ResourceForbiddenError';
  }
}
