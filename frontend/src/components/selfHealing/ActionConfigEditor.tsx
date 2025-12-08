/**
 * Action Configuration Editor Component
 * T157 - Create action configuration editor
 *
 * Editor for creating and modifying automated actions
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

// =============================================================================
// Types
// =============================================================================

export type TriggerType = 'pattern' | 'threshold' | 'schedule' | 'event';
export type ActionType = 'reminder' | 'escalation' | 'retry' | 'redistribute' | 'notify' | 'custom';

export interface AutomatedAction {
  id?: string;
  name: string;
  description?: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  actionType: ActionType;
  actionConfig: Record<string, unknown>;
  requiresApproval: boolean;
  approvalRoles: string[];
  isActive: boolean;
}

interface ActionConfigEditorProps {
  action?: AutomatedAction;
  onChange?: (action: AutomatedAction) => void;
  onSave?: (action: AutomatedAction) => void;
  onCancel?: () => void;
  onTest?: (action: AutomatedAction) => void;
  readOnly?: boolean;
}

// =============================================================================
// Default Values
// =============================================================================

const defaultAction: AutomatedAction = {
  name: '',
  description: '',
  triggerType: 'pattern',
  triggerConfig: { type: 'pattern', patternType: 'stuck_process' },
  actionType: 'reminder',
  actionConfig: {
    type: 'reminder',
    target: '',
    messageTemplate: '',
    channel: 'in_app',
  },
  requiresApproval: false,
  approvalRoles: [],
  isActive: true,
};

const patternTypes = [
  { value: 'stuck_process', label: 'Stuck Process' },
  { value: 'integration_failure', label: 'Integration Failure' },
  { value: 'workload_imbalance', label: 'Workload Imbalance' },
  { value: 'approval_bottleneck', label: 'Approval Bottleneck' },
  { value: 'response_delay', label: 'Response Delay' },
  { value: 'repeated_errors', label: 'Repeated Errors' },
];

const actionTypes = [
  { value: 'reminder', label: 'Send Reminder', description: 'Send a reminder notification' },
  { value: 'escalation', label: 'Escalate', description: 'Escalate to higher authority' },
  { value: 'retry', label: 'Retry Operation', description: 'Retry failed operations' },
  { value: 'redistribute', label: 'Redistribute Work', description: 'Redistribute workload' },
  { value: 'notify', label: 'Notify Team', description: 'Send team notification' },
];

// =============================================================================
// Component
// =============================================================================

export function ActionConfigEditor({
  action,
  onChange,
  onSave,
  onCancel,
  onTest,
  readOnly = false,
}: ActionConfigEditorProps) {
  const [currentAction, setCurrentAction] = useState<AutomatedAction>(
    action || defaultAction
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<'trigger' | 'action' | 'settings'>('trigger');

  const updateAction = useCallback(
    (updates: Partial<AutomatedAction>) => {
      const newAction = { ...currentAction, ...updates };
      setCurrentAction(newAction);
      onChange?.(newAction);
    },
    [currentAction, onChange]
  );

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!currentAction.name.trim()) {
      newErrors.name = 'Name is required';
    }

    // Validate trigger config
    if (currentAction.triggerType === 'pattern') {
      if (!(currentAction.triggerConfig as { patternType?: string }).patternType) {
        newErrors.patternType = 'Pattern type is required';
      }
    }

    // Validate action config
    if (currentAction.actionType === 'reminder') {
      const config = currentAction.actionConfig as { target?: string; messageTemplate?: string };
      if (!config.target) {
        newErrors.target = 'Reminder target is required';
      }
      if (!config.messageTemplate) {
        newErrors.messageTemplate = 'Message template is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validate()) {
      onSave?.(currentAction);
    }
  };

  const handleTest = () => {
    if (validate()) {
      onTest?.(currentAction);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {action?.id ? 'Edit Automated Action' : 'Create Automated Action'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Action Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={currentAction.name}
                onChange={(e) => updateAction({ name: e.target.value })}
                placeholder="e.g., Remind on Stuck Process"
                disabled={readOnly}
              />
              {errors.name && (
                <p className="text-sm text-red-500 mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentAction.isActive}
                    onChange={(e) => updateAction({ isActive: e.target.checked })}
                    disabled={readOnly}
                    className="rounded"
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentAction.requiresApproval}
                    onChange={(e) => updateAction({ requiresApproval: e.target.checked })}
                    disabled={readOnly}
                    className="rounded"
                  />
                  <span>Requires Approval</span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input
              value={currentAction.description || ''}
              onChange={(e) => updateAction({ description: e.target.value })}
              placeholder="Optional description of what this action does"
              disabled={readOnly}
            />
          </div>

          {/* Section Tabs */}
          <div className="border-b">
            <div className="flex gap-4">
              {(['trigger', 'action', 'settings'] as const).map((section) => (
                <button
                  key={section}
                  className={`pb-2 px-1 border-b-2 transition-colors ${
                    activeSection === section
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setActiveSection(section)}
                >
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Trigger Configuration */}
          {activeSection === 'trigger' && (
            <TriggerConfig
              triggerType={currentAction.triggerType}
              config={currentAction.triggerConfig}
              onTriggerTypeChange={(type) =>
                updateAction({
                  triggerType: type,
                  triggerConfig: { type },
                })
              }
              onConfigChange={(config) =>
                updateAction({ triggerConfig: config })
              }
              errors={errors}
              readOnly={readOnly}
            />
          )}

          {/* Action Configuration */}
          {activeSection === 'action' && (
            <ActionConfig
              actionType={currentAction.actionType}
              config={currentAction.actionConfig}
              onActionTypeChange={(type) =>
                updateAction({
                  actionType: type,
                  actionConfig: { type },
                })
              }
              onConfigChange={(config) =>
                updateAction({ actionConfig: config })
              }
              errors={errors}
              readOnly={readOnly}
            />
          )}

          {/* Additional Settings */}
          {activeSection === 'settings' && (
            <SettingsConfig
              requiresApproval={currentAction.requiresApproval}
              approvalRoles={currentAction.approvalRoles}
              onApprovalChange={(requires) =>
                updateAction({ requiresApproval: requires })
              }
              onRolesChange={(roles) =>
                updateAction({ approvalRoles: roles })
              }
              readOnly={readOnly}
            />
          )}

          {/* Actions */}
          {!readOnly && (
            <div className="flex justify-between border-t pt-4">
              <div>
                {onTest && (
                  <Button variant="outline" onClick={handleTest}>
                    Test Action
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {onCancel && (
                  <Button variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                )}
                {onSave && <Button onClick={handleSave}>Save Action</Button>}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface TriggerConfigProps {
  triggerType: TriggerType;
  config: Record<string, unknown>;
  onTriggerTypeChange: (type: TriggerType) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}

function TriggerConfig({
  triggerType,
  config,
  onTriggerTypeChange,
  onConfigChange,
  errors,
  readOnly,
}: TriggerConfigProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Trigger Type</label>
        <select
          value={triggerType}
          onChange={(e) => onTriggerTypeChange(e.target.value as TriggerType)}
          disabled={readOnly}
          className="w-full p-2 border rounded-md"
        >
          <option value="pattern">Pattern Detected</option>
          <option value="threshold">Threshold Exceeded</option>
          <option value="schedule">Scheduled</option>
          <option value="event">Event-based</option>
        </select>
      </div>

      {triggerType === 'pattern' && (
        <div>
          <label className="block text-sm font-medium mb-1">
            Pattern Type <span className="text-red-500">*</span>
          </label>
          <select
            value={(config.patternType as string) || ''}
            onChange={(e) =>
              onConfigChange({ ...config, type: 'pattern', patternType: e.target.value })
            }
            disabled={readOnly}
            className="w-full p-2 border rounded-md"
          >
            <option value="">Select pattern type...</option>
            {patternTypes.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            ))}
          </select>
          {errors.patternType && (
            <p className="text-sm text-red-500 mt-1">{errors.patternType}</p>
          )}

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Min Occurrences
              </label>
              <Input
                type="number"
                min="1"
                value={(config.minOccurrences as number) || 1}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    minOccurrences: parseInt(e.target.value) || 1,
                  })
                }
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Time Window (minutes)
              </label>
              <Input
                type="number"
                min="5"
                value={(config.timeWindowMinutes as number) || 60}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    timeWindowMinutes: parseInt(e.target.value) || 60,
                  })
                }
                disabled={readOnly}
              />
            </div>
          </div>
        </div>
      )}

      {triggerType === 'schedule' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Cron Expression</label>
            <Input
              value={(config.cronExpression as string) || ''}
              onChange={(e) =>
                onConfigChange({ ...config, type: 'schedule', cronExpression: e.target.value })
              }
              placeholder="0 9 * * MON-FRI"
              disabled={readOnly}
            />
            <p className="text-xs text-gray-500 mt-1">
              e.g., "0 9 * * MON-FRI" = 9 AM on weekdays
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Timezone</label>
            <Input
              value={(config.timezone as string) || 'UTC'}
              onChange={(e) =>
                onConfigChange({ ...config, timezone: e.target.value })
              }
              disabled={readOnly}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ActionConfigProps {
  actionType: ActionType;
  config: Record<string, unknown>;
  onActionTypeChange: (type: ActionType) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}

function ActionConfig({
  actionType,
  config,
  onActionTypeChange,
  onConfigChange,
  errors,
  readOnly,
}: ActionConfigProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Action Type</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {actionTypes.map((at) => (
            <div
              key={at.value}
              className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                actionType === at.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${readOnly ? 'pointer-events-none opacity-50' : ''}`}
              onClick={() => onActionTypeChange(at.value as ActionType)}
            >
              <div className="font-medium text-sm">{at.label}</div>
              <div className="text-xs text-gray-500">{at.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Reminder Configuration */}
      {actionType === 'reminder' && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Target <span className="text-red-500">*</span>
              </label>
              <Input
                value={(config.target as string) || ''}
                onChange={(e) =>
                  onConfigChange({ ...config, type: 'reminder', target: e.target.value })
                }
                placeholder="Person ID or role name"
                disabled={readOnly}
              />
              {errors.target && (
                <p className="text-sm text-red-500 mt-1">{errors.target}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Channel</label>
              <select
                value={(config.channel as string) || 'in_app'}
                onChange={(e) =>
                  onConfigChange({ ...config, channel: e.target.value })
                }
                disabled={readOnly}
                className="w-full p-2 border rounded-md"
              >
                <option value="in_app">In-App Notification</option>
                <option value="email">Email</option>
                <option value="slack">Slack</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Message Template <span className="text-red-500">*</span>
            </label>
            <textarea
              value={(config.messageTemplate as string) || ''}
              onChange={(e) =>
                onConfigChange({ ...config, messageTemplate: e.target.value })
              }
              placeholder="Please review: {{pattern.description}}"
              disabled={readOnly}
              className="w-full p-2 border rounded-md h-24"
            />
            {errors.messageTemplate && (
              <p className="text-sm text-red-500 mt-1">{errors.messageTemplate}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Variables: {`{{pattern.type}}`}, {`{{pattern.description}}`},{' '}
              {`{{pattern.severity}}`}, {`{{date}}`}, {`{{time}}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Repeat Interval (minutes)
              </label>
              <Input
                type="number"
                min="0"
                value={(config.repeatIntervalMinutes as number) || 0}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    repeatIntervalMinutes: parseInt(e.target.value) || 0,
                  })
                }
                disabled={readOnly}
              />
              <p className="text-xs text-gray-500 mt-1">0 = no repeat</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Reminders</label>
              <Input
                type="number"
                min="1"
                value={(config.maxReminders as number) || 3}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    maxReminders: parseInt(e.target.value) || 3,
                  })
                }
                disabled={readOnly}
              />
            </div>
          </div>
        </div>
      )}

      {/* Retry Configuration */}
      {actionType === 'retry' && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium mb-1">Target Type</label>
            <select
              value={(config.targetType as string) || 'job'}
              onChange={(e) =>
                onConfigChange({ ...config, type: 'retry', targetType: e.target.value })
              }
              disabled={readOnly}
              className="w-full p-2 border rounded-md"
            >
              <option value="job">Job</option>
              <option value="integration">Integration</option>
              <option value="process_step">Process Step</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Attempts</label>
              <Input
                type="number"
                min="1"
                max="10"
                value={(config.maxAttempts as number) || 3}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    maxAttempts: parseInt(e.target.value) || 3,
                  })
                }
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Delay (seconds)</label>
              <Input
                type="number"
                min="1"
                value={(config.delaySeconds as number) || 60}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    delaySeconds: parseInt(e.target.value) || 60,
                  })
                }
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Backoff Multiplier</label>
              <Input
                type="number"
                min="1"
                step="0.1"
                value={(config.backoffMultiplier as number) || 2}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    backoffMultiplier: parseFloat(e.target.value) || 2,
                  })
                }
                disabled={readOnly}
              />
            </div>
          </div>
        </div>
      )}

      {/* Redistribute Configuration */}
      {actionType === 'redistribute' && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium mb-1">Strategy</label>
            <select
              value={(config.strategy as string) || 'least_loaded'}
              onChange={(e) =>
                onConfigChange({ ...config, type: 'redistribute', strategy: e.target.value })
              }
              disabled={readOnly}
              className="w-full p-2 border rounded-md"
            >
              <option value="round_robin">Round Robin</option>
              <option value="least_loaded">Least Loaded</option>
              <option value="skill_based">Skill Based</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Target Pool (team IDs or person IDs, comma-separated)
            </label>
            <Input
              value={((config.targetPool as string[]) || []).join(', ')}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  targetPool: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="team-id-1, team-id-2"
              disabled={readOnly}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(config.preserveHistory as boolean) ?? true}
              onChange={(e) =>
                onConfigChange({ ...config, preserveHistory: e.target.checked })
              }
              disabled={readOnly}
              className="rounded"
            />
            <span className="text-sm">Preserve assignment history</span>
          </label>
        </div>
      )}
    </div>
  );
}

interface SettingsConfigProps {
  requiresApproval: boolean;
  approvalRoles: string[];
  onApprovalChange: (requires: boolean) => void;
  onRolesChange: (roles: string[]) => void;
  readOnly: boolean;
}

function SettingsConfig({
  requiresApproval,
  approvalRoles,
  onApprovalChange,
  onRolesChange,
  readOnly,
}: SettingsConfigProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => onApprovalChange(e.target.checked)}
            disabled={readOnly}
            className="rounded"
          />
          <span className="font-medium">Require Approval Before Execution</span>
        </label>
        <p className="text-sm text-gray-500 mt-1 ml-6">
          When enabled, actions will need to be approved before being executed
        </p>
      </div>

      {requiresApproval && (
        <div className="ml-6">
          <label className="block text-sm font-medium mb-1">Approval Roles</label>
          <Input
            value={approvalRoles.join(', ')}
            onChange={(e) =>
              onRolesChange(
                e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              )
            }
            placeholder="admin, supervisor, manager"
            disabled={readOnly}
          />
          <p className="text-xs text-gray-500 mt-1">
            Comma-separated list of roles that can approve this action
          </p>
        </div>
      )}

      <div className="pt-4 border-t">
        <h4 className="font-medium mb-3">Safety Settings</h4>
        <div className="space-y-2 text-sm">
          <p className="text-gray-600">
            All actions are subject to automatic safety checks before execution:
          </p>
          <ul className="list-disc list-inside text-gray-500 ml-2">
            <li>Rate limiting (max 100 actions/hour)</li>
            <li>Concurrent execution limits</li>
            <li>Cooldown periods between same actions</li>
            <li>Target availability validation</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ActionConfigEditor;
