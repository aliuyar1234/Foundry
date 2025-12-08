/**
 * Theme Provider
 * SCALE Tier - Tasks T132-T135
 *
 * Provides dynamic theming based on white-label configuration
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';

// ==========================================================================
// Types
// ==========================================================================

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
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  colors: BrandingColors;
  fonts?: BrandingFonts;
  companyName?: string;
  supportEmail?: string;
  supportUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
}

export interface WhiteLabelConfig {
  id: string | null;
  name: string;
  branding: BrandingConfig;
  customCss?: string;
  features: Record<string, unknown>;
}

export interface ThemeContextValue {
  config: WhiteLabelConfig;
  isLoading: boolean;
  isWhiteLabeled: boolean;
  updateTheme: (branding: Partial<BrandingConfig>) => void;
  resetTheme: () => void;
  previewTheme: (branding: Partial<BrandingConfig>) => void;
  exitPreview: () => void;
  isPreviewMode: boolean;
}

// ==========================================================================
// Default Theme
// ==========================================================================

const DEFAULT_CONFIG: WhiteLabelConfig = {
  id: null,
  name: 'Foundry',
  branding: {
    colors: {
      primary: '#3B82F6',
      secondary: '#64748B',
      accent: '#8B5CF6',
      background: '#FFFFFF',
      surface: '#F8FAFC',
      text: '#1E293B',
      textSecondary: '#64748B',
      error: '#EF4444',
      warning: '#F59E0B',
      success: '#10B981',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
      mono: 'JetBrains Mono',
    },
    companyName: 'Foundry',
  },
  features: {},
};

// ==========================================================================
// Context
// ==========================================================================

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ==========================================================================
// CSS Variable Generation
// ==========================================================================

function generateCssVariables(branding: BrandingConfig): string {
  const vars: string[] = [];

  // Color variables
  if (branding.colors) {
    for (const [key, value] of Object.entries(branding.colors)) {
      if (value) {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        vars.push(`--color-${cssKey}: ${value};`);

        // Also generate RGB values for opacity support
        const rgb = hexToRgb(value);
        if (rgb) {
          vars.push(`--color-${cssKey}-rgb: ${rgb.r}, ${rgb.g}, ${rgb.b};`);
        }
      }
    }
  }

  // Font variables
  if (branding.fonts) {
    for (const [key, value] of Object.entries(branding.fonts)) {
      if (value) {
        vars.push(`--font-${key}: ${value};`);
      }
    }
  }

  return `:root {\n  ${vars.join('\n  ')}\n}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// ==========================================================================
// Provider Component
// ==========================================================================

interface ThemeProviderProps {
  children: React.ReactNode;
  initialConfig?: WhiteLabelConfig;
  apiEndpoint?: string;
}

export function ThemeProvider({
  children,
  initialConfig,
  apiEndpoint = '/api/white-label/config',
}: ThemeProviderProps) {
  const [config, setConfig] = useState<WhiteLabelConfig>(initialConfig || DEFAULT_CONFIG);
  const [previewConfig, setPreviewConfig] = useState<WhiteLabelConfig | null>(null);
  const [isLoading, setIsLoading] = useState(!initialConfig);

  // Fetch white-label config from API
  useEffect(() => {
    if (initialConfig) return;

    const fetchConfig = async () => {
      try {
        const response = await fetch(apiEndpoint);
        if (response.ok) {
          const data = await response.json();
          setConfig(data);
        }
      } catch (error) {
        console.error('Failed to load white-label config:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [apiEndpoint, initialConfig]);

  // Apply CSS variables when config changes
  useEffect(() => {
    const activeConfig = previewConfig || config;
    const cssVars = generateCssVariables(activeConfig.branding);

    // Find or create style element
    let styleEl = document.getElementById('theme-vars');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'theme-vars';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = cssVars;

    // Apply custom CSS if present
    let customStyleEl = document.getElementById('theme-custom');
    if (activeConfig.customCss) {
      if (!customStyleEl) {
        customStyleEl = document.createElement('style');
        customStyleEl.id = 'theme-custom';
        document.head.appendChild(customStyleEl);
      }
      customStyleEl.textContent = activeConfig.customCss;
    } else if (customStyleEl) {
      customStyleEl.remove();
    }

    // Update favicon if specified
    if (activeConfig.branding.faviconUrl) {
      const faviconEl = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (faviconEl) {
        faviconEl.href = activeConfig.branding.faviconUrl;
      }
    }

    // Update document title
    if (activeConfig.branding.companyName) {
      document.title = `${activeConfig.branding.companyName} | Enterprise AI Foundation`;
    }

    return () => {
      // Cleanup on unmount
    };
  }, [config, previewConfig]);

  // Update theme (persists)
  const updateTheme = useCallback((branding: Partial<BrandingConfig>) => {
    setConfig(prev => ({
      ...prev,
      branding: {
        ...prev.branding,
        ...branding,
        colors: {
          ...prev.branding.colors,
          ...branding.colors,
        },
        fonts: {
          ...prev.branding.fonts,
          ...branding.fonts,
        },
      },
    }));
  }, []);

  // Reset to default theme
  const resetTheme = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setPreviewConfig(null);
  }, []);

  // Preview theme (temporary)
  const previewTheme = useCallback(
    (branding: Partial<BrandingConfig>) => {
      setPreviewConfig({
        ...config,
        branding: {
          ...config.branding,
          ...branding,
          colors: {
            ...config.branding.colors,
            ...branding.colors,
          },
          fonts: {
            ...config.branding.fonts,
            ...branding.fonts,
          },
        },
      });
    },
    [config]
  );

  // Exit preview mode
  const exitPreview = useCallback(() => {
    setPreviewConfig(null);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      config: previewConfig || config,
      isLoading,
      isWhiteLabeled: config.id !== null,
      updateTheme,
      resetTheme,
      previewTheme,
      exitPreview,
      isPreviewMode: previewConfig !== null,
    }),
    [config, previewConfig, isLoading, updateTheme, resetTheme, previewTheme, exitPreview]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ==========================================================================
// Hooks
// ==========================================================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useBranding(): BrandingConfig {
  const { config } = useTheme();
  return config.branding;
}

export function useColors(): BrandingColors {
  const branding = useBranding();
  return branding.colors;
}

export function useCompanyName(): string {
  const branding = useBranding();
  return branding.companyName || 'Foundry';
}

export function useIsWhiteLabeled(): boolean {
  const { isWhiteLabeled } = useTheme();
  return isWhiteLabeled;
}

// ==========================================================================
// Theme Preview Component
// ==========================================================================

interface ThemePreviewProps {
  branding: Partial<BrandingConfig>;
  children: React.ReactNode;
}

export function ThemePreview({ branding, children }: ThemePreviewProps) {
  const cssVars = generateCssVariables({
    ...DEFAULT_CONFIG.branding,
    ...branding,
    colors: {
      ...DEFAULT_CONFIG.branding.colors,
      ...branding.colors,
    },
    fonts: {
      ...DEFAULT_CONFIG.branding.fonts,
      ...branding.fonts,
    },
  });

  return (
    <div style={{ position: 'relative' }}>
      <style>{cssVars}</style>
      {children}
    </div>
  );
}

// ==========================================================================
// Utility Components
// ==========================================================================

export function BrandedLogo({
  className,
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  const branding = useBranding();
  const logoUrl = dark ? branding.logoDarkUrl || branding.logoUrl : branding.logoUrl;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={branding.companyName || 'Logo'}
        className={className}
      />
    );
  }

  // Fallback to text logo
  return (
    <span className={className} style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
      {branding.companyName || 'Foundry'}
    </span>
  );
}

export function BrandedFooter({ className }: { className?: string }) {
  const branding = useBranding();

  return (
    <footer className={className}>
      <div className="flex items-center justify-between">
        <span>
          &copy; {new Date().getFullYear()} {branding.companyName || 'Foundry'}
        </span>
        <div className="flex gap-4">
          {branding.privacyUrl && (
            <a href={branding.privacyUrl} target="_blank" rel="noopener noreferrer">
              Privacy
            </a>
          )}
          {branding.termsUrl && (
            <a href={branding.termsUrl} target="_blank" rel="noopener noreferrer">
              Terms
            </a>
          )}
          {branding.supportUrl && (
            <a href={branding.supportUrl} target="_blank" rel="noopener noreferrer">
              Support
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

export default ThemeProvider;
