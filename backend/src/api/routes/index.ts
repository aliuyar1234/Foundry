/**
 * API Routes Registry
 * Registers all API routes with versioning (v1)
 *
 * SECURITY: All routes under /v1 require authentication except explicitly public endpoints
 * SECURITY: Rate limiting applied globally and per-route for DoS protection
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { organizationContext } from '../middleware/organization.js';
import { rateLimiters, initRateLimitRedis } from '../middleware/rateLimit.js';
import dataSourceRoutes from './dataSources.js';
import connectorRoutes from './connectors.js';
import discoveryRoutes from './discovery.js';
import insightsRoutes from './insights.js';
import alertsRoutes from './alerts.js';
import preparationRoutes from './preparation.js';
import sopRoutes from './sops.js';
import assessmentRoutes from './assessments.js';
import simulationRoutes from './simulation.js';
import networkRoutes from './network.js';
import debtRoutes from './debt.js';
import ssotRoutes from './ssot.js';
import privacyRoutes from './privacy.js';
import { bmdUploadRoutes } from './bmdUpload.js';
import sessionRoutes from './sessions.js';

// List of public endpoints that don't require authentication
const PUBLIC_ENDPOINTS = new Set([
  '/v1/health',
  '/v1/ready',
  '/v1/docs',
  '/v1/docs/openapi.json',
]);

export function registerRoutes(server: FastifyInstance): void {
  // Initialize rate limiting with Redis if available
  const redis = (server as any).redis;
  if (redis) {
    initRateLimitRedis(redis);
    server.log.info('Rate limiting initialized with Redis');
  } else {
    server.log.warn('Redis not available - rate limiting will be permissive');
  }

  // API v1 routes
  server.register(
    async (v1) => {
      // =======================================================================
      // PUBLIC ENDPOINTS (no authentication required)
      // Rate limiting still applied to prevent abuse
      // =======================================================================

      // Health check (public) - used by load balancers
      v1.get('/health', async (_request, reply) => {
        return reply.send({
          status: 'healthy',
          version: process.env.npm_package_version || '0.1.0',
          timestamp: new Date().toISOString(),
        });
      });

      // Ready check (public) - used by orchestrators
      v1.get('/ready', async (_request, reply) => {
        // TODO: Add database and service checks
        return reply.send({
          status: 'ready',
          checks: {
            database: 'pass',
            redis: 'pass',
            neo4j: 'pass',
          },
        });
      });

      // API documentation redirect (public)
      v1.get('/docs', async (_request, reply) => {
        return reply.redirect('/v1/docs/openapi.json');
      });

      // OpenAPI spec (public)
      v1.get('/docs/openapi.json', async (_request, reply) => {
        // TODO: Serve OpenAPI specification
        return reply.send({
          openapi: '3.1.0',
          info: {
            title: 'Enterprise AI Foundation Platform API',
            version: '1.0.0',
          },
          paths: {},
        });
      });

      // =======================================================================
      // PROTECTED ROUTES (authentication required)
      // All routes registered below this point require valid JWT authentication
      // =======================================================================

      // Register protected routes with global auth middleware and rate limiting
      v1.register(
        async (protectedRoutes) => {
          // Apply authentication to ALL routes in this scope
          protectedRoutes.addHook('preHandler', authenticate);
          protectedRoutes.addHook('preHandler', organizationContext);

          // Apply global standard rate limiting (100 req/min per org+user)
          protectedRoutes.addHook('preHandler', rateLimiters.standard());

          // Register route modules
          protectedRoutes.register(dataSourceRoutes, { prefix: '/data-sources' });
          protectedRoutes.register(connectorRoutes, { prefix: '/connectors' });
          protectedRoutes.register(discoveryRoutes, { prefix: '/discovery' });
          protectedRoutes.register(insightsRoutes, { prefix: '/insights' });
          protectedRoutes.register(alertsRoutes, { prefix: '/alerts' });
          protectedRoutes.register(preparationRoutes);
          protectedRoutes.register(sopRoutes);
          protectedRoutes.register(assessmentRoutes);
          protectedRoutes.register(simulationRoutes);
          protectedRoutes.register(networkRoutes, { prefix: '/network' });
          protectedRoutes.register(debtRoutes, { prefix: '/debt' });
          protectedRoutes.register(ssotRoutes);
          protectedRoutes.register(privacyRoutes);
          protectedRoutes.register(bmdUploadRoutes, { prefix: '/connectors/bmd' });
          protectedRoutes.register(sessionRoutes, { prefix: '/sessions' });
        }
      );
    },
    { prefix: '/v1' }
  );

  // Redirect root to v1
  server.get('/', async (_request, reply) => {
    return reply.redirect('/v1/health');
  });

  // Catch-all for API versioning errors
  server.get('/v*', async (request, reply) => {
    const version = (request.params as { '*': string })['*']?.split('/')[0];
    if (version && version !== '1') {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `API version '${version}' is not supported. Use 'v1'.`,
      });
    }
  });
}
