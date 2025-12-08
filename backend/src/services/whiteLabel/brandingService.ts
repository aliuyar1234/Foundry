/**
 * Branding Service
 * SCALE Tier - Tasks T109-T113
 *
 * Manages white-label branding configuration
 */

import { PrismaClient, WhiteLabelConfig } from '@prisma/client';
import { AppError } from '../../lib/errors/AppError';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

export interface BrandingServiceConfig {
  prisma: PrismaClient;
  uploadDir?: string;
  maxLogoSize?: number; // bytes
}

export interface BrandingColors {
  primary: string;
  secondary: string;
  accent?: string;
  background?: string;
  surface?: string;
  text?: string;
  textSecondary?: string;
  error?: string;
  warning?: string;
  success?: string;
}

export interface BrandingFonts {
  heading?: string;
  body?: string;
  mono?: string;
}

export interface BrandingConfig {
  logo?: string;
  logoUrl?: string;
  logoDark?: string;
  logoDarkUrl?: string;
  favicon?: string;
  faviconUrl?: string;
  colors: BrandingColors;
  fonts?: BrandingFonts;
  companyName?: string;
  supportEmail?: string;
  supportUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
}

export interface CreateBrandingInput {
  resellerId: string;
  name: string;
  branding: BrandingConfig;
  customCss?: string;
  customDomain?: string;
  features?: Record<string, boolean>;
}

export interface UpdateBrandingInput {
  name?: string;
  branding?: Partial<BrandingConfig>;
  customCss?: string;
  customDomain?: string;
  features?: Record<string, boolean>;
  isActive?: boolean;
}

// Valid color format regex (hex)
const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

// Allowed image types
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

// Max image sizes
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_FAVICON_SIZE = 100 * 1024; // 100KB

// Recommended image dimensions
const LOGO_DIMENSIONS = { minWidth: 100, maxWidth: 800, minHeight: 32, maxHeight: 200 };
const FAVICON_DIMENSIONS = { width: 32, height: 32 };

export class BrandingService {
  private prisma: PrismaClient;
  private uploadDir: string;
  private maxLogoSize: number;

  constructor(config: BrandingServiceConfig) {
    this.prisma = config.prisma;
    this.uploadDir = config.uploadDir || './uploads/branding';
    this.maxLogoSize = config.maxLogoSize || MAX_LOGO_SIZE;
  }

  // ==========================================================================
  // T109-T110: Branding Configuration CRUD
  // ==========================================================================

  /**
   * Create white-label branding configuration
   */
  async create(input: CreateBrandingInput): Promise<WhiteLabelConfig> {
    // Validate branding
    this.validateBranding(input.branding);

    // Validate custom CSS if provided
    if (input.customCss) {
      this.validateCustomCss(input.customCss);
    }

    // Check reseller exists
    const reseller = await this.prisma.resellerAccount.findUnique({
      where: { id: input.resellerId },
    });

    if (!reseller) {
      throw new AppError('RESELLER_NOT_FOUND', 'Reseller account not found');
    }

    // Check custom domain uniqueness
    if (input.customDomain) {
      const existing = await this.prisma.whiteLabelConfig.findUnique({
        where: { customDomain: input.customDomain },
      });

      if (existing) {
        throw new AppError('DOMAIN_EXISTS', 'Custom domain is already in use');
      }
    }

    return this.prisma.whiteLabelConfig.create({
      data: {
        resellerId: input.resellerId,
        name: input.name,
        branding: input.branding as unknown as Record<string, unknown>,
        customCss: input.customCss,
        customDomain: input.customDomain,
        features: input.features || {},
      },
    });
  }

  /**
   * Get branding configuration by ID
   */
  async getById(id: string): Promise<WhiteLabelConfig | null> {
    return this.prisma.whiteLabelConfig.findUnique({
      where: { id },
    });
  }

  /**
   * Get branding configuration by custom domain
   */
  async getByDomain(domain: string): Promise<WhiteLabelConfig | null> {
    return this.prisma.whiteLabelConfig.findUnique({
      where: { customDomain: domain },
    });
  }

  /**
   * List branding configurations for reseller
   */
  async listByReseller(resellerId: string): Promise<WhiteLabelConfig[]> {
    return this.prisma.whiteLabelConfig.findMany({
      where: { resellerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update branding configuration
   */
  async update(id: string, input: UpdateBrandingInput): Promise<WhiteLabelConfig> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new AppError('CONFIG_NOT_FOUND', 'White-label configuration not found');
    }

    // Validate branding if provided
    if (input.branding) {
      const mergedBranding = {
        ...(existing.branding as unknown as BrandingConfig),
        ...input.branding,
      };
      this.validateBranding(mergedBranding);
    }

    // Validate custom CSS if provided
    if (input.customCss) {
      this.validateCustomCss(input.customCss);
    }

    // Check custom domain uniqueness
    if (input.customDomain && input.customDomain !== existing.customDomain) {
      const domainExists = await this.prisma.whiteLabelConfig.findUnique({
        where: { customDomain: input.customDomain },
      });

      if (domainExists) {
        throw new AppError('DOMAIN_EXISTS', 'Custom domain is already in use');
      }
    }

    return this.prisma.whiteLabelConfig.update({
      where: { id },
      data: {
        name: input.name,
        branding: input.branding
          ? {
              ...(existing.branding as object),
              ...input.branding,
            }
          : undefined,
        customCss: input.customCss,
        customDomain: input.customDomain,
        features: input.features,
        isActive: input.isActive,
      },
    });
  }

  /**
   * Delete branding configuration
   */
  async delete(id: string): Promise<void> {
    await this.prisma.whiteLabelConfig.delete({
      where: { id },
    });
  }

  // ==========================================================================
  // T111: Custom CSS Support
  // ==========================================================================

  /**
   * Update custom CSS for branding
   */
  async updateCustomCss(id: string, css: string): Promise<WhiteLabelConfig> {
    this.validateCustomCss(css);

    return this.prisma.whiteLabelConfig.update({
      where: { id },
      data: { customCss: css },
    });
  }

  /**
   * Generate CSS variables from branding config
   */
  generateCssVariables(branding: BrandingConfig): string {
    const vars: string[] = [];

    // Color variables
    if (branding.colors) {
      for (const [key, value] of Object.entries(branding.colors)) {
        if (value) {
          vars.push(`  --color-${this.kebabCase(key)}: ${value};`);
        }
      }
    }

    // Font variables
    if (branding.fonts) {
      for (const [key, value] of Object.entries(branding.fonts)) {
        if (value) {
          vars.push(`  --font-${key}: ${value};`);
        }
      }
    }

    return `:root {\n${vars.join('\n')}\n}`;
  }

  // ==========================================================================
  // T112: Logo Upload Service
  // ==========================================================================

  /**
   * Upload logo file
   */
  async uploadLogo(
    configId: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
    },
    type: 'logo' | 'logoDark' | 'favicon'
  ): Promise<{ url: string }> {
    // Validate config exists
    const config = await this.getById(configId);
    if (!config) {
      throw new AppError('CONFIG_NOT_FOUND', 'White-label configuration not found');
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new AppError(
        'INVALID_FILE_TYPE',
        `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`
      );
    }

    // Validate file size
    const maxSize = type === 'favicon' ? MAX_FAVICON_SIZE : this.maxLogoSize;
    if (file.buffer.length > maxSize) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `File size exceeds maximum of ${Math.round(maxSize / 1024)}KB`
      );
    }

    // Generate unique filename
    const ext = path.extname(file.originalname);
    const filename = `${configId}-${type}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const uploadPath = path.join(this.uploadDir, filename);

    // Ensure upload directory exists
    await fs.mkdir(this.uploadDir, { recursive: true });

    // Save file
    await fs.writeFile(uploadPath, file.buffer);

    // Generate URL
    const url = `/branding/${filename}`;

    // Update config with new logo URL
    const branding = config.branding as unknown as BrandingConfig;
    const updatedBranding = {
      ...branding,
      [`${type}Url`]: url,
    };

    await this.prisma.whiteLabelConfig.update({
      where: { id: configId },
      data: {
        branding: updatedBranding as unknown as Record<string, unknown>,
      },
    });

    return { url };
  }

  /**
   * Delete logo file
   */
  async deleteLogo(
    configId: string,
    type: 'logo' | 'logoDark' | 'favicon'
  ): Promise<void> {
    const config = await this.getById(configId);
    if (!config) {
      throw new AppError('CONFIG_NOT_FOUND', 'White-label configuration not found');
    }

    const branding = config.branding as unknown as BrandingConfig;
    const urlKey = `${type}Url` as keyof BrandingConfig;
    const logoUrl = branding[urlKey] as string | undefined;

    if (logoUrl) {
      // Extract filename from URL
      const filename = path.basename(logoUrl);
      const filePath = path.join(this.uploadDir, filename);

      // Delete file if exists
      try {
        await fs.unlink(filePath);
      } catch {
        // File may not exist, ignore error
      }

      // Remove URL from config
      const updatedBranding = { ...branding };
      delete (updatedBranding as Record<string, unknown>)[urlKey];

      await this.prisma.whiteLabelConfig.update({
        where: { id: configId },
        data: {
          branding: updatedBranding as unknown as Record<string, unknown>,
        },
      });
    }
  }

  // ==========================================================================
  // T113: Branding Validation
  // ==========================================================================

  /**
   * Validate branding configuration
   */
  validateBranding(branding: BrandingConfig): void {
    const errors: string[] = [];

    // Validate required colors
    if (!branding.colors) {
      errors.push('Colors configuration is required');
    } else {
      if (!branding.colors.primary) {
        errors.push('Primary color is required');
      }
      if (!branding.colors.secondary) {
        errors.push('Secondary color is required');
      }

      // Validate color formats
      for (const [key, value] of Object.entries(branding.colors)) {
        if (value && !HEX_COLOR_REGEX.test(value)) {
          errors.push(`Invalid color format for ${key}: ${value}. Use hex format (#RRGGBB)`);
        }
      }
    }

    // Validate URLs if provided
    const urlFields = ['supportUrl', 'privacyUrl', 'termsUrl'] as const;
    for (const field of urlFields) {
      if (branding[field]) {
        try {
          new URL(branding[field]!);
        } catch {
          errors.push(`Invalid URL format for ${field}`);
        }
      }
    }

    // Validate email if provided
    if (branding.supportEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(branding.supportEmail)) {
        errors.push('Invalid support email format');
      }
    }

    if (errors.length > 0) {
      throw new AppError('INVALID_BRANDING', `Branding validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Validate custom CSS
   */
  validateCustomCss(css: string): void {
    // Check for potentially dangerous patterns
    const dangerousPatterns = [
      /@import\s+url/i,
      /javascript:/i,
      /expression\s*\(/i,
      /behavior\s*:/i,
      /-moz-binding/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(css)) {
        throw new AppError('INVALID_CSS', 'Custom CSS contains potentially unsafe patterns');
      }
    }

    // Check CSS size limit (50KB)
    if (css.length > 50 * 1024) {
      throw new AppError('CSS_TOO_LARGE', 'Custom CSS exceeds maximum size of 50KB');
    }
  }

  /**
   * Get image validation constraints
   */
  getImageConstraints(type: 'logo' | 'favicon'): {
    maxSize: number;
    allowedTypes: string[];
    dimensions: { minWidth?: number; maxWidth?: number; minHeight?: number; maxHeight?: number; width?: number; height?: number };
  } {
    if (type === 'favicon') {
      return {
        maxSize: MAX_FAVICON_SIZE,
        allowedTypes: ALLOWED_IMAGE_TYPES,
        dimensions: FAVICON_DIMENSIONS,
      };
    }

    return {
      maxSize: MAX_LOGO_SIZE,
      allowedTypes: ALLOWED_IMAGE_TYPES,
      dimensions: LOGO_DIMENSIONS,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Convert camelCase to kebab-case
   */
  private kebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }
}
