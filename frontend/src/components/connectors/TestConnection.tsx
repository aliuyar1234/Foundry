/**
 * TestConnection Component (T198)
 * Reusable connection test component with loading, success/error states
 */

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

export interface TestResult {
  success: boolean;
  message?: string;
  details?: Record<string, unknown>;
  error?: string;
  timestamp?: string;
}

interface TestConnectionProps {
  onTest: () => Promise<TestResult>;
  autoTest?: boolean;
  className?: string;
}

export function TestConnection({
  onTest,
  autoTest = false,
  className = '',
}: TestConnectionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [hasTestedOnce, setHasTestedOnce] = useState(false);

  React.useEffect(() => {
    if (autoTest && !hasTestedOnce) {
      handleTest();
    }
  }, [autoTest, hasTestedOnce]);

  const handleTest = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const testResult = await onTest();
      setResult({
        ...testResult,
        timestamp: new Date().toISOString(),
      });
      setHasTestedOnce(true);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
        timestamp: new Date().toISOString(),
      });
      setHasTestedOnce(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      {/* Test Button */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          onClick={handleTest}
          disabled={isLoading}
          variant={result?.success ? 'outline' : 'default'}
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Testing Connection...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              {result ? 'Test Again' : 'Test Connection'}
            </>
          )}
        </Button>

        {result && result.timestamp && (
          <span className="text-xs text-gray-500">
            Last tested: {new Date(result.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">Testing connection...</p>
                <p className="text-xs text-blue-700">Please wait while we verify your credentials</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success State */}
      {!isLoading && result?.success && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {/* Success Icon */}
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              {/* Success Content */}
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-1">
                  Connection Successful
                </p>
                {result.message && (
                  <p className="text-sm text-green-700 mb-2">{result.message}</p>
                )}

                {/* Connection Details */}
                {result.details && Object.keys(result.details).length > 0 && (
                  <div className="mt-3 bg-white rounded-lg p-3 border border-green-200">
                    <p className="text-xs font-medium text-gray-700 mb-2">Connection Details:</p>
                    <dl className="space-y-1">
                      {Object.entries(result.details).map(([key, value]) => (
                        <div key={key} className="flex items-start gap-2 text-xs">
                          <dt className="font-medium text-gray-600 capitalize">
                            {key.replace(/_/g, ' ')}:
                          </dt>
                          <dd className="text-gray-900">
                            {typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {!isLoading && result && !result.success && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {/* Error Icon */}
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              {/* Error Content */}
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 mb-1">Connection Failed</p>
                {result.error && (
                  <p className="text-sm text-red-700 mb-2">{result.error}</p>
                )}

                {/* Troubleshooting Tips */}
                <div className="mt-3 bg-white rounded-lg p-3 border border-red-200">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    Troubleshooting Tips:
                  </p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 mt-0.5">•</span>
                      <span>Verify your credentials are correct</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 mt-0.5">•</span>
                      <span>Check if the service is accessible from your network</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 mt-0.5">•</span>
                      <span>Ensure the API endpoint URL is correct</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 mt-0.5">•</span>
                      <span>Verify required permissions are granted</span>
                    </li>
                  </ul>
                </div>

                {/* Retry Button */}
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={handleTest}>
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TestConnection;
