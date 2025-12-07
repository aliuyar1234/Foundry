/**
 * Loading Skeleton Components (T191)
 * Provides loading skeletons for all list views
 */

import React from 'react';

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

/**
 * Base skeleton element with shimmer animation
 */
export function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 rounded ${animate ? 'animate-pulse' : ''} ${className}`}
    />
  );
}

/**
 * Text line skeleton
 */
export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/**
 * Avatar/circle skeleton
 */
export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  return <Skeleton className={`rounded-full ${sizeClasses[size]}`} />;
}

/**
 * Card skeleton for list items
 */
export function SkeletonCard({ showAvatar = false }: { showAvatar?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        {showAvatar && <SkeletonAvatar />}
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <SkeletonText lines={2} />
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Table row skeleton
 */
export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b border-gray-200">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

/**
 * Table skeleton
 */
export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton className="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * List skeleton
 */
export function SkeletonList({
  count = 5,
  showAvatar = false,
}: {
  count?: number;
  showAvatar?: boolean;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} showAvatar={showAvatar} />
      ))}
    </div>
  );
}

/**
 * Data source card skeleton
 */
export function SkeletonDataSourceCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-5 w-1/3 mb-2" />
          <Skeleton className="h-4 w-1/4" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div>
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div>
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-5 w-12" />
        </div>
      </div>
    </div>
  );
}

/**
 * Process card skeleton
 */
export function SkeletonProcessCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <Skeleton className="h-5 w-1/2 mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

/**
 * Insight card skeleton
 */
export function SkeletonInsightCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonText lines={2} />
          <div className="flex items-center justify-between mt-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * SOP card skeleton
 */
export function SkeletonSOPCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <SkeletonText lines={2} className="mb-3" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-20 rounded" />
        <Skeleton className="h-6 w-24 rounded" />
      </div>
    </div>
  );
}

/**
 * Assessment card skeleton
 */
export function SkeletonAssessmentCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="text-right">
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-4 w-12 ml-auto" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="text-center">
            <Skeleton className="h-4 w-12 mx-auto mb-1" />
            <Skeleton className="h-6 w-8 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Simulation card skeleton
 */
export function SkeletonSimulationCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-5 w-1/2 mb-2" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Entity record card skeleton
 */
export function SkeletonEntityRecordCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-4">
        <SkeletonAvatar />
        <div className="flex-1">
          <Skeleton className="h-5 w-1/3 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
    </div>
  );
}

/**
 * Stats card skeleton
 */
export function SkeletonStatsCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <Skeleton className="h-4 w-20 mb-2" />
      <Skeleton className="h-8 w-16 mb-1" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/**
 * Chart skeleton
 */
export function SkeletonChart({ height = 200 }: { height?: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <Skeleton className="h-5 w-1/4 mb-4" />
      <div className="relative" style={{ height }}>
        <div className="absolute inset-0 flex items-end justify-between gap-2 px-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton
              key={i}
              className="w-full rounded-t"
              style={{ height: `${30 + Math.random() * 60}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Page header skeleton
 */
export function SkeletonPageHeader() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Full page skeleton for list views
 */
export function SkeletonPage({
  showHeader = true,
  showFilters = true,
  listCount = 5,
}: {
  showHeader?: boolean;
  showFilters?: boolean;
  listCount?: number;
}) {
  return (
    <div className="space-y-6">
      {showHeader && <SkeletonPageHeader />}

      {showFilters && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-48 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      )}

      <SkeletonList count={listCount} />
    </div>
  );
}

export default Skeleton;
