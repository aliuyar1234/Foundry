/**
 * IP Allowlist Service
 *
 * Manages IP-based access control for entities.
 * Supports CIDR ranges, individual IPs, and wildcards.
 */

import { prisma } from '../../db/prisma';
import { redis } from '../../db/redis';

export interface IpAllowlistEntry {
  id: string;
  entityId: string;
  ipPattern: string;
  description?: string;
  createdAt: Date;
  expiresAt?: Date;
  createdBy: string;
}

export interface IpCheckResult {
  allowed: boolean;
  matchedRule?: string;
  reason?: string;
}

const CACHE_TTL = 300; // 5 minutes cache

export class IpAllowlistService {
  /**
   * Check if an IP is allowed for an entity
   */
  async checkIp(entityId: string, ip: string): Promise<IpCheckResult> {
    // Get entity IP settings
    const settings = await this.getEntityIpSettings(entityId);

    // If allowlist is disabled, allow all
    if (!settings.enabled) {
      return { allowed: true, reason: 'IP allowlist disabled' };
    }

    // Get allowlist rules
    const rules = await this.getAllowlistRules(entityId);

    // If no rules, deny all (when enabled)
    if (rules.length === 0) {
      return {
        allowed: false,
        reason: 'No allowlist rules configured',
      };
    }

    // Check each rule
    for (const rule of rules) {
      // Skip expired rules
      if (rule.expiresAt && rule.expiresAt < new Date()) {
        continue;
      }

      if (this.matchIpPattern(ip, rule.ipPattern)) {
        return {
          allowed: true,
          matchedRule: rule.ipPattern,
          reason: rule.description,
        };
      }
    }

    return {
      allowed: false,
      reason: 'IP not in allowlist',
    };
  }

  /**
   * Get entity IP settings
   */
  async getEntityIpSettings(entityId: string): Promise<{ enabled: boolean }> {
    const cacheKey = `ip:settings:${entityId}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { settings: true },
    });

    const settings = {
      enabled: (entity?.settings as any)?.ipAllowlistEnabled ?? false,
    };

    // Cache result
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(settings));

    return settings;
  }

  /**
   * Get allowlist rules for an entity
   */
  async getAllowlistRules(entityId: string): Promise<IpAllowlistEntry[]> {
    const cacheKey = `ip:rules:${entityId}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const rules = await prisma.ipAllowlistEntry.findMany({
      where: {
        entityId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Cache result
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(rules));

    return rules;
  }

  /**
   * Add an IP allowlist rule
   */
  async addRule(
    entityId: string,
    ipPattern: string,
    description: string,
    createdBy: string,
    expiresAt?: Date
  ): Promise<IpAllowlistEntry> {
    // Validate IP pattern
    if (!this.isValidIpPattern(ipPattern)) {
      throw new Error(`Invalid IP pattern: ${ipPattern}`);
    }

    const rule = await prisma.ipAllowlistEntry.create({
      data: {
        entityId,
        ipPattern,
        description,
        createdBy,
        expiresAt,
      },
    });

    // Invalidate cache
    await this.invalidateCache(entityId);

    // Audit log
    await this.logAudit(entityId, 'ADD_IP_RULE', {
      ipPattern,
      description,
      createdBy,
    });

    return rule;
  }

  /**
   * Remove an IP allowlist rule
   */
  async removeRule(entityId: string, ruleId: string, removedBy: string): Promise<void> {
    const rule = await prisma.ipAllowlistEntry.findFirst({
      where: { id: ruleId, entityId },
    });

    if (!rule) {
      throw new Error('Rule not found');
    }

    await prisma.ipAllowlistEntry.delete({
      where: { id: ruleId },
    });

    // Invalidate cache
    await this.invalidateCache(entityId);

    // Audit log
    await this.logAudit(entityId, 'REMOVE_IP_RULE', {
      ipPattern: rule.ipPattern,
      removedBy,
    });
  }

  /**
   * Enable or disable IP allowlist for an entity
   */
  async setEnabled(entityId: string, enabled: boolean, changedBy: string): Promise<void> {
    await prisma.entity.update({
      where: { id: entityId },
      data: {
        settings: {
          ...(await this.getEntitySettings(entityId)),
          ipAllowlistEnabled: enabled,
        },
      },
    });

    // Invalidate cache
    await this.invalidateCache(entityId);

    // Audit log
    await this.logAudit(entityId, enabled ? 'ENABLE_IP_ALLOWLIST' : 'DISABLE_IP_ALLOWLIST', {
      changedBy,
    });
  }

  /**
   * Check if IP matches a pattern (IP, CIDR, or wildcard)
   */
  private matchIpPattern(ip: string, pattern: string): boolean {
    // Exact match
    if (ip === pattern) {
      return true;
    }

    // Wildcard match (e.g., 192.168.1.*)
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '\\d{1,3}') + '$'
      );
      return regex.test(ip);
    }

    // CIDR match (e.g., 192.168.1.0/24)
    if (pattern.includes('/')) {
      return this.ipInCidr(ip, pattern);
    }

    return false;
  }

  /**
   * Check if IP is in CIDR range
   */
  private ipInCidr(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/');
    const mask = parseInt(bits, 10);

    if (isNaN(mask) || mask < 0 || mask > 32) {
      return false;
    }

    const ipNum = this.ipToNumber(ip);
    const rangeNum = this.ipToNumber(range);

    if (ipNum === null || rangeNum === null) {
      return false;
    }

    const maskNum = ~((1 << (32 - mask)) - 1);

    return (ipNum & maskNum) === (rangeNum & maskNum);
  }

  /**
   * Convert IP to number
   */
  private ipToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) {
      return null;
    }

    let result = 0;
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        return null;
      }
      result = (result << 8) + num;
    }

    return result >>> 0; // Convert to unsigned
  }

  /**
   * Validate IP pattern syntax
   */
  private isValidIpPattern(pattern: string): boolean {
    // IPv4 exact match
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(pattern)) {
      return this.ipToNumber(pattern) !== null;
    }

    // IPv4 with wildcard
    const wildcardRegex = /^(\d{1,3}|\*)\.(\d{1,3}|\*)\.(\d{1,3}|\*)\.(\d{1,3}|\*)$/;
    if (wildcardRegex.test(pattern)) {
      return true;
    }

    // CIDR notation
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (cidrRegex.test(pattern)) {
      const [ip, bits] = pattern.split('/');
      const mask = parseInt(bits, 10);
      return this.ipToNumber(ip) !== null && mask >= 0 && mask <= 32;
    }

    return false;
  }

  /**
   * Get entity settings
   */
  private async getEntitySettings(entityId: string): Promise<Record<string, any>> {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { settings: true },
    });
    return (entity?.settings as Record<string, any>) || {};
  }

  /**
   * Invalidate cache for entity
   */
  private async invalidateCache(entityId: string): Promise<void> {
    await redis.del(`ip:settings:${entityId}`);
    await redis.del(`ip:rules:${entityId}`);
  }

  /**
   * Log audit event
   */
  private async logAudit(
    entityId: string,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        entityId,
        action,
        details,
        timestamp: new Date(),
      },
    });
  }
}

export const ipAllowlistService = new IpAllowlistService();
