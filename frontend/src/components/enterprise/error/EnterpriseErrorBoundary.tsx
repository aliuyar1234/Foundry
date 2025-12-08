/**
 * Enterprise Error Boundaries (T369)
 * Specialized error boundaries for enterprise pages with recovery options
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

// =============================================================================
// Types
// =============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
  feature?: string;
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// =============================================================================
// Base Enterprise Error Boundary
// =============================================================================

export class EnterpriseErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to console in development
    console.error(`[${this.props.feature || 'Enterprise'}] Error caught:`, error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // In production, you would send this to an error tracking service
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo);
    }
  }

  private reportError(error: Error, errorInfo: ErrorInfo): void {
    // Placeholder for error reporting service integration
    // e.g., Sentry, DataDog, etc.
    const errorReport = {
      feature: this.props.feature || 'enterprise',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    // Send to error tracking service
    console.log('[Error Report]', errorReport);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoBack = (): void => {
    window.history.back();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-lg w-full">
            <div className="bg-white rounded-xl shadow-lg border border-red-100 p-8">
              {/* Error Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
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
              </div>

              {/* Error Message */}
              <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
                Something went wrong
              </h2>
              <p className="text-gray-600 text-center mb-6">
                {this.props.feature
                  ? `An error occurred in the ${this.props.feature} feature.`
                  : 'An unexpected error occurred.'}
                {' '}Please try again or contact support if the problem persists.
              </p>

              {/* Error Details (Development Mode) */}
              {(this.props.showDetails || process.env.NODE_ENV === 'development') &&
                this.state.error && (
                  <div className="mb-6">
                    <details className="bg-gray-50 rounded-lg p-4">
                      <summary className="cursor-pointer text-sm font-medium text-gray-700 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        Error Details
                      </summary>
                      <div className="mt-3 space-y-2">
                        <div>
                          <span className="text-xs font-medium text-gray-500">Error:</span>
                          <pre className="text-xs text-red-600 mt-1 overflow-auto max-h-20">
                            {this.state.error.message}
                          </pre>
                        </div>
                        {this.state.error.stack && (
                          <div>
                            <span className="text-xs font-medium text-gray-500">Stack Trace:</span>
                            <pre className="text-xs text-gray-600 mt-1 overflow-auto max-h-40 whitespace-pre-wrap">
                              {this.state.error.stack}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={this.handleRetry}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Try Again
                </button>
                <button
                  onClick={this.handleReload}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Reload Page
                </button>
                <button
                  onClick={this.handleGoBack}
                  className="px-5 py-2.5 text-gray-600 hover:text-gray-900 transition-colors font-medium"
                >
                  Go Back
                </button>
              </div>

              {/* Support Link */}
              <p className="text-center text-sm text-gray-500 mt-6">
                Need help?{' '}
                <a href="/support" className="text-blue-600 hover:underline">
                  Contact Support
                </a>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Specialized Error Boundaries
// =============================================================================

export class SSOErrorBoundary extends Component<Omit<ErrorBoundaryProps, 'feature'>, ErrorBoundaryState> {
  constructor(props: Omit<ErrorBoundaryProps, 'feature'>) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[SSO] Error caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="text-center max-w-md p-8 bg-white rounded-xl border border-orange-200">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">SSO Configuration Error</h3>
            <p className="text-gray-600 mb-4">
              Unable to load SSO settings. This may be a temporary issue with your identity provider.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Retry
              </button>
              <a
                href="/settings/auth"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Auth Settings
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export class PartnerAPIErrorBoundary extends Component<Omit<ErrorBoundaryProps, 'feature'>, ErrorBoundaryState> {
  constructor(props: Omit<ErrorBoundaryProps, 'feature'>) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[Partner API] Error caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="text-center max-w-md p-8 bg-white rounded-xl border border-purple-200">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">API Dashboard Error</h3>
            <p className="text-gray-600 mb-4">
              Unable to load Partner API data. Your API keys and access remain secure.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Retry
              </button>
              <a
                href="/api-docs"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                API Docs
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export class WebhookErrorBoundary extends Component<Omit<ErrorBoundaryProps, 'feature'>, ErrorBoundaryState> {
  constructor(props: Omit<ErrorBoundaryProps, 'feature'>) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[Webhook] Error caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="text-center max-w-md p-8 bg-white rounded-xl border border-green-200">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Webhook Configuration Error</h3>
            <p className="text-gray-600 mb-4">
              Unable to load webhook settings. Your existing webhooks continue to function normally.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Retry
              </button>
              <a
                href="/settings/webhooks/logs"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                View Logs
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export class GDPRErrorBoundary extends Component<Omit<ErrorBoundaryProps, 'feature'>, ErrorBoundaryState> {
  constructor(props: Omit<ErrorBoundaryProps, 'feature'>) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[GDPR] Error caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="text-center max-w-md p-8 bg-white rounded-xl border border-blue-200">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Privacy Dashboard Error</h3>
            <p className="text-gray-600 mb-4">
              Unable to load GDPR compliance data. Data protection controls remain active.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
              <a
                href="/privacy-policy"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Privacy Policy
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export class EntityErrorBoundary extends Component<Omit<ErrorBoundaryProps, 'feature'>, ErrorBoundaryState> {
  constructor(props: Omit<ErrorBoundaryProps, 'feature'>) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[Entity] Error caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="text-center max-w-md p-8 bg-white rounded-xl border border-indigo-200">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Entity Management Error</h3>
            <p className="text-gray-600 mb-4">
              Unable to load entity data. Your entity configuration is safe and unchanged.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Retry
              </button>
              <a
                href="/entities"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Entity List
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Error Boundary HOC
// =============================================================================

export function withEnterpriseErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  feature: string
) {
  return function WithErrorBoundary(props: P) {
    return (
      <EnterpriseErrorBoundary feature={feature}>
        <WrappedComponent {...props} />
      </EnterpriseErrorBoundary>
    );
  };
}

// =============================================================================
// Error Hook
// =============================================================================

export function useEnterpriseError(): (error: Error) => void {
  const [, setError] = React.useState<Error | null>(null);

  return React.useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);
}

export default EnterpriseErrorBoundary;
