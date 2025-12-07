/**
 * Loading Spinner Component (T130)
 * Reusable loading states
 */

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'blue' | 'gray' | 'white';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'blue',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  const colorClasses = {
    blue: 'border-blue-600',
    gray: 'border-gray-600',
    white: 'border-white',
  };

  return (
    <div
      className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
};

interface LoadingOverlayProps {
  message?: string;
  fullScreen?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message = 'Loading...',
  fullScreen = false,
}) => {
  const containerClass = fullScreen
    ? 'fixed inset-0 z-50'
    : 'absolute inset-0';

  return (
    <div
      className={`${containerClass} flex items-center justify-center bg-white bg-opacity-80`}
    >
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-600">{message}</p>
      </div>
    </div>
  );
};

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
}) => {
  const baseClass = 'animate-pulse bg-gray-200';

  const variantClasses = {
    text: 'h-4 rounded',
    rect: 'rounded-lg',
    circle: 'rounded-full',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseClass} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
};

interface CardSkeletonProps {
  lines?: number;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({ lines = 3 }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <Skeleton variant="text" width="60%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" width={`${80 - i * 10}%`} />
      ))}
    </div>
  );
};

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 4,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="grid gap-4 p-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} variant="text" height={20} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4 p-4 border-t border-gray-100"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`${rowIndex}-${colIndex}`} variant="text" />
          ))}
        </div>
      ))}
    </div>
  );
};

export default LoadingSpinner;
