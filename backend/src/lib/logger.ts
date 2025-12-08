/**
 * Structured Logger
 * Provides consistent, structured logging across the application
 */

import pino from 'pino';

// Log levels
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Create the base logger
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'foundry',
    version: process.env.npm_package_version || '1.0.0',
  },
});

// Create child loggers for specific modules
export function createLogger(module: string): pino.Logger {
  return logger.child({ module });
}

export default logger;
