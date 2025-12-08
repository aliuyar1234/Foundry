/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when a service is unavailable
 */

import { logger } from './logger.js';

const cbLogger = logger.child({ service: 'CircuitBreaker' });

// Circuit breaker states
export enum CircuitState {
  CLOSED = 'closed',     // Normal operation - requests flow through
  OPEN = 'open',         // Failure threshold exceeded - requests fail fast
  HALF_OPEN = 'half_open' // Testing if service has recovered
}

export interface CircuitBreakerOptions {
  /** Name of the circuit breaker (for logging) */
  name: string;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting to close circuit (default: 30000) */
  resetTimeout?: number;
  /** Number of successful requests in half-open state to close circuit (default: 2) */
  successThreshold?: number;
  /** Timeout for individual requests in ms (default: 10000) */
  requestTimeout?: number;
  /** Custom function to determine if error should count as failure */
  isFailure?: (error: Error) => boolean;
  /** Callback when circuit opens */
  onOpen?: () => void;
  /** Callback when circuit closes */
  onClose?: () => void;
  /** Callback when circuit enters half-open state */
  onHalfOpen?: () => void;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

/**
 * Circuit Breaker Implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttempt = 0;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly requestTimeout: number;
  private readonly isFailure: (error: Error) => boolean;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;
  private readonly onHalfOpen?: () => void;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.successThreshold = options.successThreshold ?? 2;
    this.requestTimeout = options.requestTimeout ?? 10000;
    this.isFailure = options.isFailure ?? (() => true);
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onHalfOpen = options.onHalfOpen;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitOpenError(
          `Circuit breaker '${this.name}' is open`,
          this.nextAttempt - Date.now()
        );
      }
      // Time to try again - move to half-open
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      // Execute with timeout
      const result = await this.withTimeout(fn(), this.requestTimeout);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.transitionTo(CircuitState.CLOSED);
    cbLogger.info({ name: this.name }, 'Circuit breaker manually reset');
  }

  /**
   * Check if circuit is allowing requests
   */
  isAvailable(): boolean {
    if (this.state === CircuitState.CLOSED) return true;
    if (this.state === CircuitState.HALF_OPEN) return true;
    return Date.now() >= this.nextAttempt;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms)
      ),
    ]);
  }

  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else {
      // Reset failure count on success in closed state
      this.failures = 0;
    }
  }

  private onError(error: Error): void {
    // Check if this error should count as a failure
    if (!this.isFailure(error)) {
      return;
    }

    this.lastFailureTime = Date.now();
    this.totalFailures++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      this.failures++;
      if (this.failures >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    cbLogger.info(
      { name: this.name, oldState, newState, failures: this.failures },
      `Circuit breaker state change: ${oldState} -> ${newState}`
    );

    switch (newState) {
      case CircuitState.OPEN:
        this.nextAttempt = Date.now() + this.resetTimeout;
        this.successes = 0;
        this.onOpen?.();
        break;
      case CircuitState.HALF_OPEN:
        this.successes = 0;
        this.onHalfOpen?.();
        break;
      case CircuitState.CLOSED:
        this.failures = 0;
        this.successes = 0;
        this.onClose?.();
        break;
    }
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number
  ) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// =============================================================================
// Pre-configured Circuit Breakers
// =============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker by name
 */
export function getCircuitBreaker(
  name: string,
  options?: Partial<Omit<CircuitBreakerOptions, 'name'>>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(
      name,
      new CircuitBreaker({ name, ...options })
    );
  }
  return circuitBreakers.get(name)!;
}

/**
 * Get all circuit breaker statistics
 */
export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  return Array.from(circuitBreakers.values()).map((cb) => cb.getStats());
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach((cb) => cb.reset());
}

// Pre-configured breakers for common external services
export const circuitBreakers_config = {
  redis: {
    failureThreshold: 3,
    resetTimeout: 10000,
    successThreshold: 2,
    requestTimeout: 5000,
  },
  database: {
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
    requestTimeout: 10000,
  },
  externalApi: {
    failureThreshold: 5,
    resetTimeout: 60000,
    successThreshold: 3,
    requestTimeout: 30000,
  },
  connector: {
    failureThreshold: 3,
    resetTimeout: 60000,
    successThreshold: 2,
    requestTimeout: 60000,
  },
};

export default CircuitBreaker;
