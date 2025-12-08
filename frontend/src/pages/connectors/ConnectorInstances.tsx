/**
 * ConnectorInstances Page (T195)
 * List of configured connector instances with status badges and quick actions
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../lib/utils';

export interface ConnectorInstance {
  id: string;
  connectorId: string;
  name: string;
  connectorName: string;
  connectorLogo?: string;
  category: 'ERP' | 'CRM' | 'Communication' | 'Accounting' | 'DMS' | 'Other';
  status: 'connected' | 'syncing' | 'error' | 'disconnected' | 'configuring';
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'failed' | 'partial';
  nextSyncAt?: string;
  recordCount?: number;
  errorCount?: number;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<ConnectorInstance['status'], string> = {
  connected: 'bg-green-100 text-green-800',
  syncing: 'bg-blue-100 text-blue-800',
  error: 'bg-red-100 text-red-800',
  disconnected: 'bg-gray-100 text-gray-800',
  configuring: 'bg-yellow-100 text-yellow-800',
};

const statusIcons: Record<ConnectorInstance['status'], JSX.Element> = {
  connected: (
    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  ),
  syncing: (
    <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  ),
  disconnected: (
    <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z"
        clipRule="evenodd"
      />
    </svg>
  ),
  configuring: (
    <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

// Mock data - in real app, this would come from an API
const MOCK_INSTANCES: ConnectorInstance[] = [
  {
    id: '1',
    connectorId: 'salesforce',
    name: 'Salesforce Production',
    connectorName: 'Salesforce',
    category: 'CRM',
    status: 'connected',
    lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
    lastSyncStatus: 'success',
    nextSyncAt: new Date(Date.now() + 7200000).toISOString(),
    recordCount: 15234,
    errorCount: 0,
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    connectorId: 'slack',
    name: 'Slack Workspace',
    connectorName: 'Slack',
    category: 'Communication',
    status: 'syncing',
    lastSyncAt: new Date(Date.now() - 300000).toISOString(),
    lastSyncStatus: 'success',
    recordCount: 8921,
    errorCount: 0,
    createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    updatedAt: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: '3',
    connectorId: 'datev',
    name: 'DATEV Accounting',
    connectorName: 'DATEV',
    category: 'Accounting',
    status: 'error',
    lastSyncAt: new Date(Date.now() - 7200000).toISOString(),
    lastSyncStatus: 'failed',
    recordCount: 3456,
    errorCount: 23,
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

export function ConnectorInstances() {
  const navigate = useNavigate();
  const [instances] = useState<ConnectorInstance[]>(MOCK_INSTANCES);
  const [isLoading] = useState(false);

  const handleSync = (instanceId: string) => {
    console.log('Triggering sync for instance:', instanceId);
    // In real app, trigger sync via API
  };

  const handleEdit = (instanceId: string) => {
    navigate(`/connectors/instances/${instanceId}/edit`);
  };

  const handleDelete = (instanceId: string) => {
    if (confirm('Are you sure you want to delete this connector instance?')) {
      console.log('Deleting instance:', instanceId);
      // In real app, delete via API
    }
  };

  const handleAddNew = () => {
    navigate('/connectors/marketplace');
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Connector Instances</h1>
          <p className="text-gray-600">Manage your configured connector instances</p>
        </div>
        <Button onClick={handleAddNew}>
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          Add Connector
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-900">
              {instances.length}
            </div>
            <div className="text-sm text-gray-600">Total Connectors</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {instances.filter((i) => i.status === 'connected').length}
            </div>
            <div className="text-sm text-gray-600">Connected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {instances.filter((i) => i.status === 'syncing').length}
            </div>
            <div className="text-sm text-gray-600">Syncing</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {instances.filter((i) => i.status === 'error').length}
            </div>
            <div className="text-sm text-gray-600">Errors</div>
          </CardContent>
        </Card>
      </div>

      {/* Instance List */}
      {instances.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-10 h-10 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No connectors configured
              </h3>
              <p className="text-gray-600 mb-4">
                Add your first connector to start syncing data
              </p>
              <Button onClick={handleAddNew}>Browse Marketplace</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {instances.map((instance) => (
            <Card key={instance.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    {statusIcons[instance.status]}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            to={`/connectors/instances/${instance.id}`}
                            className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                          >
                            {instance.name}
                          </Link>
                          <Badge className={statusColors[instance.status]}>
                            {instance.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">
                          {instance.connectorName} • {instance.category}
                        </p>
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSync(instance.id)}
                          disabled={instance.status === 'syncing'}
                        >
                          <svg
                            className="w-4 h-4 mr-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(instance.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(instance.id)}
                        >
                          <svg
                            className="w-4 h-4 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </Button>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {instance.lastSyncAt && (
                        <div>
                          <span className="text-gray-600">Last Sync:</span>
                          <p className="font-medium text-gray-900">
                            {formatDateTime(instance.lastSyncAt)}
                          </p>
                        </div>
                      )}
                      {instance.recordCount !== undefined && (
                        <div>
                          <span className="text-gray-600">Records:</span>
                          <p className="font-medium text-gray-900">
                            {instance.recordCount.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {instance.nextSyncAt && (
                        <div>
                          <span className="text-gray-600">Next Sync:</span>
                          <p className="font-medium text-gray-900">
                            {formatDateTime(instance.nextSyncAt)}
                          </p>
                        </div>
                      )}
                      {instance.errorCount !== undefined && instance.errorCount > 0 && (
                        <div>
                          <span className="text-gray-600">Errors:</span>
                          <p className="font-medium text-red-600">
                            {instance.errorCount}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConnectorInstances;
