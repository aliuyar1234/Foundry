/**
 * Security Headers Middleware
 * Implements CORS hardening, CSP, and other security headers
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../lib/logger.js';

const securityLogger = logger.child({ service: 'SecurityHeaders' });

// =============================================================================
// Configuration
// =============================================================================

/**
 * CORS Configuration
 * In production, CORS_ORIGINS must be explicitly set to allowed origins
 */
function getCorsConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const originsEnv = process.env.CORS_ORIGINS;

  // Parse allowed origins
  let allowedOrigins: string[] = [];
  if (originsEnv) {
    allowedOrigins = originsEnv.split(',').map(o => o.trim()).filter(Boolean);
  } else if (!isProduction) {
    // Default for development only
    allowedOrigins = ['http://localhost:3000', 'http://localhost:5173'];
  }

  // In production, require explicit CORS_ORIGINS
  if (isProduction && allowedOrigins.length === 0) {
    securityLogger.warn('CORS_ORIGINS not set in production - CORS will reject all cross-origin requests');
  }

  return {
    allowedOrigins,
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Correlation-ID',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
  };
}

/**
 * CSP Configuration
 * Content Security Policy for API responses
 */
function getCspConfig() {
  const isProduction = process.env.NODE_ENV === 'production';

  // API-focused CSP - restrictive since we don't serve HTML
  return {
    'default-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    // Allow report-uri in production for CSP violation reporting
    ...(isProduction && process.env.CSP_REPORT_URI
      ? { 'report-uri': [process.env.CSP_REPORT_URI] }
      : {}),
  };
}

// =============================================================================
// CORS Middleware
// =============================================================================

const corsConfig = getCorsConfig();

/**
 * Validate origin against allowed list
 * Supports exact match and wildcard subdomains
 */
function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;

  for (const allowed of corsConfig.allowedOrigins) {
    // Exact match
    if (allowed === origin) return true;

    // Wildcard subdomain match (e.g., *.example.com)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      try {
        const originUrl = new URL(origin);
        if (originUrl.hostname === domain || originUrl.hostname.endsWith('.' + domain)) {
          return true;
        }
      } catch {
        // Invalid origin URL
      }
    }
  }

  return false;
}

/**
 * CORS middleware with strict origin validation
 */
export async function corsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const origin = request.headers.origin;

  // Set Vary header for caching
  reply.header('Vary', 'Origin');

  if (origin) {
    if (isOriginAllowed(origin)) {
      // Set CORS headers for allowed origin
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Methods', corsConfig.allowedMethods.join(', '));
      reply.header('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
      reply.header('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
      reply.header('Access-Control-Max-Age', String(corsConfig.maxAge));
    } else {
      // Log rejected origin in production
      if (process.env.NODE_ENV === 'production') {
        securityLogger.warn(
          { origin, allowedOrigins: corsConfig.allowedOrigins },
          'CORS request from disallowed origin'
        );
      }
      // Don't set CORS headers - browser will block the request
    }
  }

  // Handle preflight
  if (request.method === 'OPTIONS') {
    reply.code(204).send();
    return;
  }
}

// =============================================================================
// Security Headers Middleware
// =============================================================================

const cspConfig = getCspConfig();

/**
 * Build CSP header value from config
 */
function buildCspHeader(): string {
  return Object.entries(cspConfig)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
}

const cspHeaderValue = buildCspHeader();

/**
 * Security headers middleware
 * Sets CSP, X-Frame-Options, and other security headers
 */
export async function securityHeadersMiddleware(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Content Security Policy
  reply.header('Content-Security-Policy', cspHeaderValue);

  // Prevent clickjacking
  reply.header('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  reply.header('X-Content-Type-Options', 'nosniff');

  // Referrer Policy - don't leak referrer info
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy - disable unnecessary browser features
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

  // HSTS - only in production with HTTPS
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_HSTS === 'true') {
    // max-age=31536000 (1 year), includeSubDomains
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // X-XSS-Protection - legacy but still useful for older browsers
  reply.header('X-XSS-Protection', '1; mode=block');

  // Cache control for API responses
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  reply.header('Pragma', 'no-cache');
  reply.header('Expires', '0');
}

// =============================================================================
// Combined Middleware
// =============================================================================

/**
 * Combined security middleware - applies both CORS and security headers
 */
export async function securityMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await corsMiddleware(request, reply);

  // Don't set security headers for preflight (already handled)
  if (request.method !== 'OPTIONS') {
    await securityHeadersMiddleware(request, reply);
  }
}

// =============================================================================
// Exports
// =============================================================================

export { getCorsConfig, getCspConfig, isOriginAllowed };
