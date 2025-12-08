/**
 * Escalation Path Editor Component
 * T060 - Create escalation path editor
 *
 * Allows users to configure escalation paths for routing rules
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

// =============================================================================
// Types
// =============================================================================

export interface EscalationStep {
  id: string;
  waitMinutes: number;
  handlerType: 'person' | 'team' | 'queue' | 'manager';
  handlerId?: string;
  handlerName?: string;
  notifyOriginal: boolean;
  notifyManager?: boolean;
  priority?: 'normal' | 'high' | 'urgent';
}

export interface EscalationPath {
  id: string;
  name: string;
  description?: string;
  steps: EscalationStep[];
  maxEscalations?: number;
  autoResolveMinutes?: number;
}

interface EscalationEditorProps {
  escalationPath?: EscalationPath;
  onChange?: (path: EscalationPath) => void;
  onSave?: (path: EscalationPath) => void;
  onCancel?: () => void;
  availableHandlers?: Array<{ id: string; name: string; type: string }>;
  readOnly?: boolean;
}

// =============================================================================
// Default Values
// =============================================================================

const defaultStep: Omit<EscalationStep, 'id'> = {
  waitMinutes: 30,
  handlerType: 'manager',
  notifyOriginal: true,
  priority: 'normal',
};

const defaultPath: EscalationPath = {
  id: '',
  name: '',
  description: '',
  steps: [],
  maxEscalations: 3,
};

// =============================================================================
// Component
// =============================================================================

export function EscalationEditor({
  escalationPath,
  onChange,
  onSave,
  onCancel,
  availableHandlers = [],
  readOnly = false,
}: EscalationEditorProps) {
  const [path, setPath] = useState<EscalationPath>(escalationPath || defaultPath);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update path and notify parent
  const updatePath = useCallback(
    (updates: Partial<EscalationPath>) => {
      const newPath = { ...path, ...updates };
      setPath(newPath);
      onChange?.(newPath);
    },
    [path, onChange]
  );

  // Add a new escalation step
  const addStep = useCallback(() => {
    const newStep: EscalationStep = {
      ...defaultStep,
      id: `step-${Date.now()}`,
      // Each subsequent step waits longer
      waitMinutes: (path.steps.length + 1) * 30,
      // Increase priority with each escalation
      priority: path.steps.length >= 2 ? 'urgent' : path.steps.length >= 1 ? 'high' : 'normal',
    };

    updatePath({ steps: [...path.steps, newStep] });
    setExpandedStep(newStep.id);
  }, [path.steps, updatePath]);

  // Remove a step
  const removeStep = useCallback(
    (stepId: string) => {
      updatePath({ steps: path.steps.filter((s) => s.id !== stepId) });
      if (expandedStep === stepId) {
        setExpandedStep(null);
      }
    },
    [path.steps, expandedStep, updatePath]
  );

  // Update a specific step
  const updateStep = useCallback(
    (stepId: string, updates: Partial<EscalationStep>) => {
      updatePath({
        steps: path.steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)),
      });
    },
    [path.steps, updatePath]
  );

  // Move step up/down
  const moveStep = useCallback(
    (stepId: string, direction: 'up' | 'down') => {
      const index = path.steps.findIndex((s) => s.id === stepId);
      if (index === -1) return;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= path.steps.length) return;

      const newSteps = [...path.steps];
      [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
      updatePath({ steps: newSteps });
    },
    [path.steps, updatePath]
  );

  // Validate the escalation path
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!path.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (path.steps.length === 0) {
      newErrors.steps = 'At least one escalation step is required';
    }

    path.steps.forEach((step, index) => {
      if (step.handlerType !== 'manager' && !step.handlerId) {
        newErrors[`step-${index}-handler`] = 'Handler is required';
      }
      if (step.waitMinutes < 1) {
        newErrors[`step-${index}-wait`] = 'Wait time must be at least 1 minute';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = () => {
    if (validate()) {
      onSave?.(path);
    }
  };

  // Calculate total escalation time
  const totalEscalationTime = path.steps.reduce((sum, step) => sum + step.waitMinutes, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Escalation Path</span>
          {path.steps.length > 0 && (
            <Badge variant="outline">
              {path.steps.length} step{path.steps.length !== 1 ? 's' : ''} &middot;{' '}
              {formatMinutes(totalEscalationTime)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Path Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={path.name}
                onChange={(e) => updatePath({ name: e.target.value })}
                placeholder="e.g., Standard IT Escalation"
                disabled={readOnly}
              />
              {errors.name && (
                <p className="text-sm text-red-500 mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Max Escalations
              </label>
              <Input
                type="number"
                min="1"
                max="10"
                value={path.maxEscalations || 3}
                onChange={(e) =>
                  updatePath({ maxEscalations: parseInt(e.target.value) || 3 })
                }
                disabled={readOnly}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input
              value={path.description || ''}
              onChange={(e) => updatePath({ description: e.target.value })}
              placeholder="Optional description of when this path should be used"
              disabled={readOnly}
            />
          </div>

          {/* Escalation Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Escalation Steps</h4>
              {!readOnly && (
                <Button
                  size="sm"
                  onClick={addStep}
                  disabled={path.steps.length >= (path.maxEscalations || 10)}
                >
                  + Add Step
                </Button>
              )}
            </div>

            {errors.steps && (
              <p className="text-sm text-red-500 mb-2">{errors.steps}</p>
            )}

            {path.steps.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                <p className="text-gray-500 mb-2">No escalation steps defined</p>
                {!readOnly && (
                  <Button size="sm" onClick={addStep}>
                    Add First Step
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {path.steps.map((step, index) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={index}
                    isExpanded={expandedStep === step.id}
                    isFirst={index === 0}
                    isLast={index === path.steps.length - 1}
                    onToggle={() =>
                      setExpandedStep(expandedStep === step.id ? null : step.id)
                    }
                    onUpdate={(updates) => updateStep(step.id, updates)}
                    onRemove={() => removeStep(step.id)}
                    onMoveUp={() => moveStep(step.id, 'up')}
                    onMoveDown={() => moveStep(step.id, 'down')}
                    availableHandlers={availableHandlers}
                    readOnly={readOnly}
                    errors={errors}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Timeline Preview */}
          {path.steps.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Escalation Timeline</h4>
              <div className="relative pl-4 border-l-2 border-blue-200">
                <div className="absolute -left-2 top-0 w-3 h-3 bg-green-500 rounded-full" />
                <p className="text-sm text-gray-600 pb-4 pl-4">
                  <span className="font-medium">0 min:</span> Request assigned to
                  initial handler
                </p>

                {path.steps.map((step, index) => {
                  const cumulativeTime = path.steps
                    .slice(0, index + 1)
                    .reduce((sum, s) => sum + s.waitMinutes, 0);

                  return (
                    <div key={step.id} className="relative pb-4">
                      <div
                        className={`absolute -left-2 w-3 h-3 rounded-full ${
                          step.priority === 'urgent'
                            ? 'bg-red-500'
                            : step.priority === 'high'
                            ? 'bg-orange-500'
                            : 'bg-blue-500'
                        }`}
                      />
                      <p className="text-sm text-gray-600 pl-4">
                        <span className="font-medium">
                          {formatMinutes(cumulativeTime)}:
                        </span>{' '}
                        Escalate to{' '}
                        {step.handlerType === 'manager'
                          ? "original handler's manager"
                          : step.handlerName || step.handlerId || step.handlerType}
                        {step.notifyOriginal && ' (notify original)'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {!readOnly && (onSave || onCancel) && (
            <div className="flex justify-end gap-2 border-t pt-4">
              {onCancel && (
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              {onSave && (
                <Button onClick={handleSave} disabled={path.steps.length === 0}>
                  Save Escalation Path
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Step Card Sub-component
// =============================================================================

interface StepCardProps {
  step: EscalationStep;
  index: number;
  isExpanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<EscalationStep>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  availableHandlers: Array<{ id: string; name: string; type: string }>;
  readOnly: boolean;
  errors: Record<string, string>;
}

function StepCard({
  step,
  index,
  isExpanded,
  isFirst,
  isLast,
  onToggle,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  availableHandlers,
  readOnly,
  errors,
}: StepCardProps) {
  const priorityColors = {
    normal: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        isExpanded ? 'border-blue-300 shadow-sm' : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 bg-blue-500 text-white text-sm rounded-full">
            {index + 1}
          </span>
          <div>
            <span className="font-medium">
              After {formatMinutes(step.waitMinutes)}
            </span>
            <span className="text-gray-500 mx-2">→</span>
            <span>
              {step.handlerType === 'manager'
                ? 'Escalate to Manager'
                : step.handlerName || `${step.handlerType}: ${step.handlerId || 'Select...'}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={priorityColors[step.priority || 'normal']}>
            {step.priority || 'normal'}
          </Badge>
          <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 border-t">
          {/* Wait Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Wait Time (minutes)
              </label>
              <Input
                type="number"
                min="1"
                max="10080"
                value={step.waitMinutes}
                onChange={(e) =>
                  onUpdate({ waitMinutes: parseInt(e.target.value) || 30 })
                }
                disabled={readOnly}
              />
              {errors[`step-${index}-wait`] && (
                <p className="text-sm text-red-500 mt-1">
                  {errors[`step-${index}-wait`]}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                = {formatMinutes(step.waitMinutes)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={step.priority || 'normal'}
                onChange={(e) =>
                  onUpdate({
                    priority: e.target.value as EscalationStep['priority'],
                  })
                }
                disabled={readOnly}
                className="w-full p-2 border rounded-md"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Handler Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Escalate To
              </label>
              <select
                value={step.handlerType}
                onChange={(e) =>
                  onUpdate({
                    handlerType: e.target.value as EscalationStep['handlerType'],
                    handlerId: e.target.value === 'manager' ? undefined : step.handlerId,
                  })
                }
                disabled={readOnly}
                className="w-full p-2 border rounded-md"
              >
                <option value="manager">Manager (auto)</option>
                <option value="person">Specific Person</option>
                <option value="team">Team</option>
                <option value="queue">Queue</option>
              </select>
            </div>

            {step.handlerType !== 'manager' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Select Handler
                </label>
                <select
                  value={step.handlerId || ''}
                  onChange={(e) => {
                    const handler = availableHandlers.find(
                      (h) => h.id === e.target.value
                    );
                    onUpdate({
                      handlerId: e.target.value,
                      handlerName: handler?.name,
                    });
                  }}
                  disabled={readOnly}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select...</option>
                  {availableHandlers
                    .filter((h) => h.type === step.handlerType)
                    .map((handler) => (
                      <option key={handler.id} value={handler.id}>
                        {handler.name}
                      </option>
                    ))}
                </select>
                {errors[`step-${index}-handler`] && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors[`step-${index}-handler`]}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notification Options */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={step.notifyOriginal}
                onChange={(e) => onUpdate({ notifyOriginal: e.target.checked })}
                disabled={readOnly}
                className="rounded"
              />
              <span className="text-sm">Notify original handler</span>
            </label>

            {step.handlerType !== 'manager' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={step.notifyManager || false}
                  onChange={(e) => onUpdate({ notifyManager: e.target.checked })}
                  disabled={readOnly}
                  className="rounded"
                />
                <span className="text-sm">Also notify manager</span>
              </label>
            )}
          </div>

          {/* Step Actions */}
          {!readOnly && (
            <div className="flex justify-between border-t pt-3">
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onMoveUp}
                  disabled={isFirst}
                  title="Move up"
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onMoveDown}
                  disabled={isLast}
                  title="Move down"
                >
                  ↓
                </Button>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={onRemove}
              >
                Remove Step
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

export default EscalationEditor;
