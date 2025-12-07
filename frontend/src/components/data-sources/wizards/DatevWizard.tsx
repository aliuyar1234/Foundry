/**
 * DATEV Connection Wizard
 * Step-by-step guide for connecting DATEV accounting software
 */

import React, { useState } from 'react';
import { Input } from '../../ui/input';
import { ConnectorWizard, WizardStep } from './ConnectorWizard';

interface DatevWizardProps {
  onComplete: (config: DatevConfig) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface DatevConfig {
  name: string;
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  syncEntities: string[];
}

export function DatevWizard({
  onComplete,
  onCancel,
  isSubmitting,
}: DatevWizardProps) {
  const [config, setConfig] = useState<Partial<DatevConfig>>({
    environment: 'sandbox',
    syncEntities: ['documents', 'accounts', 'journal_entries', 'business_partners'],
  });

  const updateConfig = <K extends keyof DatevConfig>(
    key: K,
    value: DatevConfig[K]
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
      description: 'Give your DATEV connection a descriptive name',
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
              placeholder="e.g., DATEV Accounting"
            />
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.name?.trim()),
    },
    {
      id: 'environment',
      title: 'Environment',
      description: 'Select your DATEV environment',
      content: (
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="environment"
              checked={config.environment === 'sandbox'}
              onChange={() => updateConfig('environment', 'sandbox')}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Sandbox</div>
              <div className="text-sm text-gray-500">
                Test environment for development and validation
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="environment"
              checked={config.environment === 'production'}
              onChange={() => updateConfig('environment', 'production')}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Production</div>
              <div className="text-sm text-gray-500">
                Live production environment with real data
              </div>
            </div>
          </label>
        </div>
      ),
      isComplete: () => Boolean(config.environment),
    },
    {
      id: 'credentials',
      title: 'API Credentials',
      description: 'Enter your DATEV API credentials from the developer portal',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="clientId" className="block text-sm font-medium mb-1">
              Client ID
            </label>
            <Input
              id="clientId"
              value={config.clientId || ''}
              onChange={(e) => updateConfig('clientId', e.target.value)}
              placeholder="Your DATEV Client ID"
            />
          </div>
          <div>
            <label htmlFor="clientSecret" className="block text-sm font-medium mb-1">
              Client Secret
            </label>
            <Input
              id="clientSecret"
              type="password"
              value={config.clientSecret || ''}
              onChange={(e) => updateConfig('clientSecret', e.target.value)}
              placeholder="Your DATEV Client Secret"
            />
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg text-sm">
            <p className="font-medium text-yellow-800 mb-1">Important:</p>
            <p className="text-yellow-700 text-xs">
              Make sure your DATEV app has the following scopes enabled:
              accounting:read, documents:read, masterdata:read
            </p>
          </div>
        </div>
      ),
      isComplete: () =>
        Boolean(config.clientId?.trim() && config.clientSecret?.trim()),
    },
    {
      id: 'entities',
      title: 'Data to Sync',
      description: 'Select which DATEV data you want to sync',
      content: (
        <div className="space-y-3">
          {[
            { id: 'documents', label: 'Documents', description: 'Invoices, credit notes, and receipts' },
            { id: 'accounts', label: 'Chart of Accounts', description: 'Account master data' },
            { id: 'journal_entries', label: 'Journal Entries', description: 'Booking records' },
            { id: 'business_partners', label: 'Business Partners', description: 'Customers and vendors' },
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
    onComplete(config as DatevConfig);
  };

  return (
    <ConnectorWizard
      title="Connect DATEV"
      description="Sync accounting data from DATEV"
      icon={<span className="font-bold text-lg">DV</span>}
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default DatevWizard;
