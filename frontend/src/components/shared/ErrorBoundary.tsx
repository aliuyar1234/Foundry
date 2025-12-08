/**
 * Error Boundary Components
 * T256 - Add error boundaries to OPERATE pages
 *
 * Provides error handling and graceful degradation for React components
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

// Types
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  resetOnNavigation?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorFallbackProps {
  error: Error;
  errorInfo?: ErrorInfo | null;
  reset: () => void;
  showDetails?: boolean;
}

/**
 * Main Error Boundary Component
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error);
      console.error('Component stack:', errorInfo.componentStack);
    }
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, showDetails } = this.props;

    if (hasError && error) {
      // Custom fallback
      if (typeof fallback === 'function') {
        return fallback(error, this.reset);
      }

      if (fallback) {
        return fallback;
      }

      // Default fallback
      return (
        <ErrorFallback
          error={error}
          errorInfo={errorInfo}
          reset={this.reset}
          showDetails={showDetails}
        />
      );
    }

    return children;
  }
}

/**
 * Default Error Fallback UI
 */
export function ErrorFallback({
  error,
  errorInfo,
  reset,
  showDetails = false,
}: ErrorFallbackProps) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="error-boundary" role="alert">
      <div className="error-boundary-content">
        <div className="error-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#dc3545" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2 className="error-title">Something went wrong</h2>

        <p className="error-message">
          We encountered an unexpected error. Please try again or contact support if the problem persists.
        </p>

        {(showDetails || isDevelopment) && (
          <div className="error-details">
            <h3>Error Details</h3>
            <div className="error-name">{error.name}: {error.message}</div>
            {errorInfo && (
              <details className="error-stack">
                <summary>Component Stack</summary>
                <pre>{errorInfo.componentStack}</pre>
              </details>
            )}
            {isDevelopment && error.stack && (
              <details className="error-stack">
                <summary>Error Stack</summary>
                <pre>{error.stack}</pre>
              </details>
            )}
          </div>
        )}

        <div className="error-actions">
          <button onClick={reset} className="btn btn-primary">
            Try Again
          </button>
          <button onClick={() => window.location.reload()} className="btn btn-outline">
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Page Error Boundary with navigation
 */
export function PageErrorBoundary({
  children,
  pageName,
}: {
  children: ReactNode;
  pageName?: string;
}) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <PageErrorFallback
          error={error}
          reset={reset}
          pageName={pageName}
        />
      )}
      onError={(error, errorInfo) => {
        // Log to analytics/monitoring
        console.error(`Error in ${pageName || 'page'}:`, error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Page-level error fallback
 */
function PageErrorFallback({
  error,
  reset,
  pageName,
}: {
  error: Error;
  reset: () => void;
  pageName?: string;
}) {
  return (
    <div className="page-error">
      <div className="page-error-content">
        <h1>Unable to load {pageName || 'this page'}</h1>
        <p>An error occurred while loading the page. This has been logged and we're working on a fix.</p>

        <div className="page-error-code">
          <code>{error.message}</code>
        </div>

        <div className="page-error-actions">
          <button onClick={reset} className="btn btn-primary">
            Retry
          </button>
          <button onClick={() => window.history.back()} className="btn btn-outline">
            Go Back
          </button>
          <a href="/" className="btn btn-text">
            Go to Home
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Component Error Boundary (smaller scope)
 */
export function ComponentErrorBoundary({
  children,
  componentName,
  fallback,
}: {
  children: ReactNode;
  componentName?: string;
  fallback?: ReactNode;
}) {
  return (
    <ErrorBoundary
      fallback={
        fallback || (
          <ComponentErrorFallback componentName={componentName} />
        )
      }
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Component-level error fallback
 */
function ComponentErrorFallback({ componentName }: { componentName?: string }) {
  return (
    <div className="component-error">
      <span className="component-error-icon">⚠️</span>
      <span className="component-error-message">
        Failed to load {componentName || 'component'}
      </span>
    </div>
  );
}

/**
 * Data Fetch Error Component
 */
export function DataFetchError({
  error,
  retry,
  message,
}: {
  error: Error | string;
  retry?: () => void;
  message?: string;
}) {
  const errorMessage = typeof error === 'string' ? error : error.message;

  return (
    <div className="data-fetch-error" role="alert">
      <div className="error-icon-small">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="error-content">
        <p className="error-text">{message || 'Failed to load data'}</p>
        <p className="error-details-small">{errorMessage}</p>
      </div>
      {retry && (
        <button onClick={retry} className="btn btn-small btn-outline">
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Not Found Component
 */
export function NotFound({
  resource,
  message,
  backLink,
}: {
  resource?: string;
  message?: string;
  backLink?: string;
}) {
  return (
    <div className="not-found">
      <div className="not-found-icon">404</div>
      <h2>{resource ? `${resource} Not Found` : 'Not Found'}</h2>
      <p>{message || 'The requested resource could not be found.'}</p>
      <div className="not-found-actions">
        <button onClick={() => window.history.back()} className="btn btn-outline">
          Go Back
        </button>
        {backLink && (
          <a href={backLink} className="btn btn-primary">
            Return Home
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Empty State Component
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="btn btn-primary">
          {action.label}
        </button>
      )}
    </div>
  );
}

// CSS styles
const styles = `
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: 40px;
}

.error-boundary-content {
  text-align: center;
  max-width: 500px;
}

.error-icon {
  margin-bottom: 24px;
}

.error-title {
  font-size: 24px;
  color: #1f2937;
  margin-bottom: 12px;
}

.error-message {
  color: #6b7280;
  margin-bottom: 24px;
}

.error-details {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  text-align: left;
  margin-bottom: 24px;
}

.error-details h3 {
  font-size: 14px;
  margin-bottom: 8px;
}

.error-name {
  font-family: monospace;
  color: #dc3545;
  margin-bottom: 12px;
}

.error-stack {
  margin-top: 12px;
}

.error-stack summary {
  cursor: pointer;
  font-size: 14px;
  color: #6b7280;
}

.error-stack pre {
  font-size: 12px;
  overflow-x: auto;
  padding: 12px;
  background: #1f2937;
  color: #f3f4f6;
  border-radius: 4px;
  margin-top: 8px;
}

.error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.page-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 40px;
  background: #f9fafb;
}

.page-error-content {
  text-align: center;
  max-width: 500px;
}

.page-error-content h1 {
  font-size: 28px;
  color: #1f2937;
  margin-bottom: 12px;
}

.page-error-content p {
  color: #6b7280;
  margin-bottom: 24px;
}

.page-error-code {
  background: #fee2e2;
  color: #991b1b;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 24px;
  font-family: monospace;
}

.page-error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.component-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #fef3f2;
  border: 1px solid #fecaca;
  border-radius: 4px;
  color: #991b1b;
}

.data-fetch-error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.error-icon-small {
  color: #dc3545;
}

.error-content {
  flex: 1;
}

.error-text {
  font-weight: 500;
  margin-bottom: 4px;
}

.error-details-small {
  font-size: 14px;
  color: #6b7280;
}

.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
  padding: 40px;
}

.not-found-icon {
  font-size: 72px;
  font-weight: bold;
  color: #e5e7eb;
  margin-bottom: 24px;
}

.not-found h2 {
  font-size: 24px;
  margin-bottom: 12px;
}

.not-found p {
  color: #6b7280;
  margin-bottom: 24px;
}

.not-found-actions {
  display: flex;
  gap: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.empty-state-icon {
  font-size: 48px;
  margin-bottom: 16px;
  color: #9ca3af;
}

.empty-state-title {
  font-size: 18px;
  margin-bottom: 8px;
}

.empty-state-description {
  color: #6b7280;
  margin-bottom: 24px;
  max-width: 400px;
}
`;

export const errorBoundaryStyles = styles;

export default ErrorBoundary;
