/**
 * Rule Editor Component
 * T058 - Create routing rule editor
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  type RoutingRule,
} from '../../services/routingApi';

interface RuleFormData {
  name: string;
  description: string;
  priority: number;
  isActive: boolean;
  categories: string[];
  keywords: string[];
  urgencyLevel: 'low' | 'normal' | 'high' | 'critical' | '';
  handlerType: 'person' | 'team' | 'queue' | 'auto';
  targetId: string;
  fallbackTargetId: string;
}

const defaultFormData: RuleFormData = {
  name: '',
  description: '',
  priority: 100,
  isActive: true,
  categories: [],
  keywords: [],
  urgencyLevel: '',
  handlerType: 'auto',
  targetId: '',
  fallbackTargetId: '',
};

interface RuleEditorProps {
  onRuleChange?: () => void;
}

export function RuleEditor({ onRuleChange }: RuleEditorProps) {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRule, setSelectedRule] = useState<RoutingRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      setLoading(true);
      const { rules } = await getRules();
      setRules(rules);
      setError(null);
    } catch (err) {
      setError('Failed to load rules');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectRule(rule: RoutingRule) {
    setSelectedRule(rule);
    setIsCreating(false);
    setFormData({
      name: rule.name,
      description: rule.description || '',
      priority: rule.priority,
      isActive: rule.isActive,
      categories: rule.criteria.categories || [],
      keywords: rule.criteria.keywords || [],
      urgencyLevel: rule.criteria.urgencyLevel || '',
      handlerType: rule.handler.type,
      targetId: rule.handler.targetId || '',
      fallbackTargetId: rule.handler.fallbackTargetId || '',
    });
  }

  function handleNewRule() {
    setSelectedRule(null);
    setIsCreating(true);
    setFormData(defaultFormData);
  }

  function handleCancel() {
    setSelectedRule(null);
    setIsCreating(false);
    setFormData(defaultFormData);
  }

  function addCategory() {
    if (newCategory && !formData.categories.includes(newCategory)) {
      setFormData({
        ...formData,
        categories: [...formData.categories, newCategory],
      });
      setNewCategory('');
    }
  }

  function removeCategory(cat: string) {
    setFormData({
      ...formData,
      categories: formData.categories.filter((c) => c !== cat),
    });
  }

  function addKeyword() {
    if (newKeyword && !formData.keywords.includes(newKeyword)) {
      setFormData({
        ...formData,
        keywords: [...formData.keywords, newKeyword],
      });
      setNewKeyword('');
    }
  }

  function removeKeyword(kw: string) {
    setFormData({
      ...formData,
      keywords: formData.keywords.filter((k) => k !== kw),
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);

      const ruleData = {
        name: formData.name,
        description: formData.description || undefined,
        priority: formData.priority,
        isActive: formData.isActive,
        criteria: {
          categories: formData.categories.length > 0 ? formData.categories : undefined,
          keywords: formData.keywords.length > 0 ? formData.keywords : undefined,
          urgencyLevel: formData.urgencyLevel || undefined,
        },
        handler: {
          type: formData.handlerType,
          targetId: formData.targetId || undefined,
          fallbackTargetId: formData.fallbackTargetId || undefined,
        },
      };

      if (isCreating) {
        await createRule(ruleData);
      } else if (selectedRule) {
        await updateRule(selectedRule.id, ruleData);
      }

      await loadRules();
      handleCancel();
      onRuleChange?.();
    } catch (err) {
      setError('Failed to save rule');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedRule) return;
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      setSaving(true);
      await deleteRule(selectedRule.id);
      await loadRules();
      handleCancel();
      onRuleChange?.();
    } catch (err) {
      setError('Failed to delete rule');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-200 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Rules List */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Routing Rules</CardTitle>
          <Button size="sm" onClick={handleNewRule}>
            + New Rule
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                onClick={() => handleSelectRule(rule)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedRule?.id === rule.id
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{rule.name}</span>
                  <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Priority: {rule.priority} | Handler: {rule.handler.type}
                </div>
              </div>
            ))}
            {rules.length === 0 && (
              <p className="text-gray-500 text-center py-4">
                No rules defined. Create one to get started.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rule Editor */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>
            {isCreating
              ? 'New Rule'
              : selectedRule
              ? 'Edit Rule'
              : 'Select a Rule'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(isCreating || selectedRule) ? (
            <div className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                  {error}
                </div>
              )}

              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Rule name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description
                  </label>
                  <Input
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Optional description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Priority (0-1000)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="1000"
                      value={formData.priority}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priority: parseInt(e.target.value) || 100,
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) =>
                          setFormData({ ...formData, isActive: e.target.checked })
                        }
                        className="rounded"
                      />
                      <span>Active</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Criteria */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Matching Criteria</h4>

                <div className="space-y-4">
                  {/* Categories */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Categories
                    </label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="Add category"
                        onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                      />
                      <Button type="button" onClick={addCategory} size="sm">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.categories.map((cat) => (
                        <Badge
                          key={cat}
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => removeCategory(cat)}
                        >
                          {cat} ×
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Keywords */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Keywords
                    </label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        placeholder="Add keyword"
                        onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                      />
                      <Button type="button" onClick={addKeyword} size="sm">
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.keywords.map((kw) => (
                        <Badge
                          key={kw}
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => removeKeyword(kw)}
                        >
                          {kw} ×
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Urgency */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Urgency Level
                    </label>
                    <select
                      value={formData.urgencyLevel}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          urgencyLevel: e.target.value as RuleFormData['urgencyLevel'],
                        })
                      }
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="">Any</option>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Handler */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Handler Assignment</h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Handler Type
                    </label>
                    <select
                      value={formData.handlerType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          handlerType: e.target.value as RuleFormData['handlerType'],
                        })
                      }
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="auto">Auto (AI-based)</option>
                      <option value="person">Specific Person</option>
                      <option value="team">Team</option>
                      <option value="queue">Queue</option>
                    </select>
                  </div>

                  {formData.handlerType !== 'auto' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Target ID
                        </label>
                        <Input
                          value={formData.targetId}
                          onChange={(e) =>
                            setFormData({ ...formData, targetId: e.target.value })
                          }
                          placeholder={`${formData.handlerType} ID`}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Fallback Target ID (optional)
                        </label>
                        <Input
                          value={formData.fallbackTargetId}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              fallbackTargetId: e.target.value,
                            })
                          }
                          placeholder="Fallback ID"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between border-t pt-4">
                <div>
                  {selectedRule && (
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={saving}
                    >
                      Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving || !formData.name}>
                    {saving ? 'Saving...' : 'Save Rule'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              Select a rule from the list or create a new one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default RuleEditor;
