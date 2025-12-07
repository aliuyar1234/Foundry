/**
 * Data Source Detail Component
 * Displays data source details and sync history
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  useDataSource,
  useSyncJobs,
  useTriggerSync,
  useTestConnection,
  useDeleteDataSource,
  DataSource,
  SyncJob,
} from '../../hooks/useDataSources';

const statusColors: Record<DataSource['status'], string> = {
  CONNECTED: 'bg-green-100 text-green-800',
  SYNCING: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  ERROR: 'bg-red-100 text-red-800',
  DISCONNECTED: 'bg-gray-100 text-gray-800',
};

const syncStatusColors: Record<SyncJob['status'], string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

export function DataSourceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: dataSource, isLoading, error } = useDataSource(id!);
  const { data: syncJobs } = useSyncJobs(id!);
  const triggerSync = useTriggerSync();
  const testConnection = useTestConnection();
  const deleteDataSource = useDeleteDataSource();

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <Card>
          <CardHeader>
            <div className="h-8 w-64 bg-gray-200 rounded"></div>
          </CardHeader>
          <CardContent>
            <div className="h-24 bg-gray-200 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !dataSource) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600">Failed to load data source</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate('/data-sources')}
          >
            Back to Data Sources
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleSync = async (fullSync: boolean) => {
    try {
      await triggerSync.mutateAsync({ dataSourceId: id!, fullSync });
    } catch (error) {
      console.error('Failed to trigger sync:', error);
    }
  };

  const handleTest = async () => {
    try {
      const result = await testConnection.mutateAsync(id!);
      if (result.success) {
        alert('Connection test successful!');
      } else {
        alert(`Connection test failed: ${result.error}`);
      }
    } catch (error) {
      alert('Connection test failed');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this data source?')) return;
    try {
      await deleteDataSource.mutateAsync(id!);
      navigate('/data-sources');
    } catch (error) {
      console.error('Failed to delete data source:', error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">{dataSource.name}</CardTitle>
            <Badge className={statusColors[dataSource.status]}>
              {dataSource.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500">Type</p>
              <p className="font-medium">{dataSource.type}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created</p>
              <p className="font-medium">
                {new Date(dataSource.createdAt).toLocaleDateString()}
              </p>
            </div>
            {dataSource.lastSyncAt && (
              <div>
                <p className="text-sm text-gray-500">Last Sync</p>
                <p className="font-medium">
                  {new Date(dataSource.lastSyncAt).toLocaleString()}
                </p>
              </div>
            )}
            {dataSource.lastSyncStatus && (
              <div>
                <p className="text-sm text-gray-500">Last Sync Status</p>
                <p className="font-medium">{dataSource.lastSyncStatus}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => handleSync(false)}
              disabled={triggerSync.isPending || dataSource.status === 'SYNCING'}
            >
              {triggerSync.isPending ? 'Starting...' : 'Sync Now'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSync(true)}
              disabled={triggerSync.isPending || dataSource.status === 'SYNCING'}
            >
              Full Sync
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testConnection.isPending}
            >
              {testConnection.isPending ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          {syncJobs && syncJobs.length > 0 ? (
            <div className="space-y-3">
              {syncJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Badge className={syncStatusColors[job.status]}>
                      {job.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        {job.eventsCount
                          ? `${job.eventsCount.toLocaleString()} events`
                          : 'Processing...'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Started: {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {job.errorMessage && (
                    <p className="text-sm text-red-600 max-w-xs truncate">
                      {job.errorMessage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No sync jobs yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DataSourceDetail;
