/**
 * M-Files Setup Wizard
 * T180: Multi-step setup wizard for M-Files DMS
 */

import React, { useState } from 'react';
import { Input } from '../ui/input';
import { ConnectorWizard, WizardStep } from '../data-sources/wizards/ConnectorWizard';
import { FolderOpen } from 'lucide-react';

interface MFilesSetupWizardProps {
  onComplete: (config: MFilesConfig) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface MFilesConfig {
  name: string;
  connectionType: 'cloud' | 'onpremise';
  serverUrl: string;
  username: string;
  password: string;
  authType: 'mfiles' | 'windows';
  selectedVaults: string[];
  syncInterval: number;
  syncMetadata: boolean;
  syncVersions: boolean;
}

interface Vault {
  id: string;
  name: string;
  guid: string;
  description?: string;
  objectCount?: number;
}

// Mock data for demonstration
const MOCK_VAULTS: Vault[] = [
  {
    id: 'vault1',
    name: 'Document Vault',
    guid: '{12345678-1234-1234-1234-123456789012}',
    description: 'Main document repository',
    objectCount: 5420,
  },
  {
    id: 'vault2',
    name: 'Engineering',
    guid: '{87654321-4321-4321-4321-210987654321}',
    description: 'Engineering documents and drawings',
    objectCount: 2100,
  },
  {
    id: 'vault3',
    name: 'HR & Personnel',
    guid: '{11111111-2222-3333-4444-555555555555}',
    description: 'Human resources documents',
    objectCount: 890,
  },
];

export function MFilesSetupWizard({
  onComplete,
  onCancel,
  isSubmitting,
}: MFilesSetupWizardProps) {
  const [config, setConfig] = useState<Partial<MFilesConfig>>({
    connectionType: 'cloud',
    authType: 'mfiles',
    selectedVaults: [],
    syncInterval: 60,
    syncMetadata: true,
    syncVersions: false,
  });

  const updateConfig = <K extends keyof MFilesConfig>(key: K, value: MFilesConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleVault = (vaultId: string) => {
    const current = config.selectedVaults || [];
    if (current.includes(vaultId)) {
      updateConfig(
        'selectedVaults',
        current.filter((id) => id !== vaultId)
      );
    } else {
      updateConfig('selectedVaults', [...current, vaultId]);
    }
  };

  const steps: WizardStep[] = [
    {
      id: 'connection',
      title: 'Connection Details',
      description: 'Configure your M-Files connection',
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
              placeholder="e.g., Production M-Files"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Connection Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="connectionType"
                  checked={config.connectionType === 'cloud'}
                  onChange={() => updateConfig('connectionType', 'cloud')}
                />
                <span>M-Files Cloud</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="connectionType"
                  checked={config.connectionType === 'onpremise'}
                  onChange={() => updateConfig('connectionType', 'onpremise')}
                />
                <span>On-Premise</span>
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="serverUrl" className="block text-sm font-medium mb-1">
              {config.connectionType === 'cloud' ? 'Cloud Server URL' : 'Server URL'}
            </label>
            <Input
              id="serverUrl"
              value={config.serverUrl || ''}
              onChange={(e) => updateConfig('serverUrl', e.target.value)}
              placeholder={
                config.connectionType === 'cloud'
                  ? 'https://yourcompany.m-files.com'
                  : 'https://mfiles.yourcompany.com'
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              {config.connectionType === 'cloud'
                ? 'Your M-Files Cloud server URL'
                : 'Your on-premise M-Files server URL'}
            </p>
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.name?.trim() && config.serverUrl?.trim()),
    },
    {
      id: 'authentication',
      title: 'Authentication',
      description: 'Enter your M-Files credentials',
      content: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Authentication Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="authType"
                  checked={config.authType === 'mfiles'}
                  onChange={() => updateConfig('authType', 'mfiles')}
                />
                <span>M-Files Authentication</span>
              </label>
              {config.connectionType === 'onpremise' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    checked={config.authType === 'windows'}
                    onChange={() => updateConfig('authType', 'windows')}
                  />
                  <span>Windows Authentication</span>
                </label>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">
              {config.authType === 'windows' ? 'Domain\\Username' : 'Username'}
            </label>
            <Input
              id="username"
              value={config.username || ''}
              onChange={(e) => updateConfig('username', e.target.value)}
              placeholder={
                config.authType === 'windows' ? 'DOMAIN\\username' : 'Your M-Files username'
              }
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={config.password || ''}
              onChange={(e) => updateConfig('password', e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-blue-800">
              <strong>Security Note:</strong> Your credentials are encrypted and stored securely.
              We recommend using a service account with appropriate vault permissions.
            </p>
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.username?.trim() && config.password?.trim()),
    },
    {
      id: 'vaults',
      title: 'Vault Selection',
      description: 'Select which M-Files vaults to sync',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Choose the vaults you want to include in your sync. Only objects from selected vaults
            will be analyzed.
          </p>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {MOCK_VAULTS.map((vault) => (
              <label
                key={vault.id}
                className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={config.selectedVaults?.includes(vault.id)}
                  onChange={() => toggleVault(vault.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{vault.name}</div>
                    {vault.objectCount !== undefined && (
                      <span className="text-sm text-gray-500">
                        {vault.objectCount.toLocaleString()} objects
                      </span>
                    )}
                  </div>
                  {vault.description && (
                    <div className="text-sm text-gray-500 mt-1">{vault.description}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1 font-mono">{vault.guid}</div>
                </div>
              </label>
            ))}
          </div>

          {config.selectedVaults && config.selectedVaults.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">
                {config.selectedVaults.length} vault(s) selected
              </p>
            </div>
          )}
        </div>
      ),
      isComplete: () => (config.selectedVaults?.length || 0) > 0,
    },
    {
      id: 'sync-config',
      title: 'Sync Configuration',
      description: 'Configure synchronization settings',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="syncInterval" className="block text-sm font-medium mb-1">
              Sync Interval (minutes)
            </label>
            <Input
              id="syncInterval"
              type="number"
              min={15}
              max={1440}
              value={config.syncInterval || 60}
              onChange={(e) => updateConfig('syncInterval', parseInt(e.target.value))}
            />
            <p className="text-xs text-gray-500 mt-1">
              How often to check for new or updated objects (minimum 15 minutes)
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={config.syncMetadata}
                onChange={(e) => updateConfig('syncMetadata', e.target.checked)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Sync Metadata</div>
                <div className="text-sm text-gray-500">
                  Include M-Files metadata and property values in sync
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={config.syncVersions}
                onChange={(e) => updateConfig('syncVersions', e.target.checked)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Sync Version History</div>
                <div className="text-sm text-gray-500">
                  Track and analyze document version history (increases storage requirements)
                </div>
              </div>
            </label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-blue-800">
              <strong>Performance Tip:</strong> Enabling version history provides deeper insights
              but requires more storage. Metadata sync is recommended for full context analysis.
            </p>
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.syncInterval && config.syncInterval >= 15),
    },
  ];

  const handleComplete = () => {
    onComplete(config as MFilesConfig);
  };

  return (
    <ConnectorWizard
      title="Connect M-Files"
      description="Sync documents and workflows from M-Files"
      icon={<FolderOpen className="w-6 h-6" />}
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default MFilesSetupWizard;
