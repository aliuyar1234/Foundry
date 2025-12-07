/**
 * Discovery Page
 * Main page for process discovery and network analysis
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ProcessList } from '../../components/discovery/ProcessList';
import { useDiscoverProcesses } from '../../hooks/useDiscovery';
import { useDataSources } from '../../hooks/useDataSources';

export function DiscoveryPage() {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const discoverProcesses = useDiscoverProcesses();
  const { data: dataSources } = useDataSources();

  const connectedSources = dataSources?.filter((ds) => ds.status === 'CONNECTED') || [];

  const handleRunDiscovery = async () => {
    if (connectedSources.length === 0) return;

    setIsDiscovering(true);
    try {
      await discoverProcesses.mutateAsync({
        minCaseCount: 5,
        minActivityFrequency: 3,
      });
    } catch (error) {
      console.error('Discovery failed:', error);
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Process Discovery</h1>
          <p className="text-gray-500">
            Discover and analyze business processes from your data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-gray-100 text-gray-800">
            {connectedSources.length} connected source
            {connectedSources.length !== 1 ? 's' : ''}
          </Badge>
          <Button
            onClick={handleRunDiscovery}
            disabled={isDiscovering || connectedSources.length === 0}
          >
            {isDiscovering ? 'Discovering...' : 'Run Discovery'}
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">-</p>
              <p className="text-sm text-gray-500">Processes Discovered</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">-</p>
              <p className="text-sm text-gray-500">Events Analyzed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-600">-</p>
              <p className="text-sm text-gray-500">People Identified</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-orange-600">-</p>
              <p className="text-sm text-gray-500">Avg Confidence</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discovery Results */}
      {discoverProcesses.data && discoverProcesses.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Discovery Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {discoverProcesses.data.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{result.process.name}</p>
                    <p className="text-sm text-gray-500">
                      {result.stepCount} steps discovered
                    </p>
                  </div>
                  {result.metrics && (
                    <div className="flex gap-4 text-sm">
                      <div className="text-center">
                        <p className="font-medium">{result.metrics.totalCases}</p>
                        <p className="text-gray-500">Cases</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium">{result.metrics.uniqueActivities}</p>
                        <p className="text-gray-500">Activities</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium">
                          {result.metrics.bottleneckActivities.length}
                        </p>
                        <p className="text-gray-500">Bottlenecks</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Process List */}
      <Card>
        <CardHeader>
          <CardTitle>Discovered Processes</CardTitle>
        </CardHeader>
        <CardContent>
          <ProcessList />
        </CardContent>
      </Card>
    </div>
  );
}

export default DiscoveryPage;
