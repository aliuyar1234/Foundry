/**
 * Slack Connection Wizard
 * Step-by-step guide for connecting Slack workspaces
 */

import React, { useState } from 'react';
import { Input } from '../../ui/input';
import { ConnectorWizard, WizardStep } from './ConnectorWizard';

interface SlackWizardProps {
  onComplete: (config: SlackConfig) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface SlackConfig {
  name: string;
  clientId: string;
  clientSecret: string;
  signingSecret?: string;
  syncMessages: boolean;
  lookbackMonths: number;
}

export function SlackWizard({
  onComplete,
  onCancel,
  isSubmitting,
}: SlackWizardProps) {
  const [config, setConfig] = useState<Partial<SlackConfig>>({
    syncMessages: true,
    lookbackMonths: 3,
  });

  const updateConfig = <K extends keyof SlackConfig>(
    key: K,
    value: SlackConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const steps: WizardStep[] = [
    {
      id: 'basics',
      title: 'Connection Name',
      description: 'Give your Slack connection a descriptive name',
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
              placeholder="e.g., Company Slack Workspace"
            />
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.name?.trim()),
    },
    {
      id: 'credentials',
      title: 'App Credentials',
      description:
        'Enter your Slack App credentials. Create an app at api.slack.com/apps.',
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
              placeholder="Your Slack app Client ID"
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
              placeholder="Your Slack app Client Secret"
            />
          </div>
          <div>
            <label htmlFor="signingSecret" className="block text-sm font-medium mb-1">
              Signing Secret (Optional)
            </label>
            <Input
              id="signingSecret"
              type="password"
              value={config.signingSecret || ''}
              onChange={(e) => updateConfig('signingSecret', e.target.value)}
              placeholder="Your Slack app Signing Secret"
            />
            <p className="text-xs text-gray-500 mt-1">
              Required for webhook verification
            </p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            <p className="font-medium text-blue-800 mb-1">Required Bot Scopes:</p>
            <ul className="text-blue-700 text-xs list-disc list-inside">
              <li>channels:read, channels:history</li>
              <li>groups:read, groups:history</li>
              <li>users:read, users:read.email</li>
              <li>team:read</li>
            </ul>
          </div>
        </div>
      ),
      isComplete: () =>
        Boolean(config.clientId?.trim() && config.clientSecret?.trim()),
    },
    {
      id: 'options',
      title: 'Sync Options',
      description: 'Configure what data to sync from Slack',
      content: (
        <div className="space-y-4">
          <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={config.syncMessages}
              onChange={(e) => updateConfig('syncMessages', e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Sync Messages</div>
              <div className="text-sm text-gray-500">
                Include channel messages in the sync. Disable for faster syncs that only include users and channels.
              </div>
            </div>
          </label>
          <div>
            <label htmlFor="lookbackMonths" className="block text-sm font-medium mb-1">
              Message History (Months)
            </label>
            <select
              id="lookbackMonths"
              value={config.lookbackMonths}
              onChange={(e) => updateConfig('lookbackMonths', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              How far back to sync messages on the initial sync
            </p>
          </div>
        </div>
      ),
      isComplete: () => true,
    },
  ];

  const handleComplete = () => {
    onComplete(config as SlackConfig);
  };

  return (
    <ConnectorWizard
      title="Connect Slack"
      description="Sync users, channels, and messages from Slack"
      icon={<span className="font-bold text-lg">S</span>}
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default SlackWizard;
