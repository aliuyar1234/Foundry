/**
 * SAP Business One Connection Wizard
 * Task: T071-T074
 *
 * Step-by-step guide for connecting SAP Business One
 * Supports Service Layer authentication and database selection
 */

import React, { useState, useEffect } from 'react';
import { Input } from '../../ui/input';
import { ConnectorWizard, WizardStep } from './ConnectorWizard';

interface SapB1WizardProps {
  onComplete: (config: SapB1Config) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  onTestConnection?: (config: Partial<SapB1Config>) => Promise<{
    success: boolean;
    databases?: string[];
    error?: string;
  }>;
}

export interface SapB1Config {
  name: string;
  serverUrl: string;
  companyDb: string;
  username: string;
  password: string;
  sslEnabled: boolean;
  useIncrementalSync: boolean;
  includeGermanLocalization: boolean;
  syncEntities: string[];
}

export function SapB1Wizard({
  onComplete,
  onCancel,
  isSubmitting,
  onTestConnection,
}: SapB1WizardProps) {
  const [config, setConfig] = useState<Partial<SapB1Config>>({
    sslEnabled: true,
    useIncrementalSync: true,
    includeGermanLocalization: true,
    syncEntities: [
      'BusinessPartners',
      'Items',
      'Orders',
      'PurchaseOrders',
      'Invoices',
      'PurchaseInvoices',
    ],
  });

  const [connectionTest, setConnectionTest] = useState<{
    tested: boolean;
    success: boolean;
    databases: string[];
    error?: string;
  }>({
    tested: false,
    success: false,
    databases: [],
  });

  const [isTesting, setIsTesting] = useState(false);

  const updateConfig = <K extends keyof SapB1Config>(
    key: K,
    value: SapB1Config[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    // Reset connection test when credentials change
    if (['serverUrl', 'username', 'password', 'sslEnabled'].includes(key as string)) {
      setConnectionTest({ tested: false, success: false, databases: [] });
    }
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

  const handleTestConnection = async () => {
    if (!onTestConnection) return;

    setIsTesting(true);
    try {
      const result = await onTestConnection(config);
      setConnectionTest({
        tested: true,
        success: result.success,
        databases: result.databases || [],
        error: result.error,
      });
    } catch (error) {
      setConnectionTest({
        tested: true,
        success: false,
        databases: [],
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
      description: 'Give your SAP Business One connection a descriptive name',
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
              placeholder="e.g., SAP B1 Production"
            />
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.name?.trim()),
    },
    {
      id: 'server',
      title: 'Server Connection',
      description: 'Enter your SAP Business One Service Layer URL',
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="serverUrl" className="block text-sm font-medium mb-1">
              Server URL
            </label>
            <Input
              id="serverUrl"
              value={config.serverUrl || ''}
              onChange={(e) => updateConfig('serverUrl', e.target.value)}
              placeholder="e.g., sap-server.company.com:50000"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the hostname and port (without protocol). Example: sap.example.com:50000
            </p>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.sslEnabled !== false}
                onChange={(e) => updateConfig('sslEnabled', e.target.checked)}
              />
              <span className="text-sm">Use SSL/HTTPS (recommended)</span>
            </label>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            <p className="font-medium text-blue-800 mb-1">Service Layer Requirements:</p>
            <ul className="text-blue-700 text-xs space-y-1">
              <li>• SAP Business One 9.1 or later with Service Layer enabled</li>
              <li>• Network access to the Service Layer port (default: 50000/50001)</li>
              <li>• Valid SSL certificate if using HTTPS</li>
            </ul>
          </div>
        </div>
      ),
      isComplete: () => Boolean(config.serverUrl?.trim()),
    },
    {
      id: 'credentials',
      title: 'Authentication',
      description: 'Enter your SAP B1 user credentials',
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
              placeholder="Your SAP B1 username"
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
              placeholder="Your SAP B1 password"
            />
          </div>
          {onTestConnection && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !config.serverUrl || !config.username || !config.password}
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
                    ? `✓ Connection successful! Found ${connectionTest.databases.length} company database(s).`
                    : `✗ Connection failed: ${connectionTest.error}`
                  }
                </div>
              )}
            </div>
          )}
          <div className="p-3 bg-yellow-50 rounded-lg text-sm">
            <p className="font-medium text-yellow-800 mb-1">Permissions Required:</p>
            <p className="text-yellow-700 text-xs">
              The user needs read access to business partners, items, orders, invoices,
              and other entities you want to sync.
            </p>
          </div>
        </div>
      ),
      isComplete: () =>
        Boolean(config.username?.trim() && config.password?.trim()),
    },
    {
      id: 'database',
      title: 'Company Database',
      description: 'Select or enter your SAP Business One company database',
      content: (
        <div className="space-y-4">
          {connectionTest.databases.length > 0 ? (
            <div>
              <label className="block text-sm font-medium mb-2">
                Available Databases
              </label>
              <div className="space-y-2">
                {connectionTest.databases.map((db) => (
                  <label
                    key={db}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                      config.companyDb === db ? 'border-blue-500 bg-blue-50' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="companyDb"
                      checked={config.companyDb === db}
                      onChange={() => updateConfig('companyDb', db)}
                    />
                    <span className="font-mono">{db}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="companyDb" className="block text-sm font-medium mb-1">
                Company Database Name
              </label>
              <Input
                id="companyDb"
                value={config.companyDb || ''}
                onChange={(e) => updateConfig('companyDb', e.target.value)}
                placeholder="e.g., SBODEMOUS"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the exact name of your SAP B1 company database
              </p>
            </div>
          )}
        </div>
      ),
      isComplete: () => Boolean(config.companyDb?.trim()),
    },
    {
      id: 'entities',
      title: 'Data to Sync',
      description: 'Select which SAP B1 entities you want to sync',
      content: (
        <div className="space-y-3">
          {[
            { id: 'BusinessPartners', label: 'Business Partners', description: 'Customers, vendors, and leads' },
            { id: 'Items', label: 'Items', description: 'Products and inventory items' },
            { id: 'Orders', label: 'Sales Orders', description: 'Customer orders' },
            { id: 'PurchaseOrders', label: 'Purchase Orders', description: 'Vendor purchase orders' },
            { id: 'Invoices', label: 'A/R Invoices', description: 'Customer invoices' },
            { id: 'PurchaseInvoices', label: 'A/P Invoices', description: 'Vendor invoices' },
            { id: 'DeliveryNotes', label: 'Delivery Notes', description: 'Shipping documents' },
            { id: 'CreditNotes', label: 'Credit Notes', description: 'Customer credit notes' },
            { id: 'IncomingPayments', label: 'Incoming Payments', description: 'Customer payments received' },
            { id: 'VendorPayments', label: 'Vendor Payments', description: 'Payments to vendors' },
            { id: 'ApprovalRequests', label: 'Approval Workflows', description: 'Document approvals' },
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
    {
      id: 'options',
      title: 'Sync Options',
      description: 'Configure synchronization behavior',
      content: (
        <div className="space-y-4">
          <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={config.useIncrementalSync !== false}
              onChange={(e) => updateConfig('useIncrementalSync', e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Enable Incremental Sync</div>
              <div className="text-sm text-gray-500">
                Only sync changes since the last sync (recommended for performance)
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={config.includeGermanLocalization !== false}
              onChange={(e) => updateConfig('includeGermanLocalization', e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="font-medium">German Localization</div>
              <div className="text-sm text-gray-500">
                Include German document type names (Rechnung, Gutschrift, Lieferschein, etc.)
              </div>
            </div>
          </label>
          <div className="p-3 bg-green-50 rounded-lg text-sm">
            <p className="font-medium text-green-800 mb-1">Ready to Connect!</p>
            <p className="text-green-700 text-xs">
              Click &quot;Connect&quot; to establish the connection and start syncing data from SAP Business One.
            </p>
          </div>
        </div>
      ),
      isComplete: () => true,
    },
  ];

  const handleComplete = () => {
    onComplete(config as SapB1Config);
  };

  return (
    <ConnectorWizard
      title="Connect SAP Business One"
      description="Sync ERP data from SAP B1"
      icon={
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      }
      steps={steps}
      onComplete={handleComplete}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

export default SapB1Wizard;
