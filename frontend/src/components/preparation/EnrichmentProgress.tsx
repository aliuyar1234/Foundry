/**
 * Enrichment Progress Display
 * Shows progress of bulk enrichment jobs
 * T313 - Enrichment progress display
 */

import React, { useState, useEffect } from 'react';

interface EnrichmentJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  processedCount: number;
  totalCount: number;
  currentEntity?: string;
  estimatedCompletion?: string;
  startedAt?: string;
  errors: string[];
}

interface EnrichmentStats {
  totalEnrichments: number;
  successfulEnrichments: number;
  failedEnrichments: number;
  averageConfidence: number;
  bySource: Record<string, number>;
  byField: Record<string, number>;
  lastEnrichmentDate?: string;
}

interface EnrichmentProgressProps {
  organizationId: string;
  activeJobId?: string;
  onJobComplete?: (jobId: string) => void;
}

export const EnrichmentProgress: React.FC<EnrichmentProgressProps> = ({
  organizationId,
  activeJobId,
  onJobComplete,
}) => {
  const [jobs, setJobs] = useState<Array<{ jobId: string; status: EnrichmentJob }>>([]);
  const [stats, setStats] = useState<EnrichmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(activeJobId || null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadData();
    startPolling();

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [organizationId]);

  useEffect(() => {
    if (activeJobId) {
      setSelectedJobId(activeJobId);
    }
  }, [activeJobId]);

  const startPolling = () => {
    const interval = setInterval(() => {
      loadData();
    }, 5000); // Poll every 5 seconds

    setPollingInterval(interval);
  };

  const loadData = async () => {
    try {
      // In production: fetch from API
      // const response = await fetch(`/api/v1/organizations/${organizationId}/preparation/enrichment-status`);

      // Mock data
      const mockJobs: Array<{ jobId: string; status: EnrichmentJob }> = [
        {
          jobId: 'job_1',
          status: {
            jobId: 'job_1',
            status: 'processing',
            progress: 45,
            processedCount: 45,
            totalCount: 100,
            currentEntity: 'Company ABC GmbH',
            estimatedCompletion: new Date(Date.now() + 120000).toISOString(),
            startedAt: new Date(Date.now() - 60000).toISOString(),
            errors: [],
          },
        },
        {
          jobId: 'job_2',
          status: {
            jobId: 'job_2',
            status: 'completed',
            progress: 100,
            processedCount: 50,
            totalCount: 50,
            startedAt: new Date(Date.now() - 300000).toISOString(),
            errors: [],
          },
        },
      ];

      const mockStats: EnrichmentStats = {
        totalEnrichments: 1250,
        successfulEnrichments: 1180,
        failedEnrichments: 70,
        averageConfidence: 0.87,
        bySource: {
          firmenbuch_at: 620,
          handelsregister_de: 380,
          zefix_ch: 150,
          open_corporates: 100,
        },
        byField: {
          vatId: 980,
          registrationNumber: 950,
          legalForm: 920,
          executives: 650,
          status: 1100,
        },
        lastEnrichmentDate: new Date().toISOString(),
      };

      setJobs(mockJobs);
      setStats(mockStats);

      // Check for completed jobs
      mockJobs.forEach((job) => {
        if (job.status.status === 'completed' && job.jobId === selectedJobId) {
          onJobComplete?.(job.jobId);
        }
      });
    } catch (error) {
      console.error('Failed to load enrichment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this job?')) return;

    try {
      // In production: call API
      // await fetch(`/api/v1/organizations/${organizationId}/preparation/enrichment-status/${jobId}`, {
      //   method: 'DELETE'
      // });

      setJobs(jobs.filter((j) => j.jobId !== jobId));
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      queued: 'bg-gray-100 text-gray-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDuration = (startedAt?: string) => {
    if (!startedAt) return '-';
    const start = new Date(startedAt);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - start.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const formatEta = (estimatedCompletion?: string) => {
    if (!estimatedCompletion) return '-';
    const eta = new Date(estimatedCompletion);
    const now = new Date();
    const seconds = Math.floor((eta.getTime() - now.getTime()) / 1000);

    if (seconds <= 0) return 'Soon';
    if (seconds < 60) return `~${seconds}s`;
    if (seconds < 3600) return `~${Math.floor(seconds / 60)}m`;
    return `~${Math.floor(seconds / 3600)}h`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      {stats && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Enrichment Statistics</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">
                {stats.totalEnrichments.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">Total Enrichments</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">
                {((stats.successfulEnrichments / stats.totalEnrichments) * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500">Success Rate</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">
                {(stats.averageConfidence * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-500">Avg Confidence</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600">
                {Object.keys(stats.bySource).length}
              </div>
              <div className="text-sm text-gray-500">Data Sources</div>
            </div>
          </div>

          {/* Source Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">By Data Source</h4>
              <div className="space-y-2">
                {Object.entries(stats.bySource)
                  .sort((a, b) => b[1] - a[1])
                  .map(([source, count]) => (
                    <div key={source} className="flex items-center">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600 capitalize">
                            {source.replace(/_/g, ' ')}
                          </span>
                          <span className="text-gray-900">{count}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{
                              width: `${(count / stats.totalEnrichments) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">By Field</h4>
              <div className="space-y-2">
                {Object.entries(stats.byField)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([field, count]) => (
                    <div key={field} className="flex items-center">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600 capitalize">
                            {field.replace(/([A-Z])/g, ' $1')}
                          </span>
                          <span className="text-gray-900">{count}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{
                              width: `${(count / stats.totalEnrichments) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Jobs */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Active Enrichment Jobs
          {jobs.filter((j) => j.status.status === 'processing' || j.status.status === 'queued').length > 0 && (
            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
              {jobs.filter((j) => j.status.status === 'processing' || j.status.status === 'queued').length} active
            </span>
          )}
        </h3>

        {jobs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No enrichment jobs found.</p>
        ) : (
          <div className="space-y-4">
            {jobs.map(({ jobId, status: job }) => (
              <div
                key={jobId}
                className={`border rounded-lg p-4 ${
                  selectedJobId === jobId ? 'border-blue-500 bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(job.status)}`}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                    <span className="text-sm font-medium text-gray-900">Job {jobId}</span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span>Duration: {formatDuration(job.startedAt)}</span>
                    {job.status === 'processing' && (
                      <span>ETA: {formatEta(job.estimatedCompletion)}</span>
                    )}
                    {(job.status === 'queued' || job.status === 'processing') && (
                      <button
                        onClick={() => handleCancelJob(jobId)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">
                      {job.processedCount} of {job.totalCount} entities
                    </span>
                    <span className="text-gray-900 font-medium">{job.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        job.status === 'completed'
                          ? 'bg-green-500'
                          : job.status === 'failed'
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>

                {/* Current Entity */}
                {job.currentEntity && job.status === 'processing' && (
                  <div className="text-sm text-gray-500">
                    Currently processing: <span className="text-gray-700">{job.currentEntity}</span>
                  </div>
                )}

                {/* Errors */}
                {job.errors.length > 0 && (
                  <div className="mt-2 text-sm text-red-600">
                    Errors: {job.errors.length}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Enrichment History */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Job Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Entities
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Success Rate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {/* Mock history data */}
              {[
                { date: '2024-01-15 14:30', type: 'Company', entities: 50, success: 48, duration: '2m 15s' },
                { date: '2024-01-15 10:15', type: 'Address', entities: 120, success: 115, duration: '5m 42s' },
                { date: '2024-01-14 16:00', type: 'Company', entities: 25, success: 25, duration: '1m 10s' },
              ].map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{item.date}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.entities}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`font-medium ${
                      (item.success / item.entities) >= 0.9 ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {((item.success / item.entities) * 100).toFixed(0)}%
                    </span>
                    <span className="text-gray-500"> ({item.success}/{item.entities})</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EnrichmentProgress;
