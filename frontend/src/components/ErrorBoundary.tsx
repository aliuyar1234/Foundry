/**
 * Error Boundary Component (T192)
 * Catches JavaScript errors in child components and displays fallback UI
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary class component
 * React currently only supports error boundaries as class components
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    // Store error info for display
    this.setState({ errorInfo });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // In production, you might want to send this to an error tracking service
    // sendToErrorTrackingService(error, errorInfo);
  }

  componentDidUpdate(prevProps: Props): void {
    // Reset error state if resetKeys change
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      prevProps.resetKeys &&
      !areArraysEqual(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
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
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.reset}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Default error fallback UI
 */
interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onReset?: () => void;
}

export function ErrorFallback({ error, errorInfo, onReset }: ErrorFallbackProps) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center">
        {/* Error Icon */}
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error Title */}
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Something went wrong
        </h2>

        {/* Error Description */}
        <p className="text-gray-600 mb-6">
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3">
          {onReset && (
            <button
              onClick={onReset}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Reload Page
          </button>
        </div>

        {/* Development Error Details */}
        {isDevelopment && error && (
          <div className="mt-6 text-left">
            <details className="bg-gray-50 rounded-lg p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Error Details (Development Only)
              </summary>
              <div className="mt-3 space-y-3">
                {/* Error Message */}
                <div>
                  <div className="text-xs text-gray-500 mb-1">Error Message</div>
                  <code className="block text-sm text-red-600 bg-red-50 p-2 rounded overflow-auto">
                    {error.message}
                  </code>
                </div>

                {/* Stack Trace */}
                {error.stack && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Stack Trace</div>
                    <pre className="text-xs text-gray-700 bg-white p-2 rounded border overflow-auto max-h-48">
                      {error.stack}
                    </pre>
                  </div>
                )}

                {/* Component Stack */}
                {errorInfo?.componentStack && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Component Stack</div>
                    <pre className="text-xs text-gray-700 bg-white p-2 rounded border overflow-auto max-h-48">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Page-level error boundary with navigation option
 */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Page Error
            </h1>
            <p className="text-gray-600 mb-6">
              This page encountered an error. Please try navigating to a different page.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Go Back
              </button>
              <a
                href="/"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Component-level error boundary for isolated failures
 */
export function ComponentErrorBoundary({
  children,
  componentName,
}: {
  children: ReactNode;
  componentName?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg
              className="w-5 h-5 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-600">
            {componentName ? `${componentName} failed to load` : 'Component failed to load'}
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Async error boundary for Suspense fallbacks
 */
export function AsyncErrorBoundary({
  children,
  loadingFallback,
}: {
  children: ReactNode;
  loadingFallback?: ReactNode;
}) {
  return (
    <ErrorBoundary>
      <React.Suspense
        fallback={
          loadingFallback || (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          )
        }
      >
        {children}
      </React.Suspense>
    </ErrorBoundary>
  );
}

/**
 * Hook for error handling in functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  if (error) {
    throw error;
  }

  return {
    handleError: setError,
    captureError: (callback: () => void) => {
      try {
        callback();
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    },
    captureAsync: async (callback: () => Promise<void>) => {
      try {
        await callback();
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    },
  };
}

/**
 * Helper to compare arrays for reset key changes
 */
function areArraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

export default ErrorBoundary;
