/**
 * Connector Wizard Component
 * Multi-step wizard for configuring data source connections
 */

import React, { useState, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui/card';
import { Button } from '../../ui/button';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  isComplete: () => boolean;
}

interface ConnectorWizardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  steps: WizardStep[];
  onComplete: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ConnectorWizard({
  title,
  description,
  icon,
  steps,
  onComplete,
  onCancel,
  isSubmitting = false,
}: ConnectorWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStep = steps[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;
  const canProceed = currentStep.isComplete();

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (isFirstStep) {
      onCancel();
    } else {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              {icon}
            </div>
          )}
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center ${
                  index < steps.length - 1 ? 'flex-1' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index < currentStepIndex
                      ? 'bg-green-500 text-white'
                      : index === currentStepIndex
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {index < currentStepIndex ? '✓' : index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      index < currentStepIndex ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            {steps.map((step) => (
              <span key={step.id} className="text-center">
                {step.title}
              </span>
            ))}
          </div>
        </div>

        {/* Current step content */}
        <div className="mb-8">
          <h3 className="text-lg font-medium mb-2">{currentStep.title}</h3>
          {currentStep.description && (
            <p className="text-sm text-gray-500 mb-4">{currentStep.description}</p>
          )}
          {currentStep.content}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
            {isFirstStep ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={handleNext} disabled={!canProceed || isSubmitting}>
            {isSubmitting
              ? 'Connecting...'
              : isLastStep
                ? 'Connect'
                : 'Next'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ConnectorWizard;
