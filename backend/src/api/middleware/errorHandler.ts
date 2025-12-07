/**
 * Global Error Handler
 * Provides consistent error responses across the API
 */

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}

// Custom error classes
export class BadRequestError extends Error implements AppError {
  statusCode = 400;
  code = 'BAD_REQUEST';

  constructor(
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends Error implements AppError {
  statusCode = 401;
  code = 'UNAUTHORIZED';

  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error implements AppError {
  statusCode = 403;
  code = 'FORBIDDEN';

  constructor(message = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'NOT_FOUND';

  constructor(resource = 'Resource', identifier?: string) {
    const message = identifier
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements AppError {
  statusCode = 409;
  code = 'CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error implements AppError {
  statusCode = 422;
  code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Error implements AppError {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';

  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class InternalError extends Error implements AppError {
  statusCode = 500;
  code = 'INTERNAL_ERROR';

  constructor(message = 'Internal server error') {
    super(message);
    this.name = 'InternalError';
  }
}

export class ServiceUnavailableError extends Error implements AppError {
  statusCode = 503;
  code = 'SERVICE_UNAVAILABLE';

  constructor(message = 'Service temporarily unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Global error handler for Fastify
 */
export function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // Log error
  request.log.error(
    {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as AppError).code,
      },
      requestId: request.id,
    },
    'Request error'
  );

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    reply.code(400).send({
      error: 'Validation Error',
      message: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      validationErrors: error.validation.map((v) => ({
        field: v.instancePath?.replace(/^\//, '') || v.params?.missingProperty || 'body',
        message: v.message || 'Invalid value',
        code: v.keyword,
      })),
      requestId: request.id,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Get status code
  const statusCode = (error as AppError).statusCode || (error as FastifyError).statusCode || 500;

  // Don't expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  const message =
    statusCode >= 500 && isProduction
      ? 'Internal server error'
      : error.message || 'An error occurred';

  const response: Record<string, unknown> = {
    error: getErrorName(statusCode),
    message,
    code: (error as AppError).code || getErrorCode(statusCode),
    requestId: request.id,
    timestamp: new Date().toISOString(),
  };

  // Include details if available and not in production
  if ((error as AppError).details && !isProduction) {
    response.details = (error as AppError).details;
  }

  reply.code(statusCode).send(response);
}

function getErrorName(statusCode: number): string {
  const names: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };
  return names[statusCode] || 'Error';
}

function getErrorCode(statusCode: number): string {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMIT_EXCEEDED',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };
  return codes[statusCode] || 'UNKNOWN_ERROR';
}
