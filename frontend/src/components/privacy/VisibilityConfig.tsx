/**
 * Data Visibility Configuration Component
 * Configure role-based data visibility rules
 * T304 - Data visibility configuration
 */

import React, { useState, useEffect } from 'react';

type VisibilityLevel = 'full' | 'partial' | 'aggregated' | 'none';
type DataCategory = 'personal' | 'communication' | 'process' | 'financial' | 'performance' | 'organizational' | 'system';

interface VisibilityRule {
  id: string;
  role: string;
  dataCategory: DataCategory;
  visibilityLevel: VisibilityLevel;
  allowedFields?: string[];
  deniedFields?: string[];
  aggregationLevel?: string;
  requiresJustification: boolean;
  auditRequired: boolean;
}

interface VisibilitySummary {
  level: VisibilityLevel;
  restrictions: string[];
}

const ROLES = ['admin', 'manager', 'analyst', 'employee', 'auditor', 'works_council'];

const DATA_CATEGORIES: { id: DataCategory; name: string; description: string }[] = [
  { id: 'personal', name: 'Personal Data', description: 'Names, emails, employee IDs' },
  { id: 'communication', name: 'Communication', description: 'Messages, emails, calls' },
  { id: 'process', name: 'Process Data', description: 'Workflows, tasks, projects' },
  { id: 'financial', name: 'Financial', description: 'Salaries, budgets, expenses' },
  { id: 'performance', name: 'Performance', description: 'Evaluations, metrics, goals' },
  { id: 'organizational', name: 'Organizational', description: 'Structure, teams, reporting' },
  { id: 'system', name: 'System Data', description: 'Logs, configurations, audit trails' },
];

const VISIBILITY_LEVELS: { id: VisibilityLevel; name: string; color: string; description: string }[] = [
  { id: 'full', name: 'Full', color: 'green', description: 'Complete access to all fields' },
  { id: 'partial', name: 'Partial', color: 'yellow', description: 'Access to allowed fields only' },
  { id: 'aggregated', name: 'Aggregated', color: 'blue', description: 'Only aggregated/anonymous data' },
  { id: 'none', name: 'None', color: 'red', description: 'No access' },
];

interface VisibilityConfigProps {
  organizationId: string;
}

export const VisibilityConfig: React.FC<VisibilityConfigProps> = ({ organizationId }) => {
  const [rules, setRules] = useState<VisibilityRule[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('manager');
  const [roleSummary, setRoleSummary] = useState<Record<DataCategory, VisibilitySummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<VisibilityRule | null>(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      loadRoleSummary(selectedRole);
    }
  }, [selectedRole, rules]);

  const loadRules = async () => {
    try {
      setLoading(true);
      // In production: fetch from API
      // const response = await fetch(`/api/v1/organizations/${organizationId}/privacy/visibility-rules`);

      // Mock data
      setRules([
        {
          id: '1',
          role: 'manager',
          dataCategory: 'personal',
          visibilityLevel: 'partial',
          allowedFields: ['name', 'department', 'jobTitle'],
          deniedFields: ['ssn', 'salary', 'address'],
          requiresJustification: true,
          auditRequired: true,
        },
        {
          id: '2',
          role: 'manager',
          dataCategory: 'communication',
          visibilityLevel: 'aggregated',
          aggregationLevel: 'team',
          requiresJustification: false,
          auditRequired: true,
        },
        {
          id: '3',
          role: 'analyst',
          dataCategory: 'process',
          visibilityLevel: 'full',
          requiresJustification: false,
          auditRequired: true,
        },
        {
          id: '4',
          role: 'works_council',
          dataCategory: 'performance',
          visibilityLevel: 'aggregated',
          aggregationLevel: 'department',
          requiresJustification: false,
          auditRequired: true,
        },
      ]);
    } catch (error) {
      console.error('Failed to load visibility rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRoleSummary = async (role: string) => {
    // In production: fetch from API
    const summary: Record<DataCategory, VisibilitySummary> = {} as any;

    DATA_CATEGORIES.forEach(cat => {
      const rule = rules.find(r => r.role === role && r.dataCategory === cat.id);
      if (rule) {
        const restrictions: string[] = [];
        if (rule.deniedFields && rule.deniedFields.length > 0) {
          restrictions.push(`Denied: ${rule.deniedFields.slice(0, 3).join(', ')}${rule.deniedFields.length > 3 ? '...' : ''}`);
        }
        if (rule.requiresJustification) {
          restrictions.push('Requires justification');
        }
        if (rule.aggregationLevel) {
          restrictions.push(`Aggregation: ${rule.aggregationLevel}`);
        }

        summary[cat.id] = {
          level: rule.visibilityLevel,
          restrictions,
        };
      } else {
        // Default based on role
        const defaultLevels: Record<string, VisibilityLevel> = {
          admin: 'full',
          manager: 'partial',
          analyst: 'aggregated',
          employee: 'none',
          auditor: 'full',
          works_council: 'aggregated',
        };
        summary[cat.id] = {
          level: defaultLevels[role] || 'none',
          restrictions: ['Using default'],
        };
      }
    });

    setRoleSummary(summary);
  };

  const handleSaveRule = async (rule: VisibilityRule) => {
    try {
      // In production: save to API
      if (rule.id) {
        setRules(rules.map(r => r.id === rule.id ? rule : r));
      } else {
        setRules([...rules, { ...rule, id: Date.now().toString() }]);
      }
      setShowRuleEditor(false);
      setEditingRule(null);
    } catch (error) {
      console.error('Failed to save rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      // In production: delete from API
      setRules(rules.filter(r => r.id !== ruleId));
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const getVisibilityColor = (level: VisibilityLevel) => {
    const colors = {
      full: 'bg-green-100 text-green-800 border-green-200',
      partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      aggregated: 'bg-blue-100 text-blue-800 border-blue-200',
      none: 'bg-red-100 text-red-800 border-red-200',
    };
    return colors[level];
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrator',
      manager: 'Manager',
      analyst: 'Analyst',
      employee: 'Employee',
      auditor: 'Auditor',
      works_council: 'Works Council',
    };
    return labels[role] || role;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role Selector */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Role Visibility Overview</h2>
        <p className="text-gray-600 mb-4">
          Select a role to see and configure their data visibility permissions.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {ROLES.map(role => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedRole === role
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {getRoleLabel(role)}
            </button>
          ))}
        </div>

        {/* Visibility Matrix */}
        {roleSummary && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Data Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Visibility Level
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Restrictions
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {DATA_CATEGORIES.map(category => {
                  const summary = roleSummary[category.id];
                  const existingRule = rules.find(
                    r => r.role === selectedRole && r.dataCategory === category.id
                  );

                  return (
                    <tr key={category.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{category.name}</div>
                        <div className="text-sm text-gray-500">{category.description}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex px-3 py-1 text-sm font-medium rounded-full border ${getVisibilityColor(
                            summary.level
                          )}`}
                        >
                          {summary.level.charAt(0).toUpperCase() + summary.level.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {summary.restrictions.length > 0 ? (
                          <ul className="text-sm text-gray-600 space-y-1">
                            {summary.restrictions.map((r, idx) => (
                              <li key={idx}>{r}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-sm text-gray-400">No restrictions</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => {
                            setEditingRule(
                              existingRule || {
                                id: '',
                                role: selectedRole,
                                dataCategory: category.id,
                                visibilityLevel: 'none',
                                requiresJustification: false,
                                auditRequired: true,
                              }
                            );
                            setShowRuleEditor(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          {existingRule ? 'Edit' : 'Configure'}
                        </button>
                        {existingRule && (
                          <button
                            onClick={() => handleDeleteRule(existingRule.id)}
                            className="ml-4 text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Visibility Levels</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {VISIBILITY_LEVELS.map(level => (
            <div key={level.id} className="flex items-start space-x-3">
              <span
                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getVisibilityColor(
                  level.id
                )}`}
              >
                {level.name}
              </span>
              <span className="text-sm text-gray-600">{level.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* All Rules List */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Custom Visibility Rules</h2>
          <button
            onClick={() => {
              setEditingRule({
                id: '',
                role: selectedRole,
                dataCategory: 'personal',
                visibilityLevel: 'partial',
                requiresJustification: false,
                auditRequired: true,
              });
              setShowRuleEditor(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Add Rule
          </button>
        </div>

        {rules.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No custom visibility rules defined. Using default visibility matrix.
          </p>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-4">
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                    {getRoleLabel(rule.role)}
                  </span>
                  <span className="text-gray-900">
                    {DATA_CATEGORIES.find(c => c.id === rule.dataCategory)?.name}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded-full ${getVisibilityColor(rule.visibilityLevel)}`}>
                    {rule.visibilityLevel}
                  </span>
                  {rule.requiresJustification && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                      Justification Required
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setEditingRule(rule);
                      setShowRuleEditor(true);
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-2 text-gray-400 hover:text-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rule Editor Modal */}
      {showRuleEditor && editingRule && (
        <RuleEditorModal
          rule={editingRule}
          onSave={handleSaveRule}
          onClose={() => {
            setShowRuleEditor(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
};

interface RuleEditorModalProps {
  rule: VisibilityRule;
  onSave: (rule: VisibilityRule) => void;
  onClose: () => void;
}

const RuleEditorModal: React.FC<RuleEditorModalProps> = ({ rule, onSave, onClose }) => {
  const [formData, setFormData] = useState<VisibilityRule>(rule);
  const [allowedFieldsInput, setAllowedFieldsInput] = useState(rule.allowedFields?.join(', ') || '');
  const [deniedFieldsInput, setDeniedFieldsInput] = useState(rule.deniedFields?.join(', ') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedRule: VisibilityRule = {
      ...formData,
      allowedFields: allowedFieldsInput
        .split(',')
        .map(f => f.trim())
        .filter(f => f.length > 0),
      deniedFields: deniedFieldsInput
        .split(',')
        .map(f => f.trim())
        .filter(f => f.length > 0),
    };

    onSave(updatedRule);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {rule.id ? 'Edit Visibility Rule' : 'Create Visibility Rule'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              {ROLES.map(role => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Category</label>
            <select
              value={formData.dataCategory}
              onChange={(e) =>
                setFormData({ ...formData, dataCategory: e.target.value as DataCategory })
              }
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              {DATA_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visibility Level</label>
            <select
              value={formData.visibilityLevel}
              onChange={(e) =>
                setFormData({ ...formData, visibilityLevel: e.target.value as VisibilityLevel })
              }
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              {VISIBILITY_LEVELS.map(level => (
                <option key={level.id} value={level.id}>
                  {level.name} - {level.description}
                </option>
              ))}
            </select>
          </div>

          {formData.visibilityLevel === 'partial' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allowed Fields (comma-separated)
                </label>
                <input
                  type="text"
                  value={allowedFieldsInput}
                  onChange={(e) => setAllowedFieldsInput(e.target.value)}
                  placeholder="name, department, jobTitle"
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Denied Fields (comma-separated)
                </label>
                <input
                  type="text"
                  value={deniedFieldsInput}
                  onChange={(e) => setDeniedFieldsInput(e.target.value)}
                  placeholder="ssn, salary, address"
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}

          {formData.visibilityLevel === 'aggregated' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Aggregation Level
              </label>
              <select
                value={formData.aggregationLevel || 'department'}
                onChange={(e) => setFormData({ ...formData, aggregationLevel: e.target.value })}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="team">Team</option>
                <option value="department">Department</option>
                <option value="division">Division</option>
                <option value="organization">Organization</option>
              </select>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.requiresJustification}
                onChange={(e) =>
                  setFormData({ ...formData, requiresJustification: e.target.checked })
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Require justification for access</span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.auditRequired}
                onChange={(e) => setFormData({ ...formData, auditRequired: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Enable audit logging</span>
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VisibilityConfig;
