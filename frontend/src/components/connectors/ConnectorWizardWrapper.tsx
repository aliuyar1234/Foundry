/**
 * ConnectorWizardWrapper Component (T197)
 * Generic wrapper for all connector wizards with common header, navigation, and progress
 */

import React, { ReactNode } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  optional?: boolean;
}

interface ConnectorWizardWrapperProps {
  children: ReactNode;
  connectorName: string;
  connectorLogo?: string;
  steps: WizardStep[];
  currentStep: number;
  onStepChange?: (stepIndex: number) => void;
  onCancel?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  onFinish?: () => void;
  isFirstStep?: boolean;
  isLastStep?: boolean;
  canGoNext?: boolean;
  canGoBack?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

export function ConnectorWizardWrapper({
  children,
  connectorName,
  connectorLogo,
  steps,
  currentStep,
  onStepChange,
  onCancel,
  onBack,
  onNext,
  onFinish,
  isFirstStep = false,
  isLastStep = false,
  canGoNext = true,
  canGoBack = true,
  isLoading = false,
  error = null,
}: ConnectorWizardWrapperProps) {
  const currentStepData = steps[currentStep];

  return (
    <ErrorBoundary>
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            {connectorLogo && (
              <img
                src={connectorLogo}
                alt={`${connectorName} logo`}
                className="w-12 h-12 rounded-lg object-contain"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{connectorName} Setup</h1>
              <p className="text-sm text-gray-500">Configure your connector connection</p>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const isClickable = onStepChange && (isCompleted || index === currentStep + 1);

              return (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => isClickable && onStepChange(index)}
                    disabled={!isClickable}
                    className={`flex-1 text-left ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Step Circle */}
                      <div
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                          ${
                            isCompleted
                              ? 'bg-green-600 text-white'
                              : isActive
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-600'
                          }
                        `}
                      >
                        {isCompleted ? (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          index + 1
                        )}
                      </div>

                      {/* Step Info */}
                      <div className="hidden sm:block">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm font-medium ${
                              isActive ? 'text-gray-900' : 'text-gray-600'
                            }`}
                          >
                            {step.title}
                          </p>
                          {step.optional && (
                            <Badge variant="outline" className="text-xs">
                              Optional
                            </Badge>
                          )}
                        </div>
                        {step.description && (
                          <p className="text-xs text-gray-500 line-clamp-1">{step.description}</p>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Connector Line */}
                  {index < steps.length - 1 && (
                    <div
                      className={`h-0.5 w-12 mx-2 ${
                        index < currentStep ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Main Content Card */}
        <Card>
          <CardHeader>
            <CardTitle>{currentStepData?.title}</CardTitle>
            {currentStepData?.description && (
              <CardDescription>{currentStepData.description}</CardDescription>
            )}
          </CardHeader>

          <CardContent>
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-red-800">Error</p>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step Content */}
            <div className="min-h-[300px]">{children}</div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between mt-6 pt-6 border-t">
              <div>
                {!isFirstStep && (
                  <Button
                    variant="outline"
                    onClick={onBack}
                    disabled={!canGoBack || isLoading}
                  >
                    Back
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
                  Cancel
                </Button>

                {isLastStep ? (
                  <Button onClick={onFinish} disabled={!canGoNext || isLoading}>
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
                        Finishing...
                      </>
                    ) : (
                      'Finish'
                    )}
                  </Button>
                ) : (
                  <Button onClick={onNext} disabled={!canGoNext || isLoading}>
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
                        Loading...
                      </>
                    ) : (
                      'Next'
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Help Text */}
        <p className="text-sm text-gray-500 text-center mt-4">
          Need help? Check our{' '}
          <a href="/docs" className="text-blue-600 hover:underline">
            documentation
          </a>{' '}
          or{' '}
          <a href="/support" className="text-blue-600 hover:underline">
            contact support
          </a>
          .
        </p>
      </div>
    </ErrorBoundary>
  );
}

export default ConnectorWizardWrapper;
