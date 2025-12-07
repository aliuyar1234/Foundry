/**
 * BMD Connection Wizard
 * Step-by-step guide for connecting BMD NTCS accounting software
 */

import React, { useState } from 'react';
import { Input } from '../../ui/input';
import { ConnectorWizard, WizardStep } from './ConnectorWizard';

interface BmdWizardProps {
  onComplete: (config: BmdConfig) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface BmdConfig {
  name: string;
  apiUrl: string;
  apiKey: string;
  companyId: string;
  syncEntities: string[];
}

export function BmdWizard({
  onComplete,
  onCancel,
  isSubmitting,
}: BmdWizardProps) {
  const [config, setConfig] = useState<Partial<BmdConfig>>({
    syncEntities: ['documents', 'accounts', 'journal_entries', 'business_partners', 'cost_centers'],
  });

  const updateConfig = <K extends keyof BmdConfig>(
    key: K,
    value: BmdConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSyncEntity = (entity: string) => {
    const current = config.syncEntities || [];
    if (current.includes(entity)) {
      updateConfig(
        'syncEntities',
        current.filter((e) => e !== entity)
      );
    } else {
      updateConfig('syncEntities', [...current, entity]);
    }
  };

  const steps: WizardStep[] = [
    {
      id: 'basics',
      title: 'Connection Name',
      description: 'Give your BMD connection a descriptive name',
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
              placeholder="e.g., BMD NTCS Accounting"
            />
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.name?.trim()),
    },
    {
      id: 'server',
      title: 'Server Configuration',
      description: 'Enter your BMD server details',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="apiUrl" className="block text-sm font-medium mb-1">
              API URL
            </label>
            <Input
              id="apiUrl"
              value={config.apiUrl || ''}
              onChange={(e) => updateConfig('apiUrl', e.target.value)}
              placeholder="https://your-bmd-server.com/api"
            />
            <p className="text-xs text-gray-500 mt-1">
              The base URL of your BMD NTCS API server
            </p>
          </div>
          <div>
            <label htmlFor="companyId" className="block text-sm font-medium mb-1">
              Company ID (Mandant)
            </label>
            <Input
              id="companyId"
              value={config.companyId || ''}
              onChange={(e) => updateConfig('companyId', e.target.value)}
              placeholder="e.g., 001"
            />
            <p className="text-xs text-gray-500 mt-1">
              The BMD company/mandant identifier
            </p>
          </div>
        </div>
      ),
      isComplete: () =>
        Boolean(config.apiUrl?.trim() && config.companyId?.trim()),
    },
    {
      id: 'credentials',
      title: 'API Credentials',
      description: 'Enter your BMD API key',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium mb-1">
              API Key
            </label>
            <Input
              id="apiKey"
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => updateConfig('apiKey', e.target.value)}
              placeholder="Your BMD API Key"
            />
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            <p className="font-medium text-blue-800 mb-1">How to get your API Key:</p>
            <ol className="text-blue-700 text-xs list-decimal list-inside space-y-1">
              <li>Log in to BMD NTCS administration</li>
              <li>Navigate to System Settings → API Access</li>
              <li>Generate a new API key with required permissions</li>
              <li>Copy and paste the key here</li>
            </ol>
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.apiKey?.trim()),
    },
    {
      id: 'entities',
      title: 'Data to Sync',
      description: 'Select which BMD data you want to sync',
      content: (
        <div className="space-y-3">
          {[
            { id: 'documents', label: 'Documents', description: 'Invoices, credit notes, and receipts' },
            { id: 'accounts', label: 'Chart of Accounts', description: 'Account master data' },
            { id: 'journal_entries', label: 'Journal Entries', description: 'Booking records' },
            { id: 'business_partners', label: 'Business Partners', description: 'Customers and vendors' },
            { id: 'cost_centers', label: 'Cost Centers', description: 'Cost center structure' },
          ].map((entity) => (
            <label
              key={entity.id}
              className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={config.syncEntities?.includes(entity.id)}
                onChange={() => toggleSyncEntity(entity.id)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">{entity.label}</div>
                <div className="text-sm text-gray-500">{entity.description}</div>
              </div>
            </label>
          ))}
        </div>
      ),
      isComplete: () => (config.syncEntities?.length || 0) > 0,
    },
  ];

  const handleComplete = () => {
    onComplete(config as BmdConfig);
  };

  return (
    <ConnectorWizard
      title="Connect BMD NTCS"
      description="Sync accounting data from BMD NTCS"
      icon={<span className="font-bold text-lg">BMD</span>}
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default BmdWizard;
