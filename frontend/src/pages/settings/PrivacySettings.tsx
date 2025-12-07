/**
 * Privacy Settings Page
 * Comprehensive privacy configuration and compliance management
 * T303 - Privacy settings page
 */

import React, { useState, useEffect } from 'react';

interface PrivacyPolicy {
  mode: 'standard' | 'strict' | 'minimal' | 'custom';
  dataCollection: {
    collectMetadata: boolean;
    collectContent: boolean;
    collectBehavior: boolean;
    collectPerformance: boolean;
    retentionDays: number;
  };
  consent: {
    requireExplicitConsent: boolean;
    allowWithdrawal: boolean;
    consentExpiry: number;
    granularConsent: boolean;
  };
  anonymization: {
    defaultStrategy: string;
    autoAnonymize: boolean;
    piiDetection: boolean;
  };
  reporting: {
    minGroupSize: number;
    allowIndividualReports: boolean;
    requireWorksCouncilApproval: boolean;
  };
}

interface ComplianceScore {
  score: number;
  grade: string;
  breakdown: Record<string, number>;
  recommendations: string[];
}

interface AuditStats {
  totalEntries: number;
  criticalEvents: number;
  successRate: number;
}

const POLICY_MODES = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced privacy with full functionality',
  },
  {
    id: 'strict',
    name: 'Strict',
    description: 'Maximum privacy, metadata-only analysis',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Basic privacy with more data collection',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Fully customized privacy settings',
  },
];

export const PrivacySettings: React.FC = () => {
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [compliance, setCompliance] = useState<ComplianceScore | null>(null);
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'collection' | 'consent' | 'anonymization' | 'reporting'>('overview');

  useEffect(() => {
    loadPrivacyData();
  }, []);

  const loadPrivacyData = async () => {
    try {
      setLoading(true);
      // In production, fetch from API
      // const response = await fetch('/api/v1/organizations/{orgId}/privacy/dashboard');

      // Mock data
      setPolicy({
        mode: 'standard',
        dataCollection: {
          collectMetadata: true,
          collectContent: true,
          collectBehavior: true,
          collectPerformance: true,
          retentionDays: 365,
        },
        consent: {
          requireExplicitConsent: true,
          allowWithdrawal: true,
          consentExpiry: 365,
          granularConsent: true,
        },
        anonymization: {
          defaultStrategy: 'pseudonymize',
          autoAnonymize: true,
          piiDetection: true,
        },
        reporting: {
          minGroupSize: 5,
          allowIndividualReports: false,
          requireWorksCouncilApproval: true,
        },
      });

      setCompliance({
        score: 87,
        grade: 'A',
        breakdown: {
          dataCollection: 90,
          consent: 85,
          anonymization: 88,
          reporting: 85,
          audit: 90,
        },
        recommendations: [
          'Consider enabling metadata-only mode for sensitive departments',
          'Review consent expiry settings for GDPR compliance',
        ],
      });

      setAuditStats({
        totalEntries: 15234,
        criticalEvents: 2,
        successRate: 99.8,
      });
    } catch (error) {
      console.error('Failed to load privacy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (mode: string) => {
    if (!policy) return;

    setPolicy({ ...policy, mode: mode as PrivacyPolicy['mode'] });
    // In production, save to API
  };

  const handleSave = async () => {
    if (!policy) return;

    try {
      setSaving(true);
      // In production: await fetch('/api/v1/organizations/{orgId}/privacy/config', { method: 'PUT', body: JSON.stringify(policy) });
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('Privacy settings saved successfully');
    } catch (error) {
      console.error('Failed to save privacy settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Privacy Settings</h1>
        <p className="text-gray-600 mt-1">
          Configure privacy controls, data collection, and compliance settings
        </p>
      </div>

      {/* Compliance Overview */}
      {compliance && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="text-sm font-medium text-gray-500">Compliance Score</div>
            <div className="flex items-baseline mt-1">
              <span className="text-3xl font-bold text-gray-900">{compliance.score}</span>
              <span className="ml-2 text-lg font-semibold text-green-600">{compliance.grade}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <div className="text-sm font-medium text-gray-500">Privacy Mode</div>
            <div className="text-xl font-bold text-gray-900 mt-1 capitalize">
              {policy?.mode}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
            <div className="text-sm font-medium text-gray-500">Audit Events</div>
            <div className="text-xl font-bold text-gray-900 mt-1">
              {auditStats?.totalEntries.toLocaleString()}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
            <div className="text-sm font-medium text-gray-500">Critical Events</div>
            <div className="text-xl font-bold text-gray-900 mt-1">
              {auditStats?.criticalEvents}
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {compliance?.recommendations && compliance.recommendations.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Recommendations</h3>
          <ul className="list-disc list-inside space-y-1">
            {compliance.recommendations.map((rec, idx) => (
              <li key={idx} className="text-sm text-yellow-700">{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {['overview', 'collection', 'consent', 'anonymization', 'reporting'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'collection' ? 'Data Collection' : tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow">
        {activeTab === 'overview' && policy && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Privacy Mode</h2>
            <p className="text-gray-600 mb-6">
              Select a privacy mode that best fits your organization's needs.
              Stricter modes limit data collection but may reduce analytics capabilities.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {POLICY_MODES.map((mode) => (
                <div
                  key={mode.id}
                  onClick={() => handleModeChange(mode.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    policy.mode === mode.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">{mode.name}</h3>
                    {policy.mode === mode.id && (
                      <span className="text-blue-600">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{mode.description}</p>
                </div>
              ))}
            </div>

            {/* Compliance Breakdown */}
            {compliance && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(compliance.breakdown).map(([category, score]) => (
                    <div key={category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 capitalize">{category.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-900">{score}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            score >= 90 ? 'bg-green-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'collection' && policy && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Collection Settings</h2>
            <p className="text-gray-600 mb-6">
              Control what types of data are collected and how long they are retained.
            </p>

            <div className="space-y-6">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Collect Metadata</h3>
                  <p className="text-sm text-gray-500">
                    Timestamps, participant counts, and non-content information
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.dataCollection.collectMetadata}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        dataCollection: {
                          ...policy.dataCollection,
                          collectMetadata: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Collect Content</h3>
                  <p className="text-sm text-gray-500">
                    Message bodies, document text, and communication content
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.dataCollection.collectContent}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        dataCollection: {
                          ...policy.dataCollection,
                          collectContent: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Collect Behavior Data</h3>
                  <p className="text-sm text-gray-500">
                    Usage patterns, feature interactions, and workflow data
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.dataCollection.collectBehavior}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        dataCollection: {
                          ...policy.dataCollection,
                          collectBehavior: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="py-3">
                <label className="block font-medium text-gray-900 mb-2">
                  Data Retention Period
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  How long data is retained before automatic deletion
                </p>
                <select
                  value={policy.dataCollection.retentionDays}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      dataCollection: {
                        ...policy.dataCollection,
                        retentionDays: parseInt(e.target.value),
                      },
                    })
                  }
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>1 year</option>
                  <option value={730}>2 years</option>
                  <option value={2555}>7 years (legal compliance)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'consent' && policy && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Consent Management</h2>
            <p className="text-gray-600 mb-6">
              Configure how user consent is collected, managed, and enforced.
            </p>

            <div className="space-y-6">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Require Explicit Consent</h3>
                  <p className="text-sm text-gray-500">
                    Users must actively opt-in before data collection
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.consent.requireExplicitConsent}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        consent: {
                          ...policy.consent,
                          requireExplicitConsent: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Allow Consent Withdrawal</h3>
                  <p className="text-sm text-gray-500">
                    Users can withdraw consent at any time (GDPR requirement)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.consent.allowWithdrawal}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        consent: {
                          ...policy.consent,
                          allowWithdrawal: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Granular Consent</h3>
                  <p className="text-sm text-gray-500">
                    Allow users to consent to specific data types individually
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.consent.granularConsent}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        consent: {
                          ...policy.consent,
                          granularConsent: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="py-3">
                <label className="block font-medium text-gray-900 mb-2">
                  Consent Expiry
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  How often consent must be renewed
                </p>
                <select
                  value={policy.consent.consentExpiry}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      consent: {
                        ...policy.consent,
                        consentExpiry: parseInt(e.target.value),
                      },
                    })
                  }
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                >
                  <option value={90}>Every 90 days</option>
                  <option value={180}>Every 180 days</option>
                  <option value={365}>Annually</option>
                  <option value={0}>Never (not recommended)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'anonymization' && policy && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Anonymization Settings</h2>
            <p className="text-gray-600 mb-6">
              Configure how personal data is anonymized and protected.
            </p>

            <div className="space-y-6">
              <div className="py-3">
                <label className="block font-medium text-gray-900 mb-2">
                  Default Anonymization Strategy
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  How PII is processed when anonymization is required
                </p>
                <select
                  value={policy.anonymization.defaultStrategy}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      anonymization: {
                        ...policy.anonymization,
                        defaultStrategy: e.target.value,
                      },
                    })
                  }
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                >
                  <option value="pseudonymize">Pseudonymize (reversible with key)</option>
                  <option value="hash">Hash (irreversible, consistent)</option>
                  <option value="mask">Mask (partial visibility)</option>
                  <option value="generalize">Generalize (reduce precision)</option>
                  <option value="remove">Remove (complete deletion)</option>
                </select>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Auto-Anonymize</h3>
                  <p className="text-sm text-gray-500">
                    Automatically anonymize detected PII in all content
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.anonymization.autoAnonymize}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        anonymization: {
                          ...policy.anonymization,
                          autoAnonymize: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">PII Detection</h3>
                  <p className="text-sm text-gray-500">
                    Enable automatic detection of personal identifiable information
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.anonymization.piiDetection}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        anonymization: {
                          ...policy.anonymization,
                          piiDetection: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 mb-2">Detected PII Types</h4>
                <div className="flex flex-wrap gap-2">
                  {['Email', 'Phone', 'Name', 'Address', 'SSN', 'IBAN', 'IP Address', 'Date of Birth'].map((type) => (
                    <span
                      key={type}
                      className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                    >
                      {type}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  German-specific identifiers (Steuer-ID, Sozialversicherungsnummer) are also supported
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reporting' && policy && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Reporting Settings</h2>
            <p className="text-gray-600 mb-6">
              Configure aggregation and reporting for works council compliance.
            </p>

            <div className="space-y-6">
              <div className="py-3">
                <label className="block font-medium text-gray-900 mb-2">
                  Minimum Group Size (k-anonymity)
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Minimum individuals required before showing group data
                </p>
                <select
                  value={policy.reporting.minGroupSize}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      reporting: {
                        ...policy.reporting,
                        minGroupSize: parseInt(e.target.value),
                      },
                    })
                  }
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                >
                  <option value={5}>5 (standard)</option>
                  <option value={10}>10 (enhanced)</option>
                  <option value={20}>20 (maximum)</option>
                </select>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Allow Individual Reports</h3>
                  <p className="text-sm text-gray-500">
                    Enable reports for individual employees (requires explicit consent)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.reporting.allowIndividualReports}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        reporting: {
                          ...policy.reporting,
                          allowIndividualReports: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h3 className="font-medium text-gray-900">Require Works Council Approval</h3>
                  <p className="text-sm text-gray-500">
                    All aggregated reports must be approved by works council (Betriebsrat)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.reporting.requireWorksCouncilApproval}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        reporting: {
                          ...policy.reporting,
                          requireWorksCouncilApproval: e.target.checked,
                        },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-800 mb-2">Pre-approved Report Templates</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    Department Workload Overview
                  </li>
                  <li className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    Organization Collaboration Patterns
                  </li>
                  <li className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    Meeting Statistics by Department
                  </li>
                  <li className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    Tool Adoption Overview
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="border-t px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {saving && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;
