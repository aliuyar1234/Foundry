/**
 * Enterprise AI Foundation Platform - Backend Server
 */

import Fastify, { FastifyInstance } from 'fastify';
import pino from 'pino';
import { registerRoutes } from './api/routes/index.js';
import { prisma, connectPrisma, disconnectPrisma } from './lib/prisma.js';
import { securityMiddleware } from './api/middleware/securityHeaders.js';

// Re-export prisma for backwards compatibility
export { prisma };

// Create logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

// Create Fastify instance
export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
  });

  // Register error handler
  server.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, 'Request error');

    // Handle validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Request validation failed',
        validationErrors: error.validation.map((v) => ({
          field: v.instancePath || v.params?.missingProperty || 'unknown',
          message: v.message || 'Invalid value',
        })),
        requestId: request.id,
      });
    }

    // Handle known error types
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message =
      statusCode >= 500
        ? 'Internal server error'
        : error.message || 'An error occurred';

    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : 'Error',
      message,
      requestId: request.id,
    });
  });

  // Register not found handler
  server.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    });
  });

  // Add request timing
  server.addHook('onRequest', async (request) => {
    (request as { startTime?: number }).startTime = Date.now();
  });

  server.addHook('onResponse', async (request, reply) => {
    const startTime = (request as { startTime?: number }).startTime;
    if (startTime) {
      const duration = Date.now() - startTime;
      request.log.info(
        {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          duration,
        },
        'Request completed'
      );
    }
  });

  // Register security middleware (CORS + CSP + security headers)
  server.addHook('onRequest', securityMiddleware);

  // Register routes
  registerRoutes(server);

  return server;
}

// Start server
async function start() {
  const server = buildServer();

  const port = parseInt(process.env.API_PORT || '3001', 10);
  const host = process.env.API_HOST || '0.0.0.0';

  try {
    // Connect to database using singleton
    await connectPrisma();
    logger.info('Connected to database');

    // Start server
    await server.listen({ port, host });
    logger.info(`Server listening on ${host}:${port}`);
  } catch (error) {
    logger.error(error, 'Failed to start server');
    await disconnectPrisma();
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    try {
      await server.close();
      await disconnectPrisma();
      logger.info('Server shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error(error, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Only run if this is the main module
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  start();
}
