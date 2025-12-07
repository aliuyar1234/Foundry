/**
 * Request Validation Middleware
 * Provides JSON Schema based validation for request bodies, params, and query strings
 */

import { FastifyRequest, FastifyReply, FastifySchema } from 'fastify';
import { z, ZodError, ZodSchema } from 'zod';

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),

  // Sorting
  sorting: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Date range
  dateRange: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),

  // ID parameter
  idParam: z.object({
    id: z.string().min(1),
  }),

  // Organization ID parameter
  orgIdParam: z.object({
    organizationId: z.string().min(1),
  }),

  // CUID validation
  cuid: z.string().regex(/^c[a-z0-9]{24}$/),

  // Email validation
  email: z.string().email(),

  // URL validation
  url: z.string().url(),

  // UUID validation
  uuid: z.string().uuid(),
};

/**
 * Validate request body with Zod schema
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const parsed = schema.parse(request.body);
      (request as FastifyRequest & { validatedBody: T }).validatedBody = parsed;
    } catch (error) {
      if (error instanceof ZodError) {
        reply.code(400).send({
          error: 'Validation Error',
          message: 'Request body validation failed',
          code: 'VALIDATION_ERROR',
          validationErrors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
          requestId: request.id,
        });
        return;
      }
      throw error;
    }
  };
}

/**
 * Validate query parameters with Zod schema
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const parsed = schema.parse(request.query);
      (request as FastifyRequest & { validatedQuery: T }).validatedQuery = parsed;
    } catch (error) {
      if (error instanceof ZodError) {
        reply.code(400).send({
          error: 'Validation Error',
          message: 'Query parameter validation failed',
          code: 'VALIDATION_ERROR',
          validationErrors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
          requestId: request.id,
        });
        return;
      }
      throw error;
    }
  };
}

/**
 * Validate route parameters with Zod schema
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const parsed = schema.parse(request.params);
      (request as FastifyRequest & { validatedParams: T }).validatedParams = parsed;
    } catch (error) {
      if (error instanceof ZodError) {
        reply.code(400).send({
          error: 'Validation Error',
          message: 'Route parameter validation failed',
          code: 'VALIDATION_ERROR',
          validationErrors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
          requestId: request.id,
        });
        return;
      }
      throw error;
    }
  };
}

/**
 * Helper to get validated body from request
 */
export function getValidatedBody<T>(request: FastifyRequest): T {
  return (request as FastifyRequest & { validatedBody: T }).validatedBody;
}

/**
 * Helper to get validated query from request
 */
export function getValidatedQuery<T>(request: FastifyRequest): T {
  return (request as FastifyRequest & { validatedQuery: T }).validatedQuery;
}

/**
 * Helper to get validated params from request
 */
export function getValidatedParams<T>(request: FastifyRequest): T {
  return (request as FastifyRequest & { validatedParams: T }).validatedParams;
}

/**
 * Convert Zod schema to JSON Schema for Fastify
 */
export function zodToJsonSchema(schema: ZodSchema): FastifySchema {
  // This is a simplified conversion - for production, use zod-to-json-schema
  return {
    body: {
      type: 'object',
    },
  };
}

/**
 * Sanitize string input (trim and normalize)
 */
export function sanitizeString(value: string): string {
  return value.trim().normalize('NFC');
}

/**
 * Sanitize object strings recursively
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };

  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = sanitizeObject(
        value as Record<string, unknown>
      );
    }
  }

  return result;
}
