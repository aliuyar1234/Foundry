/**
 * Data Source Connect Component
 * Form for connecting new data sources with wizard support
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useCreateDataSource, DataSource } from '../../hooks/useDataSources';
import {
  SalesforceWizard,
  HubSpotWizard,
  SlackWizard,
  DatevWizard,
  BmdWizard,
} from './wizards';

const dataSourceTypes: Array<{
  type: DataSource['type'];
  label: string;
  description: string;
  icon: string;
  category: 'productivity' | 'crm' | 'erp' | 'communication' | 'accounting';
  hasWizard: boolean;
}> = [
  // Productivity
  {
    type: 'M365',
    label: 'Microsoft 365',
    description: 'Connect to Exchange, Teams, and SharePoint',
    icon: 'M',
    category: 'productivity',
    hasWizard: false,
  },
  {
    type: 'GOOGLE_WORKSPACE',
    label: 'Google Workspace',
    description: 'Connect to Gmail, Calendar, and Drive',
    icon: 'G',
    category: 'productivity',
    hasWizard: false,
  },
  // CRM
  {
    type: 'SALESFORCE',
    label: 'Salesforce',
    description: 'Connect to Salesforce CRM',
    icon: 'SF',
    category: 'crm',
    hasWizard: true,
  },
  {
    type: 'HUBSPOT',
    label: 'HubSpot',
    description: 'Connect to HubSpot CRM',
    icon: 'HS',
    category: 'crm',
    hasWizard: true,
  },
  // ERP
  {
    type: 'ODOO',
    label: 'Odoo',
    description: 'Connect to Odoo ERP',
    icon: 'O',
    category: 'erp',
    hasWizard: false,
  },
  {
    type: 'SAP_B1',
    label: 'SAP Business One',
    description: 'Connect to SAP B1',
    icon: 'SAP',
    category: 'erp',
    hasWizard: false,
  },
  // Communication
  {
    type: 'SLACK',
    label: 'Slack',
    description: 'Connect to Slack workspaces',
    icon: 'S',
    category: 'communication',
    hasWizard: true,
  },
  // Accounting
  {
    type: 'DATEV',
    label: 'DATEV',
    description: 'Connect to DATEV accounting',
    icon: 'DV',
    category: 'accounting',
    hasWizard: true,
  },
  {
    type: 'BMD',
    label: 'BMD NTCS',
    description: 'Connect to BMD accounting',
    icon: 'BMD',
    category: 'accounting',
    hasWizard: true,
  },
];

const categories = [
  { id: 'productivity', label: 'Productivity' },
  { id: 'crm', label: 'CRM' },
  { id: 'erp', label: 'ERP' },
  { id: 'communication', label: 'Communication' },
  { id: 'accounting', label: 'Accounting' },
];

export function DataSourceConnect() {
  const navigate = useNavigate();
  const createDataSource = useCreateDataSource();
  const [selectedType, setSelectedType] = useState<DataSource['type'] | null>(null);
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !name) return;

    try {
      const result = await createDataSource.mutateAsync({
        name,
        type: selectedType,
        config,
      });
      navigate(`/data-sources/${result.id}`);
    } catch (error) {
      console.error('Failed to create data source:', error);
    }
  };

  const handleWizardComplete = async (wizardConfig: Record<string, unknown>) => {
    if (!selectedType) return;

    try {
      const result = await createDataSource.mutateAsync({
        name: wizardConfig.name as string,
        type: selectedType,
        config: wizardConfig,
      });
      navigate(`/data-sources/${result.id}`);
    } catch (error) {
      console.error('Failed to create data source:', error);
    }
  };

  const handleCancel = () => {
    setSelectedType(null);
    setName('');
    setConfig({});
  };

  // Render wizard for types that support it
  if (selectedType === 'SALESFORCE') {
    return (
      <SalesforceWizard
        onComplete={handleWizardComplete}
        onCancel={handleCancel}
        isSubmitting={createDataSource.isPending}
      />
    );
  }

  if (selectedType === 'HUBSPOT') {
    return (
      <HubSpotWizard
        onComplete={handleWizardComplete}
        onCancel={handleCancel}
        isSubmitting={createDataSource.isPending}
      />
    );
  }

  if (selectedType === 'SLACK') {
    return (
      <SlackWizard
        onComplete={handleWizardComplete}
        onCancel={handleCancel}
        isSubmitting={createDataSource.isPending}
      />
    );
  }

  if (selectedType === 'DATEV') {
    return (
      <DatevWizard
        onComplete={handleWizardComplete}
        onCancel={handleCancel}
        isSubmitting={createDataSource.isPending}
      />
    );
  }

  if (selectedType === 'BMD') {
    return (
      <BmdWizard
        onComplete={handleWizardComplete}
        onCancel={handleCancel}
        isSubmitting={createDataSource.isPending}
      />
    );
  }

  if (!selectedType) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Select Data Source Type</h2>

        {categories.map((category) => {
          const typesInCategory = dataSourceTypes.filter(
            (t) => t.category === category.id
          );
          if (typesInCategory.length === 0) return null;

          return (
            <div key={category.id} className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                {category.label}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {typesInCategory.map((type) => (
                  <Card
                    key={type.type}
                    className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all"
                    onClick={() => setSelectedType(type.type)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                          {type.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{type.label}</h3>
                            {type.hasWizard && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                Wizard
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{type.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const selectedTypeInfo = dataSourceTypes.find((t) => t.type === selectedType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <button
            onClick={() => setSelectedType(null)}
            className="text-gray-500 hover:text-gray-700"
          >
            &larr;
          </button>
          Connect {selectedTypeInfo?.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Connection Name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production M365"
              required
            />
          </div>

          {selectedType === 'M365' && (
            <>
              <div className="space-y-2">
                <label htmlFor="tenantId" className="text-sm font-medium">
                  Tenant ID
                </label>
                <Input
                  id="tenantId"
                  value={config.tenantId || ''}
                  onChange={(e) => setConfig({ ...config, tenantId: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="clientId" className="text-sm font-medium">
                  Client ID
                </label>
                <Input
                  id="clientId"
                  value={config.clientId || ''}
                  onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="clientSecret" className="text-sm font-medium">
                  Client Secret
                </label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={config.clientSecret || ''}
                  onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })}
                  placeholder="Your client secret"
                  required
                />
              </div>
            </>
          )}

          {selectedType === 'GOOGLE_WORKSPACE' && (
            <>
              <div className="space-y-2">
                <label htmlFor="serviceAccountKey" className="text-sm font-medium">
                  Service Account Key (JSON)
                </label>
                <textarea
                  id="serviceAccountKey"
                  className="w-full h-32 px-3 py-2 border rounded-md"
                  value={config.serviceAccountKey || ''}
                  onChange={(e) => setConfig({ ...config, serviceAccountKey: e.target.value })}
                  placeholder='{"type": "service_account", ...}'
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="domain" className="text-sm font-medium">
                  Domain
                </label>
                <Input
                  id="domain"
                  value={config.domain || ''}
                  onChange={(e) => setConfig({ ...config, domain: e.target.value })}
                  placeholder="company.com"
                  required
                />
              </div>
            </>
          )}

          {selectedType === 'SLACK' && (
            <>
              <div className="space-y-2">
                <label htmlFor="botToken" className="text-sm font-medium">
                  Bot Token
                </label>
                <Input
                  id="botToken"
                  type="password"
                  value={config.botToken || ''}
                  onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                  placeholder="xoxb-..."
                  required
                />
              </div>
            </>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={createDataSource.isPending}>
              {createDataSource.isPending ? 'Creating...' : 'Create Connection'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/data-sources')}
            >
              Cancel
            </Button>
          </div>

          {createDataSource.isError && (
            <p className="text-sm text-red-600">
              Failed to create data source. Please check your configuration.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export default DataSourceConnect;
