/**
 * Prisma Client Singleton
 *
 * IMPORTANT: All modules should import prisma from this file instead of
 * creating their own PrismaClient instances. Multiple instances cause:
 * - Connection pool exhaustion
 * - Increased memory usage
 * - Potential connection leaks
 *
 * Usage:
 *   import { prisma } from '../lib/prisma.js';
 *   // or from deeper paths:
 *   import { prisma } from '../../lib/prisma.js';
 */

import { PrismaClient } from '@prisma/client';

// Declare global type for storing singleton in development
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Create Prisma client with recommended settings
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
    errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
  });
}

/**
 * Singleton Prisma client instance
 *
 * In development, we store the client on globalThis to prevent
 * hot-reload from creating multiple instances.
 * In production, we just use a module-level singleton.
 */
export const prisma: PrismaClient =
  process.env.NODE_ENV === 'production'
    ? createPrismaClient()
    : (globalThis.__prisma ??= createPrismaClient());

/**
 * Graceful shutdown helper
 * Call this in your shutdown handler
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Connect to database
 * Call this during server startup
 */
export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
}

export default prisma;
