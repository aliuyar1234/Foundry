/**
 * Loading States Component
 * T255 - Add loading states to all OPERATE components
 *
 * Provides consistent loading indicators across the application
 */

import React from 'react';

// Types
interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  label?: string;
}

interface SkeletonProps {
  type: 'text' | 'circle' | 'rect' | 'card' | 'table' | 'chart';
  width?: string | number;
  height?: string | number;
  lines?: number;
  animate?: boolean;
}

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  blur?: boolean;
  children?: React.ReactNode;
}

interface LoadingCardProps {
  title?: string;
  rows?: number;
  hasImage?: boolean;
  hasActions?: boolean;
}

// Size configurations
const SPINNER_SIZES = {
  small: { size: 16, border: 2 },
  medium: { size: 32, border: 3 },
  large: { size: 48, border: 4 },
};

/**
 * Spinner loading indicator
 */
export function LoadingSpinner({
  size = 'medium',
  color = '#3b82f6',
  label,
}: LoadingSpinnerProps) {
  const config = SPINNER_SIZES[size];

  return (
    <div className="loading-spinner-container" role="status" aria-live="polite">
      <div
        className="loading-spinner"
        style={{
          width: config.size,
          height: config.size,
          borderWidth: config.border,
          borderColor: `${color}20`,
          borderTopColor: color,
        }}
      />
      {label && <span className="loading-label">{label}</span>}
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  );
}

/**
 * Skeleton placeholder for content loading
 */
export function Skeleton({
  type,
  width,
  height,
  lines = 1,
  animate = true,
}: SkeletonProps) {
  const baseClass = `skeleton ${animate ? 'animate' : ''}`;

  switch (type) {
    case 'text':
      return (
        <div className="skeleton-text-group">
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className={`${baseClass} skeleton-text`}
              style={{
                width: i === lines - 1 && lines > 1 ? '70%' : width || '100%',
                height: height || 16,
              }}
            />
          ))}
        </div>
      );

    case 'circle':
      return (
        <div
          className={`${baseClass} skeleton-circle`}
          style={{
            width: width || 40,
            height: height || width || 40,
          }}
        />
      );

    case 'rect':
      return (
        <div
          className={`${baseClass} skeleton-rect`}
          style={{
            width: width || '100%',
            height: height || 100,
          }}
        />
      );

    case 'card':
      return (
        <div className={`${baseClass} skeleton-card`} style={{ width, height }}>
          <div className="skeleton-card-header">
            <Skeleton type="circle" width={40} height={40} />
            <div className="skeleton-card-title">
              <Skeleton type="text" lines={2} />
            </div>
          </div>
          <Skeleton type="text" lines={3} />
        </div>
      );

    case 'table':
      return (
        <div className={`${baseClass} skeleton-table`}>
          <div className="skeleton-table-header">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} type="rect" width="20%" height={20} />
            ))}
          </div>
          {Array.from({ length: lines || 5 }).map((_, i) => (
            <div key={i} className="skeleton-table-row">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} type="rect" width="20%" height={16} />
              ))}
            </div>
          ))}
        </div>
      );

    case 'chart':
      return (
        <div className={`${baseClass} skeleton-chart`} style={{ width, height: height || 200 }}>
          <div className="skeleton-chart-bars">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-bar"
                style={{ height: `${30 + Math.random() * 60}%` }}
              />
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

/**
 * Loading overlay for async operations
 */
export function LoadingOverlay({
  visible,
  message = 'Loading...',
  blur = true,
  children,
}: LoadingOverlayProps) {
  if (!visible) return <>{children}</>;

  return (
    <div className="loading-overlay-container">
      {children && (
        <div className={`loading-overlay-content ${blur ? 'blur' : ''}`}>
          {children}
        </div>
      )}
      <div className="loading-overlay" role="alert" aria-busy="true">
        <LoadingSpinner size="large" label={message} />
      </div>
    </div>
  );
}

/**
 * Loading card placeholder
 */
export function LoadingCard({
  title,
  rows = 3,
  hasImage = false,
  hasActions = false,
}: LoadingCardProps) {
  return (
    <div className="loading-card">
      {title && <h3 className="loading-card-title">{title}</h3>}
      {hasImage && (
        <div className="loading-card-image">
          <Skeleton type="rect" height={150} />
        </div>
      )}
      <div className="loading-card-body">
        <Skeleton type="text" lines={rows} />
      </div>
      {hasActions && (
        <div className="loading-card-actions">
          <Skeleton type="rect" width={80} height={32} />
          <Skeleton type="rect" width={80} height={32} />
        </div>
      )}
    </div>
  );
}

/**
 * Loading list placeholder
 */
export function LoadingList({ count = 5 }: { count?: number }) {
  return (
    <div className="loading-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="loading-list-item">
          <Skeleton type="circle" width={40} height={40} />
          <div className="loading-list-content">
            <Skeleton type="text" width="40%" />
            <Skeleton type="text" width="80%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Loading dashboard placeholder
 */
export function LoadingDashboard() {
  return (
    <div className="loading-dashboard">
      <div className="loading-dashboard-header">
        <Skeleton type="text" width={200} height={24} />
        <div className="loading-dashboard-actions">
          <Skeleton type="rect" width={100} height={36} />
          <Skeleton type="rect" width={100} height={36} />
        </div>
      </div>
      <div className="loading-dashboard-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="loading-stat-card">
            <Skeleton type="text" width={60} />
            <Skeleton type="text" width={100} height={32} />
          </div>
        ))}
      </div>
      <div className="loading-dashboard-charts">
        <div className="loading-chart-container">
          <Skeleton type="chart" height={300} />
        </div>
        <div className="loading-chart-container">
          <Skeleton type="chart" height={300} />
        </div>
      </div>
    </div>
  );
}

/**
 * Progress indicator for multi-step processes
 */
export function LoadingProgress({
  steps,
  currentStep,
  message,
}: {
  steps: number;
  currentStep: number;
  message?: string;
}) {
  const progress = (currentStep / steps) * 100;

  return (
    <div className="loading-progress">
      <div className="loading-progress-bar">
        <div
          className="loading-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="loading-progress-info">
        <span className="loading-progress-step">
          Step {currentStep} of {steps}
        </span>
        {message && <span className="loading-progress-message">{message}</span>}
      </div>
    </div>
  );
}

/**
 * Inline loading indicator
 */
export function InlineLoading({ text = 'Loading...' }: { text?: string }) {
  return (
    <span className="inline-loading">
      <LoadingSpinner size="small" />
      <span>{text}</span>
    </span>
  );
}

/**
 * Button with loading state
 */
export function LoadingButton({
  loading,
  children,
  disabled,
  ...props
}: {
  loading: boolean;
  children: React.ReactNode;
  disabled?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} disabled={disabled || loading} className={`btn ${props.className || ''}`}>
      {loading ? (
        <>
          <LoadingSpinner size="small" />
          <span>Loading...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

// CSS styles (would typically be in a separate CSS/SCSS file)
const styles = `
.loading-spinner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.loading-spinner {
  border-radius: 50%;
  border-style: solid;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-label {
  font-size: 14px;
  color: #666;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.skeleton {
  background: #e5e7eb;
  border-radius: 4px;
}

.skeleton.animate {
  animation: shimmer 1.5s infinite;
  background: linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%);
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-text-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-circle {
  border-radius: 50%;
}

.loading-overlay-container {
  position: relative;
}

.loading-overlay-content.blur {
  filter: blur(2px);
  pointer-events: none;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  z-index: 10;
}

.loading-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.loading-card-header {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.loading-card-title {
  flex: 1;
}

.loading-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.loading-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loading-list-item {
  display: flex;
  gap: 12px;
  align-items: center;
}

.loading-list-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.loading-dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.loading-dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.loading-dashboard-actions {
  display: flex;
  gap: 8px;
}

.loading-dashboard-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.loading-stat-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.loading-dashboard-charts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.loading-chart-container {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.skeleton-chart {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.skeleton-chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 100%;
}

.skeleton-bar {
  flex: 1;
  background: #e5e7eb;
  border-radius: 4px 4px 0 0;
}

.loading-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loading-progress-bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.loading-progress-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.loading-progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #666;
}

.inline-loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
`;

// Export styles for use in app
export const loadingStyles = styles;

export default {
  LoadingSpinner,
  Skeleton,
  LoadingOverlay,
  LoadingCard,
  LoadingList,
  LoadingDashboard,
  LoadingProgress,
  InlineLoading,
  LoadingButton,
};
