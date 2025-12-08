/**
 * ConnectorInstanceDetail Page (T196)
 * Single connector instance detail view with configuration, sync history, and error log
 */

import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { SyncHistoryTimeline, SyncEvent } from '../../components/connectors/SyncHistoryTimeline';
import { ErrorLogViewer, ErrorLog } from '../../components/connectors/ErrorLogViewer';
import { TestConnection } from '../../components/connectors/TestConnection';
import { formatDateTime } from '../../lib/utils';

interface ConnectorInstanceDetail {
  id: string;
  connectorId: string;
  name: string;
  connectorName: string;
  category: string;
  status: 'connected' | 'syncing' | 'error' | 'disconnected' | 'configuring';
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'failed' | 'partial';
  nextSyncAt?: string;
  recordCount?: number;
  errorCount?: number;
  createdAt: string;
  updatedAt: string;
  configuration: Record<string, unknown>;
  syncSchedule?: string;
}

// Mock data
const MOCK_INSTANCE: ConnectorInstanceDetail = {
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
  errorCount: 2,
  createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  updatedAt: new Date(Date.now() - 3600000).toISOString(),
  configuration: {
    instanceUrl: 'https://example.salesforce.com',
    apiVersion: 'v58.0',
    syncContacts: true,
    syncAccounts: true,
    syncOpportunities: true,
    syncInterval: '1 hour',
  },
  syncSchedule: 'Every hour',
};

const MOCK_SYNC_EVENTS: SyncEvent[] = [
  {
    id: '1',
    status: 'completed',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3500000).toISOString(),
    duration: 100000,
    recordsProcessed: 1234,
    recordsCreated: 45,
    recordsUpdated: 89,
    recordsDeleted: 3,
    recordsFailed: 0,
    errorCount: 0,
    triggeredBy: 'scheduled',
    syncType: 'incremental',
  },
  {
    id: '2',
    status: 'partial',
    startedAt: new Date(Date.now() - 7200000).toISOString(),
    completedAt: new Date(Date.now() - 7000000).toISOString(),
    duration: 200000,
    recordsProcessed: 1456,
    recordsCreated: 67,
    recordsUpdated: 123,
    recordsDeleted: 1,
    recordsFailed: 2,
    errorCount: 2,
    triggeredBy: 'manual',
    syncType: 'incremental',
    errors: [
      {
        id: 'e1',
        message: 'Failed to sync contact: Invalid email format',
        recordId: 'contact-123',
        timestamp: new Date(Date.now() - 7100000).toISOString(),
        severity: 'error',
      },
      {
        id: 'e2',
        message: 'Account missing required field: Industry',
        recordId: 'account-456',
        timestamp: new Date(Date.now() - 7050000).toISOString(),
        severity: 'warning',
      },
    ],
  },
  {
    id: '3',
    status: 'completed',
    startedAt: new Date(Date.now() - 10800000).toISOString(),
    completedAt: new Date(Date.now() - 10600000).toISOString(),
    duration: 200000,
    recordsProcessed: 15234,
    recordsCreated: 15234,
    recordsUpdated: 0,
    recordsDeleted: 0,
    recordsFailed: 0,
    errorCount: 0,
    triggeredBy: 'manual',
    syncType: 'full',
  },
];

const MOCK_ERROR_LOGS: ErrorLog[] = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 7100000).toISOString(),
    severity: 'error',
    message: 'Failed to sync contact: Invalid email format',
    code: 'INVALID_EMAIL',
    source: 'ContactSync',
    recordId: 'contact-123',
    stackTrace: 'Error: Invalid email format\n  at validateEmail (sync.ts:45)\n  at syncContact (sync.ts:120)',
    context: {
      email: 'invalid-email',
      contactId: 'contact-123',
      attemptCount: 3,
    },
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 7050000).toISOString(),
    severity: 'warning',
    message: 'Account missing required field: Industry',
    code: 'MISSING_FIELD',
    source: 'AccountSync',
    recordId: 'account-456',
    context: {
      accountId: 'account-456',
      missingFields: ['Industry'],
    },
  },
];

const statusColors: Record<ConnectorInstanceDetail['status'], string> = {
  connected: 'bg-green-100 text-green-800',
  syncing: 'bg-blue-100 text-blue-800',
  error: 'bg-red-100 text-red-800',
  disconnected: 'bg-gray-100 text-gray-800',
  configuring: 'bg-yellow-100 text-yellow-800',
};

export function ConnectorInstanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [instance] = useState<ConnectorInstanceDetail>(MOCK_INSTANCE);
  const [syncEvents] = useState<SyncEvent[]>(MOCK_SYNC_EVENTS);
  const [errorLogs] = useState<ErrorLog[]>(MOCK_ERROR_LOGS);
  const [activeTab, setActiveTab] = useState<'overview' | 'sync-history' | 'errors' | 'config'>(
    'overview'
  );

  const handleSync = () => {
    console.log('Triggering sync for instance:', id);
    // In real app, trigger sync via API
  };

  const handleEdit = () => {
    navigate(`/connectors/instances/${id}/edit`);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this connector instance?')) {
      console.log('Deleting instance:', id);
      navigate('/connectors/instances');
    }
  };

  const handleTestConnection = async () => {
    // Mock test connection
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return {
      success: true,
      message: 'Connection successful',
      details: {
        instanceUrl: instance.configuration.instanceUrl,
        apiVersion: instance.configuration.apiVersion,
        responseTime: '245ms',
      },
    };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <Link to="/connectors/instances" className="hover:text-blue-600">
            Connector Instances
          </Link>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span>{instance.name}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{instance.name}</h1>
              <Badge className={statusColors[instance.status]}>{instance.status}</Badge>
            </div>
            <p className="text-gray-600">
              {instance.connectorName} • {instance.category}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSync} disabled={instance.status === 'syncing'}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Sync Now
            </Button>
            <Button variant="outline" onClick={handleEdit}>
              Edit
            </Button>
            <Button variant="ghost" onClick={handleDelete}>
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
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-900">
              {instance.recordCount?.toLocaleString() || 0}
            </div>
            <div className="text-sm text-gray-600">Total Records</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {instance.lastSyncAt ? formatDateTime(instance.lastSyncAt) : 'Never'}
            </div>
            <div className="text-sm text-gray-600">Last Sync</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {instance.nextSyncAt ? formatDateTime(instance.nextSyncAt) : 'Not scheduled'}
            </div>
            <div className="text-sm text-gray-600">Next Sync</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {instance.errorCount || 0}
            </div>
            <div className="text-sm text-gray-600">Errors</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'sync-history', label: 'Sync History' },
            { id: 'errors', label: 'Errors' },
            { id: 'config', label: 'Configuration' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connection Status</CardTitle>
              <CardDescription>Test and verify your connector connection</CardDescription>
            </CardHeader>
            <CardContent>
              <TestConnection onTest={handleTestConnection} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Sync Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <SyncHistoryTimeline events={syncEvents.slice(0, 3)} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'sync-history' && (
        <SyncHistoryTimeline events={syncEvents} />
      )}

      {activeTab === 'errors' && (
        <ErrorLogViewer errors={errorLogs} />
      )}

      {activeTab === 'config' && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Current connector configuration settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(instance.configuration).map(([key, value]) => (
                  <div key={key} className="border-b border-gray-200 pb-3">
                    <dt className="text-sm font-medium text-gray-600 capitalize mb-1">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </dt>
                    <dd className="text-sm text-gray-900">
                      {typeof value === 'boolean'
                        ? value
                          ? 'Enabled'
                          : 'Disabled'
                        : String(value)}
                    </dd>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-200">
                <Button onClick={handleEdit}>Edit Configuration</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ConnectorInstanceDetail;
