/**
 * Test Helper Utilities
 * Common utilities for testing
 */

import { performance } from 'perf_hooks';

/**
 * Wait for a specified duration
 */
export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function until it succeeds or max attempts reached
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    exponentialBackoff?: boolean;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, exponentialBackoff = false } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts - 1) {
        const delay = exponentialBackoff ? delayMs * Math.pow(2, attempt) : delayMs;
        await wait(delay);
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const startTime = performance.now();
  const result = await fn();
  const endTime = performance.now();

  return {
    result,
    durationMs: endTime - startTime,
  };
}

/**
 * Assert that a function completes within a time limit
 */
export async function assertWithinTime<T>(
  fn: () => Promise<T>,
  maxTimeMs: number
): Promise<T> {
  const { result, durationMs } = await measureTime(fn);

  if (durationMs > maxTimeMs) {
    throw new Error(
      `Function took ${durationMs.toFixed(2)}ms, expected < ${maxTimeMs}ms`
    );
  }

  return result;
}

/**
 * Create a mock function that can be controlled
 */
export function createControllableMock<T>() {
  let resolveValue: T | undefined;
  let rejectValue: Error | undefined;
  let shouldDelay = false;
  let delayMs = 0;
  const calls: unknown[][] = [];

  const fn = async (...args: unknown[]): Promise<T> => {
    calls.push(args);

    if (shouldDelay) {
      await wait(delayMs);
    }

    if (rejectValue) {
      throw rejectValue;
    }

    return resolveValue as T;
  };

  return {
    fn,
    calls,
    resolve: (value: T) => {
      resolveValue = value;
      rejectValue = undefined;
    },
    reject: (error: Error) => {
      rejectValue = error;
      resolveValue = undefined;
    },
    withDelay: (ms: number) => {
      shouldDelay = true;
      delayMs = ms;
    },
    reset: () => {
      calls.length = 0;
      resolveValue = undefined;
      rejectValue = undefined;
      shouldDelay = false;
      delayMs = 0;
    },
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Generate random string
 */
export function randomString(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate random number within range
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Create a mock Redis client for testing
 */
export function createMockRedis() {
  const storage = new Map<
    string,
    { value: string; ttl: number; timestamp: number }
  >();

  return {
    storage,

    async get(key: string): Promise<string | null> {
      const item = storage.get(key);
      if (!item) return null;

      const elapsed = Date.now() - item.timestamp;
      if (item.ttl > 0 && elapsed > item.ttl * 1000) {
        storage.delete(key);
        return null;
      }

      return item.value;
    },

    async set(key: string, value: string, ...args: unknown[]): Promise<string> {
      let ttl = -1;
      if (args[0] === 'EX' && typeof args[1] === 'number') {
        ttl = args[1];
      }
      storage.set(key, { value, ttl, timestamp: Date.now() });
      return 'OK';
    },

    async del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const key of keys) {
        if (storage.delete(key)) count++;
      }
      return count;
    },

    async exists(key: string): Promise<number> {
      return storage.has(key) ? 1 : 0;
    },

    async keys(pattern: string): Promise<string[]> {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return Array.from(storage.keys()).filter((key) => regex.test(key));
    },

    async ttl(key: string): Promise<number> {
      const item = storage.get(key);
      if (!item) return -2;
      if (item.ttl < 0) return -1;

      const elapsed = Date.now() - item.timestamp;
      const remaining = item.ttl - Math.floor(elapsed / 1000);
      return remaining > 0 ? remaining : -2;
    },

    async incr(key: string): Promise<number> {
      const item = storage.get(key);
      let count = 1;

      if (item) {
        const elapsed = Date.now() - item.timestamp;
        if (item.ttl < 0 || elapsed <= item.ttl * 1000) {
          count = parseInt(item.value, 10) + 1;
          storage.set(key, {
            value: count.toString(),
            ttl: item.ttl,
            timestamp: item.timestamp,
          });
        } else {
          storage.set(key, { value: '1', ttl: -1, timestamp: Date.now() });
        }
      } else {
        storage.set(key, { value: '1', ttl: -1, timestamp: Date.now() });
      }

      return count;
    },

    async expire(key: string, seconds: number): Promise<number> {
      const item = storage.get(key);
      if (item) {
        storage.set(key, { ...item, ttl: seconds, timestamp: Date.now() });
        return 1;
      }
      return 0;
    },

    multi() {
      const ops: Array<{ op: string; args: unknown[] }> = [];

      return {
        get(key: string) {
          ops.push({ op: 'get', args: [key] });
          return this;
        },
        set(key: string, value: string, ...args: unknown[]) {
          ops.push({ op: 'set', args: [key, value, ...args] });
          return this;
        },
        incr(key: string) {
          ops.push({ op: 'incr', args: [key] });
          return this;
        },
        expire(key: string, seconds: number) {
          ops.push({ op: 'expire', args: [key, seconds] });
          return this;
        },
        ttl(key: string) {
          ops.push({ op: 'ttl', args: [key] });
          return this;
        },
        async exec() {
          const results: Array<[Error | null, unknown]> = [];

          for (const { op, args } of ops) {
            try {
              let result: unknown;
              if (op === 'get') {
                result = await this.get(args[0] as string);
              } else if (op === 'set') {
                result = await this.set(
                  args[0] as string,
                  args[1] as string,
                  ...args.slice(2)
                );
              } else if (op === 'incr') {
                result = await this.incr(args[0] as string);
              } else if (op === 'expire') {
                result = await this.expire(args[0] as string, args[1] as number);
              } else if (op === 'ttl') {
                result = await this.ttl(args[0] as string);
              }
              results.push([null, result]);
            } catch (error) {
              results.push([error as Error, null]);
            }
          }

          return results;
        },
        get: (key: string) => this.get(key),
        set: (key: string, value: string, ...args: unknown[]) =>
          this.set(key, value, ...args),
        incr: (key: string) => this.incr(key),
        expire: (key: string, seconds: number) => this.expire(key, seconds),
        ttl: (key: string) => this.ttl(key),
      };
    },
  };
}

/**
 * Assert that an async function throws an error
 */
export async function assertThrows(
  fn: () => Promise<unknown>,
  expectedError?: string | RegExp
): Promise<void> {
  let thrown = false;
  let error: Error | undefined;

  try {
    await fn();
  } catch (e) {
    thrown = true;
    error = e as Error;
  }

  if (!thrown) {
    throw new Error('Expected function to throw an error');
  }

  if (expectedError) {
    if (typeof expectedError === 'string') {
      if (!error?.message.includes(expectedError)) {
        throw new Error(
          `Expected error message to include "${expectedError}", got "${error?.message}"`
        );
      }
    } else {
      if (!expectedError.test(error?.message || '')) {
        throw new Error(
          `Expected error message to match ${expectedError}, got "${error?.message}"`
        );
      }
    }
  }
}

/**
 * Create a mock logger that captures log messages
 */
export function createMockLogger() {
  const logs: Array<{ level: string; message: string; meta?: unknown }> = [];

  return {
    logs,
    debug: (message: string, meta?: unknown) => logs.push({ level: 'debug', message, meta }),
    info: (message: string, meta?: unknown) => logs.push({ level: 'info', message, meta }),
    warn: (message: string, meta?: unknown) => logs.push({ level: 'warn', message, meta }),
    error: (message: string, meta?: unknown) => logs.push({ level: 'error', message, meta }),
    clear: () => (logs.length = 0),
    getByLevel: (level: string) => logs.filter((log) => log.level === level),
    contains: (searchText: string) =>
      logs.some((log) => log.message.includes(searchText)),
  };
}
