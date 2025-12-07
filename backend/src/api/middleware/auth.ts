/**
 * JWT Authentication Middleware
 * Validates JWT tokens and extracts user information
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  organizationId: string;
  authProviderId: string;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: AuthUser;
}

// Environment configuration
const AUTH_DOMAIN = process.env.AUTH_DOMAIN || '';
const AUTH_AUDIENCE = process.env.AUTH_AUDIENCE || '';

// JWKS for token verification (cached)
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks && AUTH_DOMAIN) {
    const jwksUrl = new URL(`https://${AUTH_DOMAIN}/.well-known/jwks.json`);
    jwks = createRemoteJWKSet(jwksUrl);
  }
  return jwks;
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Verify and decode JWT token
 */
async function verifyToken(token: string): Promise<JWTPayload> {
  const keySet = getJWKS();

  if (!keySet) {
    throw new Error('JWKS not configured');
  }

  const { payload } = await jwtVerify(token, keySet, {
    issuer: `https://${AUTH_DOMAIN}/`,
    audience: AUTH_AUDIENCE,
  });

  return payload;
}

/**
 * Authentication middleware
 * Validates JWT token and attaches user to request
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const payload = await verifyToken(token);

    // Extract user information from token claims
    const user: AuthUser = {
      id: payload.sub || '',
      email: (payload.email as string) || '',
      name: payload.name as string | undefined,
      role: (payload['https://eaif.com/role'] as string) || 'VIEWER',
      organizationId: (payload['https://eaif.com/organizationId'] as string) || '',
      authProviderId: payload.sub || '',
    };

    // Validate required claims
    if (!user.id || !user.organizationId) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid token claims',
      });
      return;
    }

    // Attach user to request
    (request as AuthenticatedRequest).user = user;
  } catch (error) {
    request.log.error({ error }, 'Authentication failed');

    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't reject if missing
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      return;
    }

    const payload = await verifyToken(token);

    const user: AuthUser = {
      id: payload.sub || '',
      email: (payload.email as string) || '',
      name: payload.name as string | undefined,
      role: (payload['https://eaif.com/role'] as string) || 'VIEWER',
      organizationId: (payload['https://eaif.com/organizationId'] as string) || '',
      authProviderId: payload.sub || '',
    };

    if (user.id && user.organizationId) {
      (request as AuthenticatedRequest).user = user;
    }
  } catch {
    // Silently ignore authentication errors for optional auth
  }
}

/**
 * Development-only authentication bypass
 * WARNING: Only use in development environment
 */
export async function devAuthenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    return authenticate(request, reply);
  }

  // In development, allow a dev token or create a mock user
  const devUser: AuthUser = {
    id: 'dev-user-id',
    email: 'dev@example.com',
    name: 'Development User',
    role: 'ADMIN',
    organizationId: 'dev-org-id',
    authProviderId: 'dev-auth-provider-id',
  };

  (request as AuthenticatedRequest).user = devUser;
}
