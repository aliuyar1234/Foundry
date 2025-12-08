/**
 * DMS Connector Example
 * Demonstrates how to use the DMS connector components together
 */

import React, { useState } from 'react';
import { DMSSystemSelector } from './DMSSystemSelector';
import { DocuwareSetupWizard, DocuwareConfig } from './DocuwareSetupWizard';
import { MFilesSetupWizard, MFilesConfig } from './MFilesSetupWizard';
import { DMSFolderSelector, generateMockFolderStructure } from './DMSFolderSelector';
import { DMSSyncStatus, generateMockDMSConnection, DMSConnection } from './DMSSyncStatus';

type SetupStep = 'select-system' | 'setup-wizard' | 'folder-selection' | 'sync-status';

export function DMSConnectorExample() {
  const [currentStep, setCurrentStep] = useState<SetupStep>('select-system');
  const [selectedSystem, setSelectedSystem] = useState<'docuware' | 'mfiles' | null>(null);
  const [connection, setConnection] = useState<DMSConnection | null>(null);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSystemSelect = (systemId: 'docuware' | 'mfiles') => {
    setSelectedSystem(systemId);
    setCurrentStep('setup-wizard');
  };

  const handleWizardComplete = async (config: DocuwareConfig | MFilesConfig) => {
    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('Configuration:', config);

    setIsSubmitting(false);
    setCurrentStep('folder-selection');
  };

  const handleFolderSelectionConfirm = () => {
    // Create a mock connection
    const mockConnection = generateMockDMSConnection(selectedSystem!, 'connected');
    setConnection(mockConnection);
    setCurrentStep('sync-status');
  };

  const handleSync = async () => {
    if (!connection) return;

    console.log('Starting sync...');
    setConnection({ ...connection, status: 'syncing' });

    // Simulate sync
    await new Promise((resolve) => setTimeout(resolve, 3000));

    setConnection({ ...connection, status: 'connected' });
  };

  const handlePause = () => {
    if (!connection) return;
    setConnection({ ...connection, status: 'paused' });
  };

  const handleResume = () => {
    if (!connection) return;
    setConnection({ ...connection, status: 'connected' });
  };

  const handleDisconnect = () => {
    setConnection(null);
    setSelectedSystem(null);
    setSelectedFolders([]);
    setCurrentStep('select-system');
  };

  const handleCancel = () => {
    if (currentStep === 'folder-selection') {
      setCurrentStep('setup-wizard');
    } else {
      setSelectedSystem(null);
      setSelectedFolders([]);
      setCurrentStep('select-system');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        {/* Step: Select System */}
        {currentStep === 'select-system' && (
          <DMSSystemSelector onSelectSystem={handleSystemSelect} />
        )}

        {/* Step: Setup Wizard */}
        {currentStep === 'setup-wizard' && selectedSystem === 'docuware' && (
          <DocuwareSetupWizard
            onComplete={handleWizardComplete}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
          />
        )}

        {currentStep === 'setup-wizard' && selectedSystem === 'mfiles' && (
          <MFilesSetupWizard
            onComplete={handleWizardComplete}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
          />
        )}

        {/* Step: Folder Selection */}
        {currentStep === 'folder-selection' && selectedSystem && (
          <div className="max-w-4xl mx-auto">
            <DMSFolderSelector
              systemType={selectedSystem}
              folders={generateMockFolderStructure(selectedSystem)}
              selectedFolders={selectedFolders}
              onSelectionChange={setSelectedFolders}
              onConfirm={handleFolderSelectionConfirm}
              onCancel={handleCancel}
            />
          </div>
        )}

        {/* Step: Sync Status */}
        {currentStep === 'sync-status' && connection && (
          <div className="max-w-4xl mx-auto">
            <DMSSyncStatus
              connection={connection}
              onSync={handleSync}
              onPause={handlePause}
              onResume={handleResume}
              onDisconnect={handleDisconnect}
              isSyncing={connection.status === 'syncing'}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default DMSConnectorExample;
