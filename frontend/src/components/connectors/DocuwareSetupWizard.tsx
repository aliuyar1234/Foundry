/**
 * DocuWare Setup Wizard
 * T179: Multi-step setup wizard for DocuWare DMS
 */

import React, { useState } from 'react';
import { Input } from '../ui/input';
import { ConnectorWizard, WizardStep } from '../data-sources/wizards/ConnectorWizard';
import { FileText } from 'lucide-react';
import { DMSFolderSelector } from './DMSFolderSelector';

interface DocuwareSetupWizardProps {
  onComplete: (config: DocuwareConfig) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface DocuwareConfig {
  name: string;
  connectionType: 'cloud' | 'onpremise';
  url: string;
  username: string;
  password: string;
  organization?: string;
  selectedCabinets: string[];
  syncInterval: number;
  enableWorkflows: boolean;
}

interface Cabinet {
  id: string;
  name: string;
  description?: string;
  documentCount?: number;
}

// Mock data for demonstration
const MOCK_CABINETS: Cabinet[] = [
  { id: 'cab1', name: 'Invoices', description: 'Invoice documents', documentCount: 1250 },
  { id: 'cab2', name: 'Contracts', description: 'Legal contracts', documentCount: 450 },
  { id: 'cab3', name: 'HR Documents', description: 'Human resources files', documentCount: 890 },
  { id: 'cab4', name: 'Project Files', description: 'Project documentation', documentCount: 2100 },
];

export function DocuwareSetupWizard({
  onComplete,
  onCancel,
  isSubmitting,
}: DocuwareSetupWizardProps) {
  const [config, setConfig] = useState<Partial<DocuwareConfig>>({
    connectionType: 'cloud',
    selectedCabinets: [],
    syncInterval: 60,
    enableWorkflows: true,
  });

  const updateConfig = <K extends keyof DocuwareConfig>(
    key: K,
    value: DocuwareConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleCabinet = (cabinetId: string) => {
    const current = config.selectedCabinets || [];
    if (current.includes(cabinetId)) {
      updateConfig(
        'selectedCabinets',
        current.filter((id) => id !== cabinetId)
      );
    } else {
      updateConfig('selectedCabinets', [...current, cabinetId]);
    }
  };

  const steps: WizardStep[] = [
    {
      id: 'connection',
      title: 'Connection Details',
      description: 'Configure your DocuWare connection',
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
              placeholder="e.g., Production DocuWare"
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
                <span>DocuWare Cloud</span>
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
            <label htmlFor="url" className="block text-sm font-medium mb-1">
              {config.connectionType === 'cloud' ? 'Organization URL' : 'Server URL'}
            </label>
            <Input
              id="url"
              value={config.url || ''}
              onChange={(e) => updateConfig('url', e.target.value)}
              placeholder={
                config.connectionType === 'cloud'
                  ? 'https://yourcompany.docuware.cloud'
                  : 'https://docuware.yourcompany.com'
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              {config.connectionType === 'cloud'
                ? 'Your DocuWare Cloud organization URL'
                : 'Your on-premise DocuWare server URL'}
            </p>
          </div>

          {config.connectionType === 'cloud' && (
            <div>
              <label htmlFor="organization" className="block text-sm font-medium mb-1">
                Organization Name
              </label>
              <Input
                id="organization"
                value={config.organization || ''}
                onChange={(e) => updateConfig('organization', e.target.value)}
                placeholder="Your organization name"
              />
            </div>
          )}
        </div>
      ),
      isComplete: () =>
        Boolean(
          config.name?.trim() &&
            config.url?.trim() &&
            (config.connectionType === 'onpremise' || config.organization?.trim())
        ),
    },
    {
      id: 'authentication',
      title: 'Authentication',
      description: 'Enter your DocuWare credentials',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">
              Username
            </label>
            <Input
              id="username"
              value={config.username || ''}
              onChange={(e) => updateConfig('username', e.target.value)}
              placeholder="Your DocuWare username"
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
              placeholder="Your DocuWare password"
              autoComplete="current-password"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-blue-800">
              <strong>Security Note:</strong> Your credentials are encrypted and stored securely.
              We recommend using a service account with read-only access.
            </p>
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.username?.trim() && config.password?.trim()),
    },
    {
      id: 'cabinets',
      title: 'Cabinet Selection',
      description: 'Select which document cabinets to sync',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Choose the document cabinets you want to include in your sync. Only documents from
            selected cabinets will be analyzed.
          </p>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {MOCK_CABINETS.map((cabinet) => (
              <label
                key={cabinet.id}
                className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={config.selectedCabinets?.includes(cabinet.id)}
                  onChange={() => toggleCabinet(cabinet.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{cabinet.name}</div>
                    {cabinet.documentCount !== undefined && (
                      <span className="text-sm text-gray-500">
                        {cabinet.documentCount.toLocaleString()} documents
                      </span>
                    )}
                  </div>
                  {cabinet.description && (
                    <div className="text-sm text-gray-500 mt-1">{cabinet.description}</div>
                  )}
                </div>
              </label>
            ))}
          </div>

          {config.selectedCabinets && config.selectedCabinets.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">
                {config.selectedCabinets.length} cabinet(s) selected
              </p>
            </div>
          )}
        </div>
      ),
      isComplete: () => (config.selectedCabinets?.length || 0) > 0,
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
              How often to check for new or updated documents (minimum 15 minutes)
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={config.enableWorkflows}
                onChange={(e) => updateConfig('enableWorkflows', e.target.checked)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Track Workflows</div>
                <div className="text-sm text-gray-500">
                  Monitor and analyze DocuWare workflows and process steps
                </div>
              </div>
            </label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-blue-800">
              <strong>Performance Tip:</strong> Longer sync intervals reduce server load but may
              delay document analysis. We recommend 60 minutes for most use cases.
            </p>
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.syncInterval && config.syncInterval >= 15),
    },
  ];

  const handleComplete = () => {
    onComplete(config as DocuwareConfig);
  };

  return (
    <ConnectorWizard
      title="Connect DocuWare"
      description="Sync documents and workflows from DocuWare"
      icon={<FileText className="w-6 h-6" />}
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default DocuwareSetupWizard;
