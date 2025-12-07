/**
 * API Routes Registry
 * Registers all API routes with versioning (v1)
 */

import { FastifyInstance } from 'fastify';
import dataSourceRoutes from './dataSources.js';
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

export function registerRoutes(server: FastifyInstance): void {
  // API v1 routes
  server.register(
    async (v1) => {
      // Health check (public)
      v1.get('/health', async (_request, reply) => {
        return reply.send({
          status: 'healthy',
          version: process.env.npm_package_version || '0.1.0',
          timestamp: new Date().toISOString(),
        });
      });

      // Ready check (public)
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

      // API documentation redirect
      v1.get('/docs', async (_request, reply) => {
        return reply.redirect('/v1/docs/openapi.json');
      });

      // OpenAPI spec
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

      // Register route modules
      v1.register(dataSourceRoutes, { prefix: '/data-sources' });
      v1.register(discoveryRoutes, { prefix: '/discovery' });
      v1.register(insightsRoutes, { prefix: '/insights' });
      v1.register(alertsRoutes, { prefix: '/alerts' });
      v1.register(preparationRoutes);
      v1.register(sopRoutes);
      v1.register(assessmentRoutes);
      v1.register(simulationRoutes);
      v1.register(networkRoutes, { prefix: '/network' });
      v1.register(debtRoutes, { prefix: '/debt' });
      v1.register(ssotRoutes);
      v1.register(privacyRoutes);
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
