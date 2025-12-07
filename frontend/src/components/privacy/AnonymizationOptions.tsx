/**
 * Anonymization Options Panel
 * Configure and test anonymization strategies
 * T305 - Anonymization options panel
 */

import React, { useState } from 'react';

type AnonymizationStrategy = 'hash' | 'mask' | 'remove' | 'generalize' | 'pseudonymize';
type PiiType = 'email' | 'phone' | 'name' | 'address' | 'ssn' | 'credit_card' | 'ip_address' | 'date_of_birth' | 'bank_account';

interface AnonymizationConfig {
  enabled: boolean;
  strategies: Record<PiiType, AnonymizationStrategy>;
  preserveFormat: boolean;
  salt?: string;
  pseudonymMapping: boolean;
  includeGerman: boolean;
}

interface PiiDetection {
  field: string;
  value: string;
  type: PiiType;
  confidence: number;
  position?: { start: number; end: number };
}

interface AnonymizationResult {
  original: string;
  anonymized: string;
  anonymizedCount: number;
}

const PII_TYPES: { id: PiiType; name: string; example: string }[] = [
  { id: 'email', name: 'Email Address', example: 'john.doe@example.com' },
  { id: 'phone', name: 'Phone Number', example: '+49 171 1234567' },
  { id: 'name', name: 'Person Name', example: 'John Doe' },
  { id: 'address', name: 'Street Address', example: '123 Main Street' },
  { id: 'ssn', name: 'Social Security Number', example: '123-45-6789' },
  { id: 'credit_card', name: 'Credit Card', example: '4111-1111-1111-1111' },
  { id: 'ip_address', name: 'IP Address', example: '192.168.1.1' },
  { id: 'date_of_birth', name: 'Date of Birth', example: '15.03.1985' },
  { id: 'bank_account', name: 'Bank Account (IBAN)', example: 'DE89370400440532013000' },
];

const STRATEGIES: { id: AnonymizationStrategy; name: string; description: string; reversible: boolean }[] = [
  {
    id: 'pseudonymize',
    name: 'Pseudonymize',
    description: 'Replace with consistent fake values (reversible with key)',
    reversible: true,
  },
  {
    id: 'hash',
    name: 'Hash',
    description: 'One-way cryptographic hash (irreversible)',
    reversible: false,
  },
  {
    id: 'mask',
    name: 'Mask',
    description: 'Partially hide with asterisks (preserves format)',
    reversible: false,
  },
  {
    id: 'generalize',
    name: 'Generalize',
    description: 'Reduce precision (e.g., year only for dates)',
    reversible: false,
  },
  {
    id: 'remove',
    name: 'Remove',
    description: 'Completely remove the value',
    reversible: false,
  },
];

interface AnonymizationOptionsProps {
  organizationId: string;
}

export const AnonymizationOptions: React.FC<AnonymizationOptionsProps> = ({ organizationId }) => {
  const [config, setConfig] = useState<AnonymizationConfig>({
    enabled: true,
    strategies: {
      email: 'pseudonymize',
      phone: 'mask',
      name: 'pseudonymize',
      address: 'generalize',
      ssn: 'remove',
      credit_card: 'remove',
      ip_address: 'hash',
      date_of_birth: 'generalize',
      bank_account: 'mask',
    },
    preserveFormat: true,
    pseudonymMapping: true,
    includeGerman: true,
  });

  const [testInput, setTestInput] = useState(
    'Dear John Doe,\n\nPlease find the invoice for your order. Your order was shipped to 123 Main Street.\n\nContact us at support@example.com or +49 171 1234567.\n\nYour card ending in 4111-1111-1111-1111 was charged.\n\nBest regards,\nCompany Name'
  );
  const [testResult, setTestResult] = useState<AnonymizationResult | null>(null);
  const [detectedPii, setDetectedPii] = useState<PiiDetection[]>([]);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'test' | 'preview'>('config');

  const handleStrategyChange = (piiType: PiiType, strategy: AnonymizationStrategy) => {
    setConfig({
      ...config,
      strategies: {
        ...config.strategies,
        [piiType]: strategy,
      },
    });
  };

  const handleDetectPii = async () => {
    setProcessing(true);
    try {
      // In production: call API
      // const response = await fetch(`/api/v1/organizations/${organizationId}/privacy/detect-pii/text`, {
      //   method: 'POST',
      //   body: JSON.stringify({ text: testInput, includeGerman: config.includeGerman })
      // });

      // Mock detection
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockDetections: PiiDetection[] = [
        { field: 'content', value: 'John Doe', type: 'name', confidence: 0.85, position: { start: 5, end: 13 } },
        { field: 'content', value: '123 Main Street', type: 'address', confidence: 0.9, position: { start: 89, end: 104 } },
        { field: 'content', value: 'support@example.com', type: 'email', confidence: 0.95, position: { start: 121, end: 140 } },
        { field: 'content', value: '+49 171 1234567', type: 'phone', confidence: 0.88, position: { start: 144, end: 159 } },
        { field: 'content', value: '4111-1111-1111-1111', type: 'credit_card', confidence: 0.95, position: { start: 186, end: 205 } },
      ];

      setDetectedPii(mockDetections);
    } catch (error) {
      console.error('Failed to detect PII:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleAnonymize = async () => {
    setProcessing(true);
    try {
      // In production: call API
      // const response = await fetch(`/api/v1/organizations/${organizationId}/privacy/anonymize/text`, {
      //   method: 'POST',
      //   body: JSON.stringify({ text: testInput, config, includeGerman: config.includeGerman })
      // });

      // Mock anonymization
      await new Promise(resolve => setTimeout(resolve, 500));

      const anonymized = testInput
        .replace(/John Doe/g, 'Person_abc123')
        .replace(/123 Main Street/g, '[LOCATION: Street]')
        .replace(/support@example\.com/g, 'user_def456@example.com')
        .replace(/\+49 171 1234567/g, '+49 171 ***4567')
        .replace(/4111-1111-1111-1111/g, '[REMOVED]');

      setTestResult({
        original: testInput,
        anonymized,
        anonymizedCount: 5,
      });
      setActiveTab('preview');
    } catch (error) {
      console.error('Failed to anonymize:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      // In production: save to API
      alert('Configuration saved successfully');
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Anonymization Configuration</h2>
            <p className="text-gray-600 mt-1">
              Configure how personal data is anonymized across the platform
            </p>
          </div>
          <label className="flex items-center">
            <span className="mr-3 text-sm font-medium text-gray-700">
              {config.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <div className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </div>
          </label>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex">
            {[
              { id: 'config', name: 'Strategy Configuration' },
              { id: 'test', name: 'Test Anonymization' },
              { id: 'preview', name: 'Preview Result' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Strategy Configuration Tab */}
          {activeTab === 'config' && (
            <div className="space-y-6">
              {/* Global Settings */}
              <div className="space-y-4 pb-6 border-b">
                <h3 className="text-sm font-medium text-gray-900">Global Settings</h3>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.preserveFormat}
                    onChange={(e) => setConfig({ ...config, preserveFormat: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Preserve format (maintain structure when masking)
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.pseudonymMapping}
                    onChange={(e) => setConfig({ ...config, pseudonymMapping: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Enable pseudonym mapping (allow authorized reversal)
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.includeGerman}
                    onChange={(e) => setConfig({ ...config, includeGerman: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Include German-specific PII patterns (Steuer-ID, IBAN, etc.)
                  </span>
                </label>
              </div>

              {/* Per-Type Strategies */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-4">
                  Anonymization Strategy per Data Type
                </h3>

                <div className="space-y-4">
                  {PII_TYPES.map((piiType) => (
                    <div
                      key={piiType.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{piiType.name}</div>
                        <div className="text-sm text-gray-500">
                          Example: <code className="bg-gray-100 px-1 rounded">{piiType.example}</code>
                        </div>
                      </div>
                      <select
                        value={config.strategies[piiType.id]}
                        onChange={(e) =>
                          handleStrategyChange(piiType.id, e.target.value as AnonymizationStrategy)
                        }
                        className="w-40 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        {STRATEGIES.map((strategy) => (
                          <option key={strategy.id} value={strategy.id}>
                            {strategy.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strategy Legend */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Strategy Reference</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {STRATEGIES.map((strategy) => (
                    <div key={strategy.id} className="flex items-start space-x-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          strategy.reversible ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {strategy.name}
                      </span>
                      <span className="text-sm text-gray-600">{strategy.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveConfig}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          )}

          {/* Test Tab */}
          {activeTab === 'test' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test Text
                </label>
                <textarea
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  rows={8}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter text containing personal information to test anonymization..."
                />
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={handleDetectPii}
                  disabled={processing || !testInput}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                >
                  {processing ? 'Detecting...' : 'Detect PII'}
                </button>
                <button
                  onClick={handleAnonymize}
                  disabled={processing || !testInput}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Anonymize'}
                </button>
              </div>

              {/* Detection Results */}
              {detectedPii.length > 0 && (
                <div className="bg-white border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">
                    Detected PII ({detectedPii.length} items)
                  </h3>
                  <div className="space-y-2">
                    {detectedPii.map((detection, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                            {detection.type}
                          </span>
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                            {detection.value}
                          </code>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className={`text-sm ${getConfidenceColor(detection.confidence)}`}>
                            {(detection.confidence * 100).toFixed(0)}% confidence
                          </span>
                          <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded">
                            {config.strategies[detection.type]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && testResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Original</h3>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 h-64 overflow-auto">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                      {testResult.original}
                    </pre>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Anonymized</h3>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 h-64 overflow-auto">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                      {testResult.anonymized}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-700">
                    {testResult.anonymizedCount} PII items were anonymized
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(testResult.anonymized);
                      alert('Copied to clipboard!');
                    }}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Copy Result
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preview' && !testResult && (
            <div className="text-center py-12 text-gray-500">
              <p>No preview available. Run anonymization first.</p>
              <button
                onClick={() => setActiveTab('test')}
                className="mt-4 text-blue-600 hover:text-blue-800"
              >
                Go to Test tab
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Example Outputs */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Strategy Examples</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Input
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Hash
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Mask
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Pseudonymize
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Generalize
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-3 text-sm">john@example.com</td>
                <td className="px-4 py-3 text-sm font-mono">a8f5f167f44f</td>
                <td className="px-4 py-3 text-sm">j***@e***.com</td>
                <td className="px-4 py-3 text-sm">user_abc123@example.com</td>
                <td className="px-4 py-3 text-sm">[EMAIL]</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-sm">+49 171 1234567</td>
                <td className="px-4 py-3 text-sm font-mono">b3f7c891d234</td>
                <td className="px-4 py-3 text-sm">+49 171 ***4567</td>
                <td className="px-4 py-3 text-sm">+1-555-abc-defg</td>
                <td className="px-4 py-3 text-sm">[PHONE]</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-sm">15.03.1985</td>
                <td className="px-4 py-3 text-sm font-mono">c4e8f902a345</td>
                <td className="px-4 py-3 text-sm">**.**.1985</td>
                <td className="px-4 py-3 text-sm">date_xyz789</td>
                <td className="px-4 py-3 text-sm">[YEAR: 1985]</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnonymizationOptions;
