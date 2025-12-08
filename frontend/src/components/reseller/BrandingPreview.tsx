/**
 * Branding Preview Component
 * SCALE Tier - Task T140
 *
 * Live preview of white-label branding configuration
 */

import React from 'react';
import { BrandingConfig, ThemePreview } from '../../providers/ThemeProvider';

// ==========================================================================
// Types
// ==========================================================================

interface BrandingPreviewProps {
  branding: BrandingConfig;
  mode?: 'light' | 'dark';
  showMockData?: boolean;
}

// ==========================================================================
// Mock Data
// ==========================================================================

const mockStats = [
  { label: 'Processes', value: '47', change: '+12%' },
  { label: 'Insights', value: '128', change: '+8%' },
  { label: 'Users', value: '24', change: '+2' },
  { label: 'Compliance', value: '94%', change: '+3%' },
];

const mockNotifications = [
  { id: '1', title: 'New process discovered', time: '5m ago', type: 'info' },
  { id: '2', title: 'Insight generated', time: '12m ago', type: 'success' },
  { id: '3', title: 'Compliance alert', time: '1h ago', type: 'warning' },
];

// ==========================================================================
// Preview Components
// ==========================================================================

function PreviewHeader({ branding }: { branding: BrandingConfig }) {
  return (
    <header
      className="h-14 px-4 flex items-center justify-between border-b"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-secondary)' }}
    >
      <div className="flex items-center gap-3">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="Logo" className="h-8" />
        ) : (
          <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
            {branding.companyName || 'Company'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          className="p-2 rounded-full hover:opacity-80"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
        </button>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          JD
        </div>
      </div>
    </header>
  );
}

function PreviewSidebar() {
  const navItems = [
    { icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: 'Dashboard', active: true },
    { icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'Processes' },
    { icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', label: 'Insights' },
    { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Compliance' },
    { icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', label: 'Settings' },
  ];

  return (
    <aside
      className="w-56 border-r"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-secondary)' }}
    >
      <nav className="p-3 space-y-1">
        {navItems.map(item => (
          <button
            key={item.label}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              backgroundColor: item.active ? 'rgba(var(--color-primary-rgb), 0.1)' : 'transparent',
              color: item.active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function PreviewStatsGrid() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {mockStats.map(stat => (
        <div
          key={stat.label}
          className="p-4 rounded-lg"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {stat.label}
          </p>
          <p className="text-xl font-semibold mt-1" style={{ color: 'var(--color-text)' }}>
            {stat.value}
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: 'var(--color-success)' }}
          >
            {stat.change}
          </p>
        </div>
      ))}
    </div>
  );
}

function PreviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
        <h3 className="font-medium" style={{ color: 'var(--color-text)' }}>
          {title}
        </h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function PreviewNotifications() {
  const typeColors = {
    info: 'var(--color-primary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-error)',
  };

  return (
    <div className="space-y-2">
      {mockNotifications.map(notif => (
        <div
          key={notif.id}
          className="flex items-start gap-3 p-3 rounded-lg"
          style={{ backgroundColor: 'var(--color-background)' }}
        >
          <div
            className="w-2 h-2 rounded-full mt-1.5"
            style={{ backgroundColor: typeColors[notif.type as keyof typeof typeColors] }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>
              {notif.title}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {notif.time}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewButtons() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="px-3 py-1.5 rounded text-sm text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Primary
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm text-white"
          style={{ backgroundColor: 'var(--color-secondary)' }}
        >
          Secondary
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Accent
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="px-3 py-1.5 rounded text-sm text-white"
          style={{ backgroundColor: 'var(--color-success)' }}
        >
          Success
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm text-white"
          style={{ backgroundColor: 'var(--color-warning)' }}
        >
          Warning
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm text-white"
          style={{ backgroundColor: 'var(--color-error)' }}
        >
          Error
        </button>
      </div>
    </div>
  );
}

function PreviewForm() {
  return (
    <div className="space-y-3">
      <div>
        <label
          className="block text-xs mb-1"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Email Address
        </label>
        <input
          type="email"
          className="w-full px-3 py-2 rounded border text-sm"
          style={{
            backgroundColor: 'var(--color-background)',
            borderColor: 'var(--color-secondary)',
            color: 'var(--color-text)',
          }}
          placeholder="john@example.com"
        />
      </div>
      <div>
        <label
          className="block text-xs mb-1"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Message
        </label>
        <textarea
          className="w-full px-3 py-2 rounded border text-sm"
          style={{
            backgroundColor: 'var(--color-background)',
            borderColor: 'var(--color-secondary)',
            color: 'var(--color-text)',
          }}
          rows={2}
          placeholder="Your message..."
        />
      </div>
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

export function BrandingPreview({
  branding,
  mode = 'light',
  showMockData = true,
}: BrandingPreviewProps) {
  return (
    <ThemePreview branding={branding}>
      <div
        className="rounded-lg overflow-hidden border shadow-lg"
        style={{
          backgroundColor: 'var(--color-background)',
          borderColor: 'var(--color-secondary)',
        }}
      >
        {/* Header */}
        <PreviewHeader branding={branding} />

        {/* Main Layout */}
        <div className="flex" style={{ height: '400px' }}>
          {/* Sidebar */}
          <PreviewSidebar />

          {/* Main Content */}
          <main className="flex-1 p-4 overflow-auto">
            {showMockData ? (
              <div className="space-y-4">
                {/* Page Title */}
                <div>
                  <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                    Dashboard
                  </h1>
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Welcome back, John
                  </p>
                </div>

                {/* Stats */}
                <PreviewStatsGrid />

                {/* Cards Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <PreviewCard title="Recent Activity">
                    <PreviewNotifications />
                  </PreviewCard>
                  <PreviewCard title="UI Elements">
                    <PreviewButtons />
                    <div className="mt-4">
                      <PreviewForm />
                    </div>
                  </PreviewCard>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  Preview content will appear here
                </p>
              </div>
            )}
          </main>
        </div>

        {/* Footer */}
        <footer
          className="px-4 py-2 border-t flex items-center justify-between text-xs"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-secondary)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <span>&copy; 2024 {branding.companyName || 'Company'}</span>
          <div className="flex gap-4">
            {branding.privacyUrl && <span>Privacy</span>}
            {branding.termsUrl && <span>Terms</span>}
            {branding.supportUrl && <span>Support</span>}
          </div>
        </footer>
      </div>
    </ThemePreview>
  );
}

export default BrandingPreview;
