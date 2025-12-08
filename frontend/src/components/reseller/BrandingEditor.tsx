/**
 * Branding Editor Component
 * SCALE Tier - Task T139
 *
 * Visual editor for white-label branding configuration
 */

import React, { useState, useCallback, useRef } from 'react';
import { useTheme, BrandingConfig, BrandingColors } from '../../providers/ThemeProvider';

// ==========================================================================
// Types
// ==========================================================================

interface BrandingEditorProps {
  configId: string;
  initialBranding?: BrandingConfig;
  onSave?: (branding: BrandingConfig) => void;
  onPreview?: (branding: BrandingConfig) => void;
}

// ==========================================================================
// Color Picker Component
// ==========================================================================

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
}

function ColorPicker({ label, value, onChange, description }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const presetColors = [
    '#3B82F6', '#2563EB', '#1D4ED8', // Blues
    '#8B5CF6', '#7C3AED', '#6D28D9', // Purples
    '#10B981', '#059669', '#047857', // Greens
    '#F59E0B', '#D97706', '#B45309', // Oranges
    '#EF4444', '#DC2626', '#B91C1C', // Reds
    '#64748B', '#475569', '#334155', // Grays
  ];

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-10 h-10 rounded-lg border-2 border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500"
            style={{ backgroundColor: value }}
          />
          {isOpen && (
            <div className="absolute z-10 mt-2 p-3 bg-white rounded-lg shadow-lg border border-gray-200">
              <div className="grid grid-cols-6 gap-2 mb-3">
                {presetColors.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      onChange(color);
                      setIsOpen(false);
                    }}
                    className={`w-6 h-6 rounded border ${
                      value === color ? 'ring-2 ring-blue-500' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <input
                type="color"
                value={value}
                onChange={e => onChange(e.target.value.toUpperCase())}
                className="w-full h-8 cursor-pointer"
              />
            </div>
          )}
        </div>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono uppercase"
          pattern="^#[0-9A-Fa-f]{6}$"
          maxLength={7}
        />
      </div>
      {description && <p className="text-xs text-gray-500">{description}</p>}
    </div>
  );
}

// ==========================================================================
// Logo Upload Component
// ==========================================================================

interface LogoUploadProps {
  label: string;
  currentUrl?: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
  accept?: string;
  maxSize?: number;
}

function LogoUpload({
  label,
  currentUrl,
  onUpload,
  onRemove,
  accept = 'image/png,image/jpeg,image/svg+xml',
  maxSize = 2 * 1024 * 1024,
}: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    if (file.size > maxSize) {
      setError(`File too large. Maximum size is ${Math.round(maxSize / 1024)}KB`);
      return;
    }

    if (!accept.includes(file.type)) {
      setError('Invalid file type. Please upload PNG, JPG, or SVG');
      return;
    }

    setError(null);
    onUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {currentUrl ? (
        <div className="flex items-center gap-4">
          <div className="w-32 h-16 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
            <img
              src={currentUrl}
              alt="Logo preview"
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={e => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-600">
            Drop your logo here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-blue-600 hover:text-blue-700"
            >
              browse
            </button>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            PNG, JPG, or SVG up to {Math.round(maxSize / 1024)}KB
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          if (e.target.files?.[0]) {
            handleFile(e.target.files[0]);
          }
        }}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ==========================================================================
// Font Selector Component
// ==========================================================================

interface FontSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function FontSelector({ label, value, onChange }: FontSelectorProps) {
  const fonts = [
    'Inter',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Source Sans Pro',
    'Nunito',
    'Raleway',
    'Work Sans',
  ];

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        style={{ fontFamily: value }}
      >
        {fonts.map(font => (
          <option key={font} value={font} style={{ fontFamily: font }}>
            {font}
          </option>
        ))}
      </select>
    </div>
  );
}

// ==========================================================================
// Custom CSS Editor Component
// ==========================================================================

interface CssEditorProps {
  value: string;
  onChange: (value: string) => void;
}

function CssEditor({ value, onChange }: CssEditorProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        Custom CSS
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={8}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500"
        placeholder={`/* Add custom styles here */
.my-custom-class {
  color: var(--color-primary);
}`}
      />
      <p className="text-xs text-gray-500">
        Use CSS variables like <code>var(--color-primary)</code> to reference theme colors
      </p>
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

export function BrandingEditor({
  configId,
  initialBranding,
  onSave,
  onPreview,
}: BrandingEditorProps) {
  const { config, previewTheme, exitPreview, isPreviewMode } = useTheme();

  const defaultBranding: BrandingConfig = {
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
    companyName: '',
    supportEmail: '',
  };

  const [branding, setBranding] = useState<BrandingConfig>(
    initialBranding || config.branding || defaultBranding
  );
  const [customCss, setCustomCss] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'colors' | 'typography' | 'logos' | 'advanced'>(
    'colors'
  );

  const updateColor = useCallback((key: keyof BrandingColors, value: string) => {
    setBranding(prev => ({
      ...prev,
      colors: { ...prev.colors, [key]: value },
    }));
  }, []);

  const handlePreview = useCallback(() => {
    previewTheme(branding);
    onPreview?.(branding);
  }, [branding, previewTheme, onPreview]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/white-label/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branding,
          customCss,
        }),
      });

      if (!response.ok) throw new Error('Failed to save branding');

      exitPreview();
      onSave?.(branding);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [branding, customCss, exitPreview, onSave]);

  const handleLogoUpload = async (type: 'logo' | 'logoDark' | 'favicon', file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(
        `/api/white-label/config/${configId}/logo?type=${type}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) throw new Error('Failed to upload logo');

      const { url } = await response.json();
      setBranding(prev => ({
        ...prev,
        [`${type}Url`]: url,
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload');
    }
  };

  const tabs = [
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' },
    { id: 'logos', label: 'Logos' },
    { id: 'advanced', label: 'Advanced' },
  ] as const;

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Branding Editor</h2>
          <div className="flex items-center gap-3">
            {isPreviewMode && (
              <button
                onClick={exitPreview}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Exit Preview
              </button>
            )}
            <button
              onClick={handlePreview}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Preview
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'colors' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ColorPicker
              label="Primary Color"
              value={branding.colors.primary}
              onChange={v => updateColor('primary', v)}
              description="Main brand color for buttons, links, and highlights"
            />
            <ColorPicker
              label="Secondary Color"
              value={branding.colors.secondary}
              onChange={v => updateColor('secondary', v)}
              description="Supporting color for secondary elements"
            />
            <ColorPicker
              label="Accent Color"
              value={branding.colors.accent || '#8B5CF6'}
              onChange={v => updateColor('accent', v)}
              description="Used for emphasis and special highlights"
            />
            <ColorPicker
              label="Background"
              value={branding.colors.background || '#FFFFFF'}
              onChange={v => updateColor('background', v)}
              description="Main background color"
            />
            <ColorPicker
              label="Surface"
              value={branding.colors.surface || '#F8FAFC'}
              onChange={v => updateColor('surface', v)}
              description="Cards, panels, and elevated surfaces"
            />
            <ColorPicker
              label="Text"
              value={branding.colors.text || '#1E293B'}
              onChange={v => updateColor('text', v)}
              description="Primary text color"
            />
            <ColorPicker
              label="Secondary Text"
              value={branding.colors.textSecondary || '#64748B'}
              onChange={v => updateColor('textSecondary', v)}
              description="Muted text for descriptions"
            />
            <ColorPicker
              label="Error"
              value={branding.colors.error || '#EF4444'}
              onChange={v => updateColor('error', v)}
              description="Error states and messages"
            />
            <ColorPicker
              label="Warning"
              value={branding.colors.warning || '#F59E0B'}
              onChange={v => updateColor('warning', v)}
              description="Warning states and alerts"
            />
            <ColorPicker
              label="Success"
              value={branding.colors.success || '#10B981'}
              onChange={v => updateColor('success', v)}
              description="Success states and confirmations"
            />
          </div>
        )}

        {activeTab === 'typography' && (
          <div className="space-y-6 max-w-md">
            <FontSelector
              label="Heading Font"
              value={branding.fonts?.heading || 'Inter'}
              onChange={v =>
                setBranding(prev => ({
                  ...prev,
                  fonts: { ...prev.fonts, heading: v },
                }))
              }
            />
            <FontSelector
              label="Body Font"
              value={branding.fonts?.body || 'Inter'}
              onChange={v =>
                setBranding(prev => ({
                  ...prev,
                  fonts: { ...prev.fonts, body: v },
                }))
              }
            />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Company Name
              </label>
              <input
                type="text"
                value={branding.companyName || ''}
                onChange={e =>
                  setBranding(prev => ({ ...prev, companyName: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Your Company Name"
              />
            </div>
          </div>
        )}

        {activeTab === 'logos' && (
          <div className="space-y-6">
            <LogoUpload
              label="Logo (Light Background)"
              currentUrl={branding.logoUrl}
              onUpload={file => handleLogoUpload('logo', file)}
              onRemove={() => setBranding(prev => ({ ...prev, logoUrl: undefined }))}
            />
            <LogoUpload
              label="Logo (Dark Background)"
              currentUrl={branding.logoDarkUrl}
              onUpload={file => handleLogoUpload('logoDark', file)}
              onRemove={() =>
                setBranding(prev => ({ ...prev, logoDarkUrl: undefined }))
              }
            />
            <LogoUpload
              label="Favicon"
              currentUrl={branding.faviconUrl}
              onUpload={file => handleLogoUpload('favicon', file)}
              onRemove={() =>
                setBranding(prev => ({ ...prev, faviconUrl: undefined }))
              }
              maxSize={100 * 1024}
            />
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-6">
            <CssEditor value={customCss} onChange={setCustomCss} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Support Email
                </label>
                <input
                  type="email"
                  value={branding.supportEmail || ''}
                  onChange={e =>
                    setBranding(prev => ({ ...prev, supportEmail: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="support@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Support URL
                </label>
                <input
                  type="url"
                  value={branding.supportUrl || ''}
                  onChange={e =>
                    setBranding(prev => ({ ...prev, supportUrl: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="https://help.example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Privacy Policy URL
                </label>
                <input
                  type="url"
                  value={branding.privacyUrl || ''}
                  onChange={e =>
                    setBranding(prev => ({ ...prev, privacyUrl: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="https://example.com/privacy"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Terms of Service URL
                </label>
                <input
                  type="url"
                  value={branding.termsUrl || ''}
                  onChange={e =>
                    setBranding(prev => ({ ...prev, termsUrl: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="https://example.com/terms"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BrandingEditor;
