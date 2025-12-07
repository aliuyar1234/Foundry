/**
 * HubSpot Connection Wizard
 * Step-by-step guide for connecting HubSpot CRM
 */

import React, { useState } from 'react';
import { Input } from '../../ui/input';
import { ConnectorWizard, WizardStep } from './ConnectorWizard';

interface HubSpotWizardProps {
  onComplete: (config: HubSpotConfig) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface HubSpotConfig {
  name: string;
  clientId: string;
  clientSecret: string;
  syncObjects: string[];
}

export function HubSpotWizard({
  onComplete,
  onCancel,
  isSubmitting,
}: HubSpotWizardProps) {
  const [config, setConfig] = useState<Partial<HubSpotConfig>>({
    syncObjects: ['companies', 'contacts', 'deals', 'tickets'],
  });

  const updateConfig = <K extends keyof HubSpotConfig>(
    key: K,
    value: HubSpotConfig[K]
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
      description: 'Give your HubSpot connection a descriptive name',
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
              placeholder="e.g., Production HubSpot"
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
        'Enter your HubSpot App credentials. Create a private app in HubSpot Developer settings.',
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
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <p className="text-xs text-gray-500 mt-1">
              Found in your HubSpot private app settings
            </p>
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
              placeholder="Your client secret"
            />
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            <p className="font-medium text-blue-800 mb-1">Required Scopes:</p>
            <ul className="text-blue-700 text-xs list-disc list-inside">
              <li>crm.objects.companies.read</li>
              <li>crm.objects.contacts.read</li>
              <li>crm.objects.deals.read</li>
              <li>tickets</li>
            </ul>
          </div>
        </div>
      ),
      isComplete: () =>
        Boolean(config.clientId?.trim() && config.clientSecret?.trim()),
    },
    {
      id: 'objects',
      title: 'Data to Sync',
      description: 'Select which HubSpot objects you want to sync',
      content: (
        <div className="space-y-3">
          {[
            { id: 'companies', label: 'Companies', description: 'Organizations and businesses' },
            { id: 'contacts', label: 'Contacts', description: 'Individual people and leads' },
            { id: 'deals', label: 'Deals', description: 'Sales opportunities and pipelines' },
            { id: 'tickets', label: 'Tickets', description: 'Support tickets and requests' },
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
    onComplete(config as HubSpotConfig);
  };

  return (
    <ConnectorWizard
      title="Connect HubSpot"
      description="Sync your CRM data from HubSpot"
      icon={<span className="font-bold text-lg">HS</span>}
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default HubSpotWizard;
