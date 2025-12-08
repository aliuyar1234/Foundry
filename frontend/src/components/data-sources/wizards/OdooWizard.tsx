/**
 * Odoo ERP Connection Wizard
 * Task: T053-T056
 *
 * Step-by-step guide for connecting Odoo ERP instances
 * Supports both cloud and self-hosted deployments
 */

import React, { useState } from 'react';
import { Input } from '../../ui/input';
import { ConnectorWizard, WizardStep } from './ConnectorWizard';

interface OdooWizardProps {
  onComplete: (config: OdooConfig) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  onTestConnection?: (config: Partial<OdooConfig>) => Promise<{
    success: boolean;
    version?: string;
    modules?: string[];
    error?: string;
  }>;
}

export interface OdooConfig {
  name: string;
  url: string;
  database: string;
  username: string;
  apiKey: string;
  deploymentType: 'cloud' | 'self-hosted';
  useJsonRpc: boolean;
  syncModules: string[];
  useProxy?: boolean;
  proxyUrl?: string;
}

export function OdooWizard({
  onComplete,
  onCancel,
  isSubmitting,
  onTestConnection,
}: OdooWizardProps) {
  const [config, setConfig] = useState<Partial<OdooConfig>>({
    deploymentType: 'cloud',
    useJsonRpc: true,
    syncModules: ['sale', 'purchase', 'stock', 'account', 'contacts'],
    useProxy: false,
  });

  const [connectionTest, setConnectionTest] = useState<{
    tested: boolean;
    success: boolean;
    version?: string;
    modules: string[];
    error?: string;
  }>({
    tested: false,
    success: false,
    modules: [],
  });

  const [isTesting, setIsTesting] = useState(false);

  const updateConfig = <K extends keyof OdooConfig>(
    key: K,
    value: OdooConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    if (['url', 'database', 'username', 'apiKey'].includes(key as string)) {
      setConnectionTest({ tested: false, success: false, modules: [] });
    }
  };

  const toggleSyncModule = (module: string) => {
    const current = config.syncModules || [];
    if (current.includes(module)) {
      updateConfig(
        'syncModules',
        current.filter((m) => m !== module)
      );
    } else {
      updateConfig('syncModules', [...current, module]);
    }
  };

  const handleTestConnection = async () => {
    if (!onTestConnection) return;

    setIsTesting(true);
    try {
      const result = await onTestConnection(config);
      setConnectionTest({
        tested: true,
        success: result.success,
        version: result.version,
        modules: result.modules || [],
        error: result.error,
      });
    } catch (error) {
      setConnectionTest({
        tested: true,
        success: false,
        modules: [],
        error: error instanceof Error ? error.message : 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const steps: WizardStep[] = [
    {
      id: 'basics',
      title: 'Connection Name',
      description: 'Give your Odoo connection a descriptive name',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Connection Name
            </label>
            <Input
              id="name"
              value={config.name || ''}
              onChange={(e) => updateConfig('name', e.target.value)}
              placeholder="e.g., Odoo Production"
            />
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.name?.trim()),
    },
    {
      id: 'deployment',
      title: 'Deployment Type',
      description: 'Select how your Odoo instance is deployed',
      content: (
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="deploymentType"
              checked={config.deploymentType === 'cloud'}
              onChange={() => updateConfig('deploymentType', 'cloud')}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Odoo Cloud (odoo.com)</div>
              <div className="text-sm text-gray-500">
                Odoo's hosted cloud platform (Odoo.sh, Odoo Online)
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="deploymentType"
              checked={config.deploymentType === 'self-hosted'}
              onChange={() => updateConfig('deploymentType', 'self-hosted')}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Self-Hosted</div>
              <div className="text-sm text-gray-500">
                On-premise or your own cloud infrastructure
              </div>
            </div>
          </label>
          {config.deploymentType === 'self-hosted' && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.useProxy}
                  onChange={(e) => updateConfig('useProxy', e.target.checked)}
                />
                <span className="text-sm">Connect through proxy (for firewalled instances)</span>
              </label>
              {config.useProxy && (
                <div>
                  <label htmlFor="proxyUrl" className="block text-sm font-medium mb-1">
                    Proxy URL
                  </label>
                  <Input
                    id="proxyUrl"
                    value={config.proxyUrl || ''}
                    onChange={(e) => updateConfig('proxyUrl', e.target.value)}
                    placeholder="https://proxy.yourcompany.com"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ),
      isComplete: () => Boolean(config.deploymentType),
    },
    {
      id: 'server',
      title: 'Server URL',
      description: 'Enter your Odoo instance URL',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="url" className="block text-sm font-medium mb-1">
              Odoo URL
            </label>
            <Input
              id="url"
              value={config.url || ''}
              onChange={(e) => updateConfig('url', e.target.value)}
              placeholder={
                config.deploymentType === 'cloud'
                  ? 'https://yourcompany.odoo.com'
                  : 'https://odoo.yourcompany.com'
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              {config.deploymentType === 'cloud'
                ? 'Your Odoo cloud URL, e.g., https://yourcompany.odoo.com'
                : 'Your self-hosted Odoo URL including protocol and port if needed'
              }
            </p>
          </div>
          <div>
            <label htmlFor="database" className="block text-sm font-medium mb-1">
              Database Name
            </label>
            <Input
              id="database"
              value={config.database || ''}
              onChange={(e) => updateConfig('database', e.target.value)}
              placeholder="e.g., production_db"
            />
            <p className="text-xs text-gray-500 mt-1">
              The PostgreSQL database name for your Odoo instance
            </p>
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.url?.trim() && config.database?.trim()),
    },
    {
      id: 'credentials',
      title: 'Authentication',
      description: 'Enter your Odoo API credentials',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">
              Username / Email
            </label>
            <Input
              id="username"
              value={config.username || ''}
              onChange={(e) => updateConfig('username', e.target.value)}
              placeholder="admin@yourcompany.com"
            />
          </div>
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium mb-1">
              API Key
            </label>
            <Input
              id="apiKey"
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => updateConfig('apiKey', e.target.value)}
              placeholder="Your Odoo API key"
            />
            <p className="text-xs text-gray-500 mt-1">
              Generate an API key in Odoo: Settings → Users → API Keys
            </p>
          </div>
          {onTestConnection && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !config.url || !config.database || !config.username || !config.apiKey}
                className="px-4 py-2 text-sm font-medium rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              {connectionTest.tested && (
                <div className={`mt-2 p-3 rounded-lg text-sm ${
                  connectionTest.success
                    ? 'bg-green-50 text-green-800'
                    : 'bg-red-50 text-red-800'
                }`}>
                  {connectionTest.success
                    ? `✓ Connection successful! Odoo version: ${connectionTest.version || 'unknown'}, ${connectionTest.modules.length} modules detected.`
                    : `✗ Connection failed: ${connectionTest.error}`
                  }
                </div>
              )}
            </div>
          )}
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            <p className="font-medium text-blue-800 mb-1">Creating an API Key:</p>
            <ol className="text-blue-700 text-xs space-y-1 list-decimal ml-4">
              <li>Log into Odoo as administrator</li>
              <li>Go to Settings → Users & Companies → Users</li>
              <li>Select your user and click &quot;API Keys&quot; tab</li>
              <li>Click &quot;New API Key&quot; and copy the generated key</li>
            </ol>
          </div>
        </div>
      ),
      isComplete: () =>
        Boolean(config.username?.trim() && config.apiKey?.trim()),
    },
    {
      id: 'modules',
      title: 'Modules to Sync',
      description: 'Select which Odoo modules you want to sync',
      content: (
        <div className="space-y-3">
          {[
            { id: 'sale', label: 'Sales', description: 'Quotations, sales orders, and customers' },
            { id: 'purchase', label: 'Purchase', description: 'RFQs, purchase orders, and vendors' },
            { id: 'stock', label: 'Inventory', description: 'Products, stock moves, and warehouses' },
            { id: 'account', label: 'Accounting', description: 'Invoices, payments, and journal entries' },
            { id: 'contacts', label: 'Contacts', description: 'Partners, contacts, and addresses' },
            { id: 'crm', label: 'CRM', description: 'Leads, opportunities, and activities' },
            { id: 'project', label: 'Project', description: 'Projects, tasks, and timesheets' },
            { id: 'hr', label: 'HR', description: 'Employees and departments' },
          ].map((module) => (
            <label
              key={module.id}
              className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                connectionTest.tested && !connectionTest.modules.includes(module.id)
                  ? 'opacity-50'
                  : ''
              }`}
            >
              <input
                type="checkbox"
                checked={config.syncModules?.includes(module.id)}
                onChange={() => toggleSyncModule(module.id)}
                disabled={connectionTest.tested && !connectionTest.modules.includes(module.id)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">{module.label}</div>
                <div className="text-sm text-gray-500">{module.description}</div>
                {connectionTest.tested && !connectionTest.modules.includes(module.id) && (
                  <div className="text-xs text-orange-600 mt-1">
                    Module not installed in your Odoo instance
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      ),
      isComplete: () => (config.syncModules?.length || 0) > 0,
    },
    {
      id: 'options',
      title: 'Sync Options',
      description: 'Configure synchronization behavior',
      content: (
        <div className="space-y-4">
          <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={config.useJsonRpc !== false}
              onChange={(e) => updateConfig('useJsonRpc', e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Use JSON-RPC API</div>
              <div className="text-sm text-gray-500">
                Recommended for Odoo 14+. Disable for older versions using XML-RPC.
              </div>
            </div>
          </label>
          <div className="p-3 bg-green-50 rounded-lg text-sm">
            <p className="font-medium text-green-800 mb-1">Ready to Connect!</p>
            <p className="text-green-700 text-xs">
              Click &quot;Connect&quot; to establish the connection and start syncing data from Odoo.
            </p>
          </div>
        </div>
      ),
      isComplete: () => true,
    },
  ];

  const handleComplete = () => {
    onComplete(config as OdooConfig);
  };

  return (
    <ConnectorWizard
      title="Connect Odoo"
      description="Sync ERP data from Odoo"
      icon={
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
        </svg>
      }
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default OdooWizard;
