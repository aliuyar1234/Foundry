/**
 * OpenTelemetry Distributed Tracing Setup
 * T366 - Implement distributed tracing (OpenTelemetry)
 *
 * Provides distributed tracing capabilities using OpenTelemetry
 * for end-to-end request visibility across services.
 */

import {
  trace,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  Span,
  Tracer,
  Context,
  SpanOptions,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PrismaInstrumentation } from '@opentelemetry/instrumentation-prisma';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';

// ==========================================================================
// Types
// ==========================================================================

export interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  enabled: boolean;
  exporter: 'jaeger' | 'otlp' | 'console' | 'none';
  jaegerEndpoint?: string;
  otlpEndpoint?: string;
  samplingRatio?: number;
  debug?: boolean;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

// ==========================================================================
// Default Configuration
// ==========================================================================

const DEFAULT_CONFIG: TracingConfig = {
  serviceName: process.env.SERVICE_NAME || 'foundry-api',
  serviceVersion: process.env.APP_VERSION || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  enabled: process.env.TRACING_ENABLED === 'true',
  exporter: (process.env.TRACING_EXPORTER as TracingConfig['exporter']) || 'jaeger',
  jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
  otlpEndpoint: process.env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  samplingRatio: parseFloat(process.env.TRACING_SAMPLE_RATIO || '1.0'),
  debug: process.env.TRACING_DEBUG === 'true',
};

// ==========================================================================
// Tracing Setup
// ==========================================================================

let provider: NodeTracerProvider | null = null;
let mainTracer: Tracer | null = null;

/**
 * Initialize OpenTelemetry tracing
 */
export function initTracing(config: Partial<TracingConfig> = {}): void {
  const tracingConfig = { ...DEFAULT_CONFIG, ...config };

  if (!tracingConfig.enabled) {
    console.log('Tracing is disabled');
    return;
  }

  // Create resource with service information
  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: tracingConfig.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: tracingConfig.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: tracingConfig.environment,
    })
  );

  // Create tracer provider
  provider = new NodeTracerProvider({
    resource,
  });

  // Configure exporter
  let exporter;
  switch (tracingConfig.exporter) {
    case 'jaeger':
      exporter = new JaegerExporter({
        endpoint: tracingConfig.jaegerEndpoint,
      });
      break;

    case 'otlp':
      exporter = new OTLPTraceExporter({
        url: tracingConfig.otlpEndpoint,
      });
      break;

    case 'console':
      // Use simple processor for console output
      provider.addSpanProcessor(
        new SimpleSpanProcessor({
          export: (spans, callback) => {
            spans.forEach((span) => {
              console.log('SPAN:', JSON.stringify(span, null, 2));
            });
            callback({ code: 0 });
          },
          shutdown: () => Promise.resolve(),
        })
      );
      break;

    case 'none':
    default:
      break;
  }

  // Add batch processor for production exporters
  if (exporter) {
    const processor =
      tracingConfig.environment === 'production'
        ? new BatchSpanProcessor(exporter, {
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 5000,
            exportTimeoutMillis: 30000,
          })
        : new SimpleSpanProcessor(exporter);

    provider.addSpanProcessor(processor);
  }

  // Set up context propagation
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  // Register provider
  provider.register();

  // Register auto-instrumentations
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingPaths: ['/health', '/metrics', '/ready'],
      }),
      new FastifyInstrumentation(),
      new PrismaInstrumentation(),
      new RedisInstrumentation(),
    ],
  });

  // Get main tracer
  mainTracer = trace.getTracer(tracingConfig.serviceName, tracingConfig.serviceVersion);

  console.log(`Tracing initialized with ${tracingConfig.exporter} exporter`);
}

/**
 * Shutdown tracing
 */
export async function shutdownTracing(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    console.log('Tracing shutdown complete');
  }
}

// ==========================================================================
// Tracer Access
// ==========================================================================

/**
 * Get the main tracer instance
 */
export function getTracer(): Tracer {
  if (!mainTracer) {
    mainTracer = trace.getTracer('foundry-api');
  }
  return mainTracer;
}

/**
 * Get current active span
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Get current span context
 */
export function getSpanContext(): SpanContext | undefined {
  const span = getActiveSpan();
  if (!span) return undefined;

  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    traceFlags: ctx.traceFlags,
  };
}

// ==========================================================================
// Span Creation Helpers
// ==========================================================================

/**
 * Start a new span
 */
export function startSpan(
  name: string,
  options?: SpanOptions,
  parentContext?: Context
): Span {
  const tracer = getTracer();
  const ctx = parentContext || context.active();
  return tracer.startSpan(name, options, ctx);
}

/**
 * Execute function within a span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    ...options,
  });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () =>
      fn(span)
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Execute sync function within a span
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: SpanOptions
): T {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    ...options,
  });

  try {
    const result = context.with(trace.setSpan(context.active(), span), () =>
      fn(span)
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

// ==========================================================================
// Entity-Specific Tracing
// ==========================================================================

/**
 * Create span for entity operation
 */
export async function traceEntityOperation<T>(
  operation: string,
  entityId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    `entity.${operation}`,
    async (span) => {
      span.setAttribute('entity.id', entityId);
      span.setAttribute('entity.operation', operation);
      return fn(span);
    },
    { kind: SpanKind.INTERNAL }
  );
}

/**
 * Create span for database operation
 */
export async function traceDbOperation<T>(
  operation: string,
  table: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    `db.${operation}`,
    async (span) => {
      span.setAttribute('db.operation', operation);
      span.setAttribute('db.table', table);
      span.setAttribute('db.system', 'postgresql');
      return fn(span);
    },
    { kind: SpanKind.CLIENT }
  );
}

/**
 * Create span for external API call
 */
export async function traceExternalCall<T>(
  service: string,
  operation: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    `external.${service}.${operation}`,
    async (span) => {
      span.setAttribute('peer.service', service);
      span.setAttribute('external.operation', operation);
      return fn(span);
    },
    { kind: SpanKind.CLIENT }
  );
}

/**
 * Create span for webhook delivery
 */
export async function traceWebhookDelivery<T>(
  subscriptionId: string,
  eventType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    `webhook.deliver`,
    async (span) => {
      span.setAttribute('webhook.subscription_id', subscriptionId);
      span.setAttribute('webhook.event_type', eventType);
      return fn(span);
    },
    { kind: SpanKind.PRODUCER }
  );
}

/**
 * Create span for job processing
 */
export async function traceJobProcessing<T>(
  queue: string,
  jobType: string,
  jobId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    `job.process.${jobType}`,
    async (span) => {
      span.setAttribute('job.queue', queue);
      span.setAttribute('job.type', jobType);
      span.setAttribute('job.id', jobId);
      return fn(span);
    },
    { kind: SpanKind.CONSUMER }
  );
}

// ==========================================================================
// Context Propagation
// ==========================================================================

/**
 * Extract trace context from headers
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>
): Context {
  const carrier: Record<string, string> = {};

  // Normalize headers
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      carrier[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }

  return propagation.extract(context.active(), carrier);
}

/**
 * Inject trace context into headers
 */
export function injectTraceContext(
  headers: Record<string, string> = {}
): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}

/**
 * Get trace headers for outgoing request
 */
export function getTraceHeaders(): Record<string, string> {
  return injectTraceContext();
}

// ==========================================================================
// Span Attribute Helpers
// ==========================================================================

/**
 * Add entity context to current span
 */
export function addEntityContext(entityId: string, entityName?: string): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttribute('entity.id', entityId);
    if (entityName) {
      span.setAttribute('entity.name', entityName);
    }
  }
}

/**
 * Add user context to current span
 */
export function addUserContext(userId: string, userEmail?: string): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttribute('user.id', userId);
    if (userEmail) {
      span.setAttribute('user.email', userEmail);
    }
  }
}

/**
 * Add error to current span
 */
export function recordError(error: Error): void {
  const span = getActiveSpan();
  if (span) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
  }
}

/**
 * Add event to current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, unknown>): void {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes as any);
  }
}

export default {
  initTracing,
  shutdownTracing,
  getTracer,
  getActiveSpan,
  getSpanContext,
  startSpan,
  withSpan,
  withSpanSync,
  traceEntityOperation,
  traceDbOperation,
  traceExternalCall,
  traceWebhookDelivery,
  traceJobProcessing,
  extractTraceContext,
  injectTraceContext,
  getTraceHeaders,
  addEntityContext,
  addUserContext,
  recordError,
  addSpanEvent,
};
