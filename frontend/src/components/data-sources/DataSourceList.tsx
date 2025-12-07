/**
 * Data Source List Component
 * Displays all connected data sources with status
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useDataSources, DataSource } from '../../hooks/useDataSources';

const statusColors: Record<DataSource['status'], string> = {
  CONNECTED: 'bg-green-100 text-green-800',
  SYNCING: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  ERROR: 'bg-red-100 text-red-800',
  DISCONNECTED: 'bg-gray-100 text-gray-800',
};

const typeLabels: Record<DataSource['type'], string> = {
  M365: 'Microsoft 365',
  GOOGLE_WORKSPACE: 'Google Workspace',
  SLACK: 'Slack',
  SALESFORCE: 'Salesforce',
  CUSTOM: 'Custom',
};

export function DataSourceList() {
  const { data: dataSources, isLoading, error } = useDataSources();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 w-48 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 w-32 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600">Failed to load data sources</p>
        </CardContent>
      </Card>
    );
  }

  if (!dataSources || dataSources.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No data sources connected
            </h3>
            <p className="text-gray-500 mb-4">
              Connect your first data source to start discovering processes
            </p>
            <Link to="/data-sources/new">
              <Button>Connect Data Source</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {dataSources.map((source) => (
        <DataSourceCard key={source.id} source={source} />
      ))}
    </div>
  );
}

function DataSourceCard({ source }: { source: DataSource }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            <Link
              to={`/data-sources/${source.id}`}
              className="hover:text-blue-600"
            >
              {source.name}
            </Link>
          </CardTitle>
          <Badge className={statusColors[source.status]}>{source.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <div className="space-y-1">
            <p className="text-gray-500">{typeLabels[source.type]}</p>
            {source.lastSyncAt && (
              <p className="text-gray-400">
                Last synced: {new Date(source.lastSyncAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link to={`/data-sources/${source.id}`}>
              <Button variant="outline" size="sm">
                View Details
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DataSourceList;
