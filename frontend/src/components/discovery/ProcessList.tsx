/**
 * Process List Component
 * Displays discovered processes
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useProcesses, Process } from '../../hooks/useDiscovery';

const statusColors: Record<Process['status'], string> = {
  discovered: 'bg-blue-100 text-blue-800',
  validated: 'bg-green-100 text-green-800',
  documented: 'bg-purple-100 text-purple-800',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

export function ProcessList() {
  const { data: processes, isLoading, error } = useProcesses();

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
          <p className="text-red-600">Failed to load processes</p>
        </CardContent>
      </Card>
    );
  }

  if (!processes || processes.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No processes discovered yet
            </h3>
            <p className="text-gray-500 mb-4">
              Connect a data source and run process discovery to get started
            </p>
            <Link to="/data-sources">
              <Button>Manage Data Sources</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {processes.map((process) => (
        <ProcessCard key={process.id} process={process} />
      ))}
    </div>
  );
}

function ProcessCard({ process }: { process: Process }) {
  const confidencePercent = Math.round(process.confidence * 100);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            <Link
              to={`/discovery/processes/${process.id}`}
              className="hover:text-blue-600"
            >
              {process.name}
            </Link>
          </CardTitle>
          <Badge className={statusColors[process.status]}>{process.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <div className="flex gap-6">
            <div>
              <p className="text-gray-500">Occurrences</p>
              <p className="font-medium">{process.frequency.toLocaleString()}</p>
            </div>
            {process.avgDuration && (
              <div>
                <p className="text-gray-500">Avg Duration</p>
                <p className="font-medium">{formatDuration(process.avgDuration)}</p>
              </div>
            )}
            <div>
              <p className="text-gray-500">Confidence</p>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-gray-200 rounded-full">
                  <div
                    className="h-2 bg-blue-500 rounded-full"
                    style={{ width: `${confidencePercent}%` }}
                  ></div>
                </div>
                <span className="font-medium">{confidencePercent}%</span>
              </div>
            </div>
          </div>
          <Link to={`/discovery/processes/${process.id}`}>
            <Button variant="outline" size="sm">
              View Flow
            </Button>
          </Link>
        </div>
        {process.description && (
          <p className="text-sm text-gray-500 mt-2">{process.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default ProcessList;
