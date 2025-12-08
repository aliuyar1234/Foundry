/**
 * Structured Logging for Enterprise Features
 * T365 - Add structured logging for all enterprise features
 *
 * Provides JSON-structured logging with context propagation
 * for observability and debugging across distributed systems.
 */

import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

// ==========================================================================
// Types
// ==========================================================================

export interface LogContext {
  requestId: string;
  entityId?: string;
  userId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  service: string;
  version: string;
  environment: string;
}

export interface LogMetadata {
  [key: string]: unknown;
  // Common fields
  duration?: number;
  statusCode?: number;
  method?: string;
  path?: string;
  error?: Error | string;
  stack?: string;
}

export interface EnterpriseLogEvent {
  // Entity events
  entityCreated?: { entityId: string; name: string };
  entityUpdated?: { entityId: string; changes: string[] };
  entityDeleted?: { entityId: string };

  // Auth events
  authAttempt?: { method: string; success: boolean; reason?: string };
  sessionCreated?: { sessionId: string; userId: string };
  sessionTerminated?: { sessionId: string; reason: string };

  // Partner API events
  partnerApiRequest?: {
    partnerId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    duration: number;
  };
  rateLimitHit?: { partnerId: string; tier: string; limit: number };

  // Webhook events
  webhookTriggered?: { eventType: string; subscriptionId: string };
  webhookDelivered?: { subscriptionId: string; duration: number };
  webhookFailed?: { subscriptionId: string; error: string; attempt: number };

  // GDPR events
  dataExportRequested?: { targetType: string; targetId: string };
  dataDeletionRequested?: { targetType: string; targetId: string };
  dataDeletionCompleted?: { targetType: string; targetId: string };

  // Security events
  securityAlert?: { type: string; severity: string; details: unknown };
  ipBlocked?: { ip: string; entityId: string; reason: string };
  suspiciousActivity?: { type: string; userId?: string; details: unknown };
}

// ==========================================================================
// Context Storage
// ==========================================================================

const contextStorage = new AsyncLocalStorage<LogContext>();

/**
 * Get current log context
 */
export function getLogContext(): LogContext | undefined {
  return contextStorage.getStore();
}

/**
 * Run function with log context
 */
export function withLogContext<T>(
  context: Partial<LogContext>,
  fn: () => T
): T {
  const fullContext: LogContext = {
    requestId: context.requestId || uuidv4(),
    entityId: context.entityId,
    userId: context.userId,
    sessionId: context.sessionId,
    traceId: context.traceId || uuidv4(),
    spanId: context.spanId || uuidv4(),
    parentSpanId: context.parentSpanId,
    service: context.service || process.env.SERVICE_NAME || 'foundry-api',
    version: context.version || process.env.APP_VERSION || '1.0.0',
    environment: context.environment || process.env.NODE_ENV || 'development',
  };

  return contextStorage.run(fullContext, fn);
}

/**
 * Update current context
 */
export function updateLogContext(updates: Partial<LogContext>): void {
  const current = contextStorage.getStore();
  if (current) {
    Object.assign(current, updates);
  }
}

// ==========================================================================
// Logger Configuration
// ==========================================================================

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

const baseConfig: pino.LoggerOptions = {
  level: logLevel,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({}),
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: undefined,
  messageKey: 'message',
  errorKey: 'error',
  nestedKey: 'payload',
};

// Production: JSON output for log aggregation (Loki, ELK, etc.)
const productionConfig: pino.LoggerOptions = {
  ...baseConfig,
};

// Development: Pretty printing
const developmentConfig: pino.LoggerOptions = {
  ...baseConfig,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
};

// Create base logger
const baseLogger = pino(isProduction ? productionConfig : developmentConfig);

// ==========================================================================
// Structured Logger Class
// ==========================================================================

export class StructuredLogger {
  private logger: pino.Logger;
  private defaultMeta: Record<string, unknown>;

  constructor(
    name: string,
    defaultMeta: Record<string, unknown> = {}
  ) {
    this.logger = baseLogger.child({ component: name });
    this.defaultMeta = defaultMeta;
  }

  /**
   * Build log object with context
   */
  private buildLogObject(
    meta?: LogMetadata,
    event?: EnterpriseLogEvent
  ): Record<string, unknown> {
    const context = getLogContext();

    const logObj: Record<string, unknown> = {
      ...this.defaultMeta,
      ...meta,
    };

    // Add context if available
    if (context) {
      logObj.requestId = context.requestId;
      logObj.entityId = context.entityId;
      logObj.userId = context.userId;
      logObj.sessionId = context.sessionId;
      logObj.traceId = context.traceId;
      logObj.spanId = context.spanId;
      logObj.service = context.service;
      logObj.version = context.version;
      logObj.environment = context.environment;
    }

    // Add enterprise event if provided
    if (event) {
      const eventType = Object.keys(event)[0];
      logObj.event = {
        type: eventType,
        data: event[eventType as keyof EnterpriseLogEvent],
      };
    }

    return logObj;
  }

  // ==========================================================================
  // Standard Log Methods
  // ==========================================================================

  trace(message: string, meta?: LogMetadata): void {
    this.logger.trace(this.buildLogObject(meta), message);
  }

  debug(message: string, meta?: LogMetadata): void {
    this.logger.debug(this.buildLogObject(meta), message);
  }

  info(message: string, meta?: LogMetadata): void {
    this.logger.info(this.buildLogObject(meta), message);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.logger.warn(this.buildLogObject(meta), message);
  }

  error(message: string, error?: Error | unknown, meta?: LogMetadata): void {
    const errorMeta = { ...meta };

    if (error instanceof Error) {
      errorMeta.error = error.message;
      errorMeta.stack = error.stack;
      errorMeta.errorName = error.name;
    } else if (error) {
      errorMeta.error = String(error);
    }

    this.logger.error(this.buildLogObject(errorMeta), message);
  }

  fatal(message: string, error?: Error | unknown, meta?: LogMetadata): void {
    const errorMeta = { ...meta };

    if (error instanceof Error) {
      errorMeta.error = error.message;
      errorMeta.stack = error.stack;
      errorMeta.errorName = error.name;
    } else if (error) {
      errorMeta.error = String(error);
    }

    this.logger.fatal(this.buildLogObject(errorMeta), message);
  }

  // ==========================================================================
  // Enterprise Event Methods
  // ==========================================================================

  /**
   * Log enterprise-specific event
   */
  event(
    level: 'info' | 'warn' | 'error',
    message: string,
    event: EnterpriseLogEvent,
    meta?: LogMetadata
  ): void {
    const logObj = this.buildLogObject(meta, event);
    this.logger[level](logObj, message);
  }

  /**
   * Log entity event
   */
  entityEvent(
    action: 'created' | 'updated' | 'deleted',
    entityId: string,
    details?: { name?: string; changes?: string[] }
  ): void {
    const eventKey = `entity${action.charAt(0).toUpperCase() + action.slice(1)}` as keyof EnterpriseLogEvent;
    const event: EnterpriseLogEvent = {
      [eventKey]: { entityId, ...details },
    };
    this.event('info', `Entity ${action}`, event, { entityId });
  }

  /**
   * Log authentication event
   */
  authEvent(
    method: string,
    success: boolean,
    userId?: string,
    reason?: string
  ): void {
    this.event(
      success ? 'info' : 'warn',
      `Authentication ${success ? 'succeeded' : 'failed'}`,
      { authAttempt: { method, success, reason } },
      { userId }
    );
  }

  /**
   * Log partner API event
   */
  partnerApiEvent(
    partnerId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this.event(
      level,
      'Partner API request',
      {
        partnerApiRequest: { partnerId, endpoint, method, statusCode, duration },
      },
      { duration, statusCode }
    );
  }

  /**
   * Log webhook event
   */
  webhookEvent(
    type: 'triggered' | 'delivered' | 'failed',
    subscriptionId: string,
    details?: { eventType?: string; duration?: number; error?: string; attempt?: number }
  ): void {
    const eventKey = `webhook${type.charAt(0).toUpperCase() + type.slice(1)}` as keyof EnterpriseLogEvent;

    let eventData: unknown;
    switch (type) {
      case 'triggered':
        eventData = { eventType: details?.eventType || 'unknown', subscriptionId };
        break;
      case 'delivered':
        eventData = { subscriptionId, duration: details?.duration || 0 };
        break;
      case 'failed':
        eventData = {
          subscriptionId,
          error: details?.error || 'unknown',
          attempt: details?.attempt || 1,
        };
        break;
    }

    const event: EnterpriseLogEvent = { [eventKey]: eventData };
    this.event(type === 'failed' ? 'error' : 'info', `Webhook ${type}`, event);
  }

  /**
   * Log security event
   */
  securityEvent(
    type: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: unknown
  ): void {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    this.event(level, `Security alert: ${type}`, {
      securityAlert: { type, severity, details },
    });
  }

  /**
   * Log GDPR event
   */
  gdprEvent(
    type: 'export_requested' | 'deletion_requested' | 'deletion_completed',
    targetType: 'user' | 'entity',
    targetId: string
  ): void {
    const eventMap: Record<string, keyof EnterpriseLogEvent> = {
      'export_requested': 'dataExportRequested',
      'deletion_requested': 'dataDeletionRequested',
      'deletion_completed': 'dataDeletionCompleted',
    };

    const event: EnterpriseLogEvent = {
      [eventMap[type]]: { targetType, targetId },
    };

    this.event('info', `GDPR ${type.replace('_', ' ')}`, event);
  }

  // ==========================================================================
  // Request/Response Logging
  // ==========================================================================

  /**
   * Log HTTP request
   */
  httpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    meta?: LogMetadata
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this.logger[level](
      this.buildLogObject({
        ...meta,
        method,
        path,
        statusCode,
        duration,
        type: 'http_request',
      }),
      `${method} ${path} ${statusCode} ${duration}ms`
    );
  }

  /**
   * Log database query
   */
  dbQuery(
    operation: string,
    table: string,
    duration: number,
    meta?: LogMetadata
  ): void {
    this.debug(`DB ${operation} on ${table}`, {
      ...meta,
      operation,
      table,
      duration,
      type: 'db_query',
    });
  }

  /**
   * Log cache operation
   */
  cacheOperation(
    operation: 'get' | 'set' | 'del',
    key: string,
    hit: boolean,
    duration: number
  ): void {
    this.trace(`Cache ${operation}: ${hit ? 'HIT' : 'MISS'}`, {
      operation,
      cacheKey: key,
      hit,
      duration,
      type: 'cache_operation',
    });
  }

  // ==========================================================================
  // Child Logger
  // ==========================================================================

  /**
   * Create child logger with additional default metadata
   */
  child(name: string, meta: Record<string, unknown> = {}): StructuredLogger {
    const childLogger = new StructuredLogger(name, {
      ...this.defaultMeta,
      ...meta,
    });
    return childLogger;
  }
}

// ==========================================================================
// Default Logger Instance
// ==========================================================================

export const logger = new StructuredLogger('foundry');

// Create specialized loggers
export const entityLogger = logger.child('entity');
export const authLogger = logger.child('auth');
export const partnerApiLogger = logger.child('partner-api');
export const webhookLogger = logger.child('webhook');
export const gdprLogger = logger.child('gdpr');
export const securityLogger = logger.child('security');

export default logger;
