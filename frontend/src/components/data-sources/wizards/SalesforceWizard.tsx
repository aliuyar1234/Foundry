/**
 * Salesforce Connection Wizard
 * Step-by-step guide for connecting Salesforce CRM
 */

import React, { useState } from 'react';
import { Input } from '../../ui/input';
import { ConnectorWizard, WizardStep } from './ConnectorWizard';

interface SalesforceWizardProps {
  onComplete: (config: SalesforceConfig) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface SalesforceConfig {
  name: string;
  clientId: string;
  clientSecret: string;
  instanceUrl?: string;
  syncObjects: string[];
}

export function SalesforceWizard({
  onComplete,
  onCancel,
  isSubmitting,
}: SalesforceWizardProps) {
  const [config, setConfig] = useState<Partial<SalesforceConfig>>({
    syncObjects: ['accounts', 'contacts', 'opportunities', 'leads', 'cases'],
  });

  const updateConfig = <K extends keyof SalesforceConfig>(
    key: K,
    value: SalesforceConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSyncObject = (obj: string) => {
    const current = config.syncObjects || [];
    if (current.includes(obj)) {
      updateConfig(
        'syncObjects',
        current.filter((o) => o !== obj)
      );
    } else {
      updateConfig('syncObjects', [...current, obj]);
    }
  };

  const steps: WizardStep[] = [
    {
      id: 'basics',
      title: 'Connection Name',
      description: 'Give your Salesforce connection a descriptive name',
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
              placeholder="e.g., Production Salesforce"
            />
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.name?.trim()),
    },
    {
      id: 'credentials',
      title: 'OAuth Credentials',
      description:
        'Enter your Salesforce Connected App credentials. You can find these in Salesforce Setup under App Manager.',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="clientId" className="block text-sm font-medium mb-1">
              Consumer Key (Client ID)
            </label>
            <Input
              id="clientId"
              value={config.clientId || ''}
              onChange={(e) => updateConfig('clientId', e.target.value)}
              placeholder="3MVG9..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Found in your Connected App settings
            </p>
          </div>
          <div>
            <label htmlFor="clientSecret" className="block text-sm font-medium mb-1">
              Consumer Secret (Client Secret)
            </label>
            <Input
              id="clientSecret"
              type="password"
              value={config.clientSecret || ''}
              onChange={(e) => updateConfig('clientSecret', e.target.value)}
              placeholder="Your consumer secret"
            />
          </div>
          <div>
            <label htmlFor="instanceUrl" className="block text-sm font-medium mb-1">
              Instance URL (Optional)
            </label>
            <Input
              id="instanceUrl"
              value={config.instanceUrl || ''}
              onChange={(e) => updateConfig('instanceUrl', e.target.value)}
              placeholder="https://yourcompany.salesforce.com"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank for production. Use sandbox URL for testing.
            </p>
          </div>
        </div>
      ),
      isComplete: () =>
        Boolean(config.clientId?.trim() && config.clientSecret?.trim()),
    },
    {
      id: 'objects',
      title: 'Data to Sync',
      description: 'Select which Salesforce objects you want to sync',
      content: (
        <div className="space-y-3">
          {[
            { id: 'accounts', label: 'Accounts', description: 'Companies and organizations' },
            { id: 'contacts', label: 'Contacts', description: 'Individual people' },
            { id: 'opportunities', label: 'Opportunities', description: 'Sales deals and pipelines' },
            { id: 'leads', label: 'Leads', description: 'Potential customers' },
            { id: 'cases', label: 'Cases', description: 'Support tickets and issues' },
          ].map((obj) => (
            <label
              key={obj.id}
              className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={config.syncObjects?.includes(obj.id)}
                onChange={() => toggleSyncObject(obj.id)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">{obj.label}</div>
                <div className="text-sm text-gray-500">{obj.description}</div>
              </div>
            </label>
          ))}
        </div>
      ),
      isComplete: () => (config.syncObjects?.length || 0) > 0,
    },
  ];

  const handleComplete = () => {
    onComplete(config as SalesforceConfig);
  };

  return (
    <ConnectorWizard
      title="Connect Salesforce"
      description="Sync your CRM data from Salesforce"
      icon={<span className="font-bold text-lg">SF</span>}
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default SalesforceWizard;
