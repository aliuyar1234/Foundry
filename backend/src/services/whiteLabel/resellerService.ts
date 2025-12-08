/**
 * Reseller Service
 * SCALE Tier - Tasks T107-T108
 *
 * Manages reseller accounts and white-label customers
 */

import { PrismaClient, ResellerAccount, ResellerTier, Entity } from '@prisma/client';
import { AppError } from '../../lib/errors/AppError';

export interface ResellerServiceConfig {
  prisma: PrismaClient;
}

export interface CreateResellerInput {
  name: string;
  contactEmail: string;
  billingEmail: string;
  tier: ResellerTier;
  commissionRate?: number;
}

export interface UpdateResellerInput {
  name?: string;
  contactEmail?: string;
  billingEmail?: string;
  tier?: ResellerTier;
  commissionRate?: number;
  isActive?: boolean;
}

export interface AddCustomerInput {
  name: string;
  slug: string;
  configuration?: Record<string, unknown>;
}

// Commission rates by tier (percentage)
const TIER_COMMISSION_RATES: Record<ResellerTier, number> = {
  RESELLER_STARTER: 10,
  RESELLER_PROFESSIONAL: 20,
  RESELLER_ENTERPRISE: 30,
};

// Customer limits by tier
const TIER_CUSTOMER_LIMITS: Record<ResellerTier, number> = {
  RESELLER_STARTER: 10,
  RESELLER_PROFESSIONAL: 50,
  RESELLER_ENTERPRISE: -1, // Unlimited
};

export class ResellerService {
  private prisma: PrismaClient;

  constructor(config: ResellerServiceConfig) {
    this.prisma = config.prisma;
  }

  // ==========================================================================
  // T107-T108: Reseller CRUD Operations
  // ==========================================================================

  /**
   * Create a new reseller account
   */
  async create(input: CreateResellerInput): Promise<ResellerAccount> {
    // Validate email formats
    this.validateEmail(input.contactEmail, 'contact');
    this.validateEmail(input.billingEmail, 'billing');

    // Set default commission rate based on tier if not provided
    const commissionRate = input.commissionRate ?? TIER_COMMISSION_RATES[input.tier];

    return this.prisma.resellerAccount.create({
      data: {
        name: input.name,
        contactEmail: input.contactEmail,
        billingEmail: input.billingEmail,
        tier: input.tier,
        commissionRate,
      },
    });
  }

  /**
   * Get reseller by ID
   */
  async getById(id: string): Promise<ResellerAccount | null> {
    return this.prisma.resellerAccount.findUnique({
      where: { id },
    });
  }

  /**
   * Get reseller with all details
   */
  async getByIdWithDetails(id: string): Promise<
    | (ResellerAccount & {
        whiteLabelConfigs: { id: string; name: string; customDomain: string | null }[];
        entities: { id: string; name: string; status: string }[];
        _count: { entities: number };
      })
    | null
  > {
    return this.prisma.resellerAccount.findUnique({
      where: { id },
      include: {
        whiteLabelConfigs: {
          select: {
            id: true,
            name: true,
            customDomain: true,
          },
        },
        entities: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        _count: {
          select: { entities: true },
        },
      },
    });
  }

  /**
   * List all resellers
   */
  async list(options?: {
    isActive?: boolean;
    tier?: ResellerTier;
    skip?: number;
    take?: number;
  }): Promise<{ resellers: ResellerAccount[]; total: number }> {
    const where = {
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
      ...(options?.tier && { tier: options.tier }),
    };

    const [resellers, total] = await Promise.all([
      this.prisma.resellerAccount.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { entities: true },
          },
        },
      }),
      this.prisma.resellerAccount.count({ where }),
    ]);

    return { resellers, total };
  }

  /**
   * Update reseller account
   */
  async update(id: string, input: UpdateResellerInput): Promise<ResellerAccount> {
    if (input.contactEmail) {
      this.validateEmail(input.contactEmail, 'contact');
    }
    if (input.billingEmail) {
      this.validateEmail(input.billingEmail, 'billing');
    }

    return this.prisma.resellerAccount.update({
      where: { id },
      data: {
        name: input.name,
        contactEmail: input.contactEmail,
        billingEmail: input.billingEmail,
        tier: input.tier,
        commissionRate: input.commissionRate,
        isActive: input.isActive,
      },
    });
  }

  /**
   * Deactivate reseller account
   */
  async deactivate(id: string): Promise<ResellerAccount> {
    return this.prisma.resellerAccount.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Delete reseller account
   */
  async delete(id: string): Promise<void> {
    // Check if reseller has active customers
    const customers = await this.prisma.entity.count({
      where: { resellerId: id },
    });

    if (customers > 0) {
      throw new AppError(
        'RESELLER_HAS_CUSTOMERS',
        `Cannot delete reseller with ${customers} active customers. Deactivate or migrate customers first.`
      );
    }

    await this.prisma.resellerAccount.delete({
      where: { id },
    });
  }

  // ==========================================================================
  // Customer Management
  // ==========================================================================

  /**
   * Add customer to reseller
   */
  async addCustomer(resellerId: string, input: AddCustomerInput): Promise<Entity> {
    const reseller = await this.getById(resellerId);
    if (!reseller) {
      throw new AppError('RESELLER_NOT_FOUND', 'Reseller account not found');
    }

    if (!reseller.isActive) {
      throw new AppError('RESELLER_INACTIVE', 'Reseller account is not active');
    }

    // Check customer limit
    await this.checkCustomerLimit(resellerId, reseller.tier);

    // Check slug uniqueness
    const existingEntity = await this.prisma.entity.findUnique({
      where: { slug: input.slug },
    });

    if (existingEntity) {
      throw new AppError('SLUG_EXISTS', 'An entity with this slug already exists');
    }

    return this.prisma.entity.create({
      data: {
        name: input.name,
        slug: input.slug,
        configuration: input.configuration || {},
        resellerId,
      },
    });
  }

  /**
   * List customers for reseller
   */
  async listCustomers(
    resellerId: string,
    options?: {
      status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
      skip?: number;
      take?: number;
    }
  ): Promise<{ customers: Entity[]; total: number }> {
    const where = {
      resellerId,
      ...(options?.status && { status: options.status }),
    };

    const [customers, total] = await Promise.all([
      this.prisma.entity.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.entity.count({ where }),
    ]);

    return { customers, total };
  }

  /**
   * Remove customer from reseller
   */
  async removeCustomer(resellerId: string, entityId: string): Promise<void> {
    const entity = await this.prisma.entity.findFirst({
      where: { id: entityId, resellerId },
    });

    if (!entity) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found for this reseller');
    }

    // Unlink from reseller (don't delete the entity)
    await this.prisma.entity.update({
      where: { id: entityId },
      data: { resellerId: null },
    });
  }

  // ==========================================================================
  // Tier Management
  // ==========================================================================

  /**
   * Get tier limits and features
   */
  getTierLimits(tier: ResellerTier): {
    customerLimit: number;
    commissionRate: number;
    features: string[];
  } {
    const features: Record<ResellerTier, string[]> = {
      RESELLER_STARTER: ['basic_branding', 'email_support'],
      RESELLER_PROFESSIONAL: [
        'basic_branding',
        'custom_domain',
        'priority_support',
        'analytics_dashboard',
      ],
      RESELLER_ENTERPRISE: [
        'full_branding',
        'custom_domain',
        'dedicated_support',
        'analytics_dashboard',
        'api_access',
        'custom_integrations',
      ],
    };

    return {
      customerLimit: TIER_CUSTOMER_LIMITS[tier],
      commissionRate: TIER_COMMISSION_RATES[tier],
      features: features[tier],
    };
  }

  /**
   * Upgrade reseller tier
   */
  async upgradeTier(id: string, newTier: ResellerTier): Promise<ResellerAccount> {
    const reseller = await this.getById(id);
    if (!reseller) {
      throw new AppError('RESELLER_NOT_FOUND', 'Reseller account not found');
    }

    // Calculate new commission rate based on tier
    const newCommissionRate = TIER_COMMISSION_RATES[newTier];

    return this.prisma.resellerAccount.update({
      where: { id },
      data: {
        tier: newTier,
        commissionRate: newCommissionRate,
      },
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Validate email format
   */
  private validateEmail(email: string, type: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('INVALID_EMAIL', `Invalid ${type} email format`);
    }
  }

  /**
   * Check customer limit for tier
   */
  private async checkCustomerLimit(resellerId: string, tier: ResellerTier): Promise<void> {
    const limit = TIER_CUSTOMER_LIMITS[tier];
    if (limit === -1) return; // Unlimited

    const currentCount = await this.prisma.entity.count({
      where: { resellerId },
    });

    if (currentCount >= limit) {
      throw new AppError(
        'CUSTOMER_LIMIT_REACHED',
        `Customer limit of ${limit} reached for ${tier} tier. Upgrade to add more customers.`
      );
    }
  }
}
