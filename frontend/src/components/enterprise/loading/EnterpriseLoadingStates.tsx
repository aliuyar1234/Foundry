/**
 * Enterprise Loading States (T368)
 * Specialized loading states for all enterprise pages
 */

import React from 'react';
import {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonTable,
  SkeletonChart,
  SkeletonStatsCard,
} from '../../ui/Skeleton';

// =============================================================================
// Entity Selector Loading
// =============================================================================

export function EntitySelectorLoading() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <SkeletonAvatar size="md" />
        <div className="flex-1">
          <Skeleton className="h-4 w-24 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-5 w-5 rounded" />
      </div>
      <div className="text-xs text-gray-400 px-2">Loading entities...</div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <SkeletonAvatar size="sm" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// SSO Configuration Loading
// =============================================================================

export function SSOConfigLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['SAML', 'OIDC', 'Azure AD'].map((provider) => (
          <div key={provider} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="w-12 h-12 rounded-lg" />
              <div>
                <Skeleton className="h-5 w-20 mb-1" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-8 w-24 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Skeleton className="h-6 w-48 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Partner API Dashboard Loading
// =============================================================================

export function PartnerAPIDashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header with API Key */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-8 w-20 rounded" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatsCard key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonChart height={250} />
        <SkeletonChart height={250} />
      </div>

      {/* Rate Limits Table */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Skeleton className="h-6 w-40 mb-4" />
        <SkeletonTable rows={3} columns={5} />
      </div>
    </div>
  );
}

// =============================================================================
// Webhook Configuration Loading
// =============================================================================

export function WebhookConfigLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Webhook List */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div>
                  <Skeleton className="h-5 w-40 mb-1" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Skeleton className="h-3 w-16 mb-1" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div>
                <Skeleton className="h-3 w-20 mb-1" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div>
                <Skeleton className="h-3 w-16 mb-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Event Types */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Skeleton className="h-6 w-36 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-3 border border-gray-100 rounded-lg">
              <Skeleton className="w-4 h-4 rounded" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// White Label Settings Loading
// =============================================================================

export function WhiteLabelSettingsLoading() {
  return (
    <div className="space-y-6">
      {/* Preview Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Preview Header */}
          <div className="h-14 bg-gray-100 flex items-center px-4 gap-3">
            <Skeleton className="w-8 h-8 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
          {/* Preview Content */}
          <div className="h-64 bg-gray-50 flex items-center justify-center">
            <Skeleton className="w-48 h-48 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Brand Settings Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logo Upload */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <Skeleton className="h-5 w-24 mb-4" />
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
            <Skeleton className="w-16 h-16 rounded-lg mx-auto mb-3" />
            <Skeleton className="h-4 w-40 mx-auto mb-2" />
            <Skeleton className="h-3 w-32 mx-auto" />
          </div>
        </div>

        {/* Color Scheme */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <Skeleton className="h-5 w-28 mb-4" />
          <div className="space-y-4">
            {['Primary', 'Secondary', 'Accent'].map((color) => (
              <div key={color} className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <div className="flex items-center gap-2">
                  <Skeleton className="w-8 h-8 rounded" />
                  <Skeleton className="h-8 w-24 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom Domain */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-4">
          <div>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg">
            <Skeleton className="w-5 h-5 rounded-full" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// GDPR Dashboard Loading
// =============================================================================

export function GDPRDashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Data Subject Requests */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
        <SkeletonTable rows={5} columns={6} />
      </div>

      {/* Consent Management */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Skeleton className="h-6 w-40 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded" />
                <div>
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Audit Log Loading
// =============================================================================

export function AuditLogLoading() {
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
          <div className="flex-1" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* Log Entries */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="p-4 hover:bg-gray-50">
              <div className="flex items-start gap-4">
                <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-3 w-16 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-9 w-9 rounded" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Entity Management Loading
// =============================================================================

export function EntityManagementLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>

      {/* Entity Tree */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Skeleton className="h-6 w-36 mb-4" />
        <div className="space-y-2">
          {/* Root Entity */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
            <Skeleton className="w-6 h-6 rounded" />
            <SkeletonAvatar size="sm" />
            <Skeleton className="h-5 w-40" />
            <div className="flex-1" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          {/* Child Entities */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ml-8 flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg">
              <Skeleton className="w-6 h-6 rounded" />
              <SkeletonAvatar size="sm" />
              <Skeleton className="h-5 w-32" />
              <div className="flex-1" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Entity Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <Skeleton className="h-6 w-36 mb-4" />
          <SkeletonTable rows={4} columns={3} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Cross-Entity Dashboard Loading
// =============================================================================

export function CrossEntityDashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header with Entity Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-7 w-48" />
            <div className="flex items-center gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))}
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Comparison Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
            <Skeleton className="h-4 w-28 mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonChart height={300} />
        <SkeletonChart height={300} />
      </div>

      {/* Detailed Comparison Table */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Skeleton className="h-6 w-48 mb-4" />
        <SkeletonTable rows={6} columns={5} />
      </div>
    </div>
  );
}

// =============================================================================
// Loading State Wrapper
// =============================================================================

interface LoadingStateProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}

export function LoadingState({ loading, skeleton, children }: LoadingStateProps) {
  if (loading) {
    return <>{skeleton}</>;
  }
  return <>{children}</>;
}

// =============================================================================
// Progressive Loading
// =============================================================================

interface ProgressiveLoadingProps {
  stages: Array<{
    key: string;
    loading: boolean;
    skeleton: React.ReactNode;
    content: React.ReactNode;
  }>;
}

export function ProgressiveLoading({ stages }: ProgressiveLoadingProps) {
  return (
    <div className="space-y-6">
      {stages.map((stage) => (
        <div key={stage.key}>
          {stage.loading ? stage.skeleton : stage.content}
        </div>
      ))}
    </div>
  );
}

export default {
  EntitySelectorLoading,
  SSOConfigLoading,
  PartnerAPIDashboardLoading,
  WebhookConfigLoading,
  WhiteLabelSettingsLoading,
  GDPRDashboardLoading,
  AuditLogLoading,
  EntityManagementLoading,
  CrossEntityDashboardLoading,
  LoadingState,
  ProgressiveLoading,
};
