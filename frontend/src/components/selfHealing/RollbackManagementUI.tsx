/**
 * Rollback Management UI Component
 * T161 - Create rollback management UI
 *
 * Displays rollbackable executions and manages rollback requests
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

// =============================================================================
// Types
// =============================================================================

export type RollbackStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed';

export interface RollbackableExecution {
  id: string;
  executionId: string;
  actionId: string;
  actionName: string;
  actionType: string;
  executedAt: string;
  result: Record<string, unknown>;
  rollbackDeadline: string;
  affectedEntities: Array<{
    type: string;
    id: string;
    name: string;
  }>;
  rollbackActions: string[];
  estimatedRollbackTime: string;
  rollbackRequested: boolean;
}

export interface RollbackRequest {
  id: string;
  executionId: string;
  actionName: string;
  actionType: string;
  status: RollbackStatus;
  requestedAt: string;
  requestedBy: string;
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  completedAt?: string;
  errorMessage?: string;
  rollbackResult?: Record<string, unknown>;
}

export interface RollbackStatistics {
  rollbackableCount: number;
  pendingRequests: number;
  completedRollbacks: number;
  failedRollbacks: number;
  avgRollbackTimeMinutes: number;
}

interface RollbackManagementUIProps {
  organizationId: string;
  userId?: string;
  onRollbackRequested?: (executionId: string) => void;
  onRollbackApproved?: (requestId: string) => void;
  onRollbackRejected?: (requestId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function RollbackManagementUI({
  organizationId,
  userId,
  onRollbackRequested,
  onRollbackApproved,
  onRollbackRejected,
}: RollbackManagementUIProps) {
  const [rollbackableExecutions, setRollbackableExecutions] = useState<RollbackableExecution[]>([]);
  const [rollbackRequests, setRollbackRequests] = useState<RollbackRequest[]>([]);
  const [statistics, setStatistics] = useState<RollbackStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'available' | 'requests' | 'history'>('available');
  const [requestDialogExecution, setRequestDialogExecution] = useState<RollbackableExecution | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch rollback data
  const fetchRollbackData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [execRes, reqRes, histRes] = await Promise.all([
        fetch(`/api/self-healing/rollbacks/available`, {
          headers: { 'X-Organization-Id': organizationId },
        }),
        fetch(`/api/self-healing/rollbacks/pending`, {
          headers: { 'X-Organization-Id': organizationId },
        }),
        fetch(`/api/self-healing/rollbacks/history`, {
          headers: { 'X-Organization-Id': organizationId },
        }),
      ]);

      if (execRes.ok) {
        const data = await execRes.json();
        setRollbackableExecutions(data.executions || []);
        setStatistics(data.statistics || null);
      }
      if (reqRes.ok) {
        const data = await reqRes.json();
        setRollbackRequests((prev) => {
          const pendingIds = new Set((data.requests || []).map((r: RollbackRequest) => r.id));
          return [
            ...(data.requests || []),
            ...prev.filter((r) => !pendingIds.has(r.id) && r.status !== 'pending_approval'),
          ];
        });
      }
      if (histRes.ok) {
        const data = await histRes.json();
        setRollbackRequests((prev) => {
          const histIds = new Set((data.requests || []).map((r: RollbackRequest) => r.id));
          const existingIds = new Set(prev.map((r) => r.id));
          return [
            ...prev,
            ...(data.requests || []).filter((r: RollbackRequest) => !existingIds.has(r.id)),
          ];
        });
      }
    } catch (error) {
      console.error('Failed to fetch rollback data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchRollbackData();
  }, [fetchRollbackData]);

  // Request rollback
  const handleRequestRollback = async () => {
    if (!requestDialogExecution || !rollbackReason.trim()) {
      alert('Please provide a reason for the rollback');
      return;
    }

    try {
      const response = await fetch(`/api/self-healing/rollbacks/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': organizationId,
        },
        body: JSON.stringify({
          executionId: requestDialogExecution.executionId,
          reason: rollbackReason,
          requestedBy: userId,
        }),
      });

      if (response.ok) {
        onRollbackRequested?.(requestDialogExecution.executionId);
        setRequestDialogExecution(null);
        setRollbackReason('');
        fetchRollbackData();
      }
    } catch (error) {
      console.error('Failed to request rollback:', error);
    }
  };

  // Approve rollback
  const handleApproveRollback = async (requestId: string) => {
    try {
      const response = await fetch(`/api/self-healing/rollbacks/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': organizationId,
        },
        body: JSON.stringify({ approvedBy: userId }),
      });

      if (response.ok) {
        onRollbackApproved?.(requestId);
        fetchRollbackData();
      }
    } catch (error) {
      console.error('Failed to approve rollback:', error);
    }
  };

  // Reject rollback
  const handleRejectRollback = async () => {
    if (!rejectDialogId || !rejectReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      const response = await fetch(`/api/self-healing/rollbacks/${rejectDialogId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': organizationId,
        },
        body: JSON.stringify({
          rejectedBy: userId,
          reason: rejectReason,
        }),
      });

      if (response.ok) {
        onRollbackRejected?.(rejectDialogId);
        setRejectDialogId(null);
        setRejectReason('');
        fetchRollbackData();
      }
    } catch (error) {
      console.error('Failed to reject rollback:', error);
    }
  };

  const statusColors: Record<RollbackStatus, string> = {
    pending_approval: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-blue-100 text-blue-700',
    rejected: 'bg-red-100 text-red-700',
    executing: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };

  const actionTypeLabels: Record<string, string> = {
    send_reminder: 'Send Reminder',
    escalate: 'Escalate',
    retry_operation: 'Retry Operation',
    redistribute_workload: 'Redistribute',
    notify: 'Notify',
    custom: 'Custom',
  };

  const pendingRequests = rollbackRequests.filter((r) => r.status === 'pending_approval');
  const historyRequests = rollbackRequests.filter((r) => r.status !== 'pending_approval');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statistics.rollbackableCount}</div>
              <p className="text-sm text-gray-500">Rollbackable</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">
                {statistics.pendingRequests}
              </div>
              <p className="text-sm text-gray-500">Pending Approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {statistics.completedRollbacks}
              </div>
              <p className="text-sm text-gray-500">Completed</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {statistics.failedRollbacks}
              </div>
              <p className="text-sm text-gray-500">Failed</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {statistics.avgRollbackTimeMinutes}m
              </div>
              <p className="text-sm text-gray-500">Avg Rollback Time</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Rollback Management</CardTitle>
            <Button variant="outline" onClick={fetchRollbackData}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tabs */}
          <div className="flex border-b mb-4">
            {[
              { id: 'available', label: 'Available Rollbacks', count: rollbackableExecutions.length },
              { id: 'requests', label: 'Pending Requests', count: pendingRequests.length },
              { id: 'history', label: 'History', count: historyRequests.length },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
              >
                {tab.label}
                {tab.count > 0 && (
                  <Badge className="ml-2" variant="secondary">
                    {tab.count}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Available Rollbacks Tab */}
          {activeTab === 'available' && (
            <div className="space-y-3">
              {rollbackableExecutions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No rollbackable executions</p>
                  <p className="text-sm">
                    Recent actions that support rollback will appear here
                  </p>
                </div>
              ) : (
                rollbackableExecutions.map((execution) => (
                  <RollbackableExecutionCard
                    key={execution.id}
                    execution={execution}
                    actionTypeLabels={actionTypeLabels}
                    onRequestRollback={() => setRequestDialogExecution(execution)}
                  />
                ))
              )}
            </div>
          )}

          {/* Pending Requests Tab */}
          {activeTab === 'requests' && (
            <div className="space-y-3">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No pending rollback requests</p>
                  <p className="text-sm">
                    Rollback requests awaiting approval will appear here
                  </p>
                </div>
              ) : (
                pendingRequests.map((request) => (
                  <RollbackRequestCard
                    key={request.id}
                    request={request}
                    statusColors={statusColors}
                    actionTypeLabels={actionTypeLabels}
                    onApprove={() => handleApproveRollback(request.id)}
                    onReject={() => setRejectDialogId(request.id)}
                  />
                ))
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {historyRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No rollback history</p>
                  <p className="text-sm">
                    Completed and rejected rollbacks will appear here
                  </p>
                </div>
              ) : (
                historyRequests.map((request) => (
                  <RollbackHistoryCard
                    key={request.id}
                    request={request}
                    statusColors={statusColors}
                    actionTypeLabels={actionTypeLabels}
                  />
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Rollback Dialog */}
      {requestDialogExecution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Request Rollback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-1">Action</h4>
                <p className="text-gray-600">{requestDialogExecution.actionName}</p>
              </div>

              <div>
                <h4 className="font-medium mb-1">Executed At</h4>
                <p className="text-gray-600">
                  {new Date(requestDialogExecution.executedAt).toLocaleString()}
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-1">Affected Entities</h4>
                <div className="flex flex-wrap gap-2">
                  {requestDialogExecution.affectedEntities.map((entity, idx) => (
                    <Badge key={idx} variant="outline">
                      {entity.name} ({entity.type})
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-1">Estimated Rollback Time</h4>
                <p className="text-gray-600">
                  {requestDialogExecution.estimatedRollbackTime}
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-1">Rollback Deadline</h4>
                <p className="text-gray-600">
                  {new Date(requestDialogExecution.rollbackDeadline).toLocaleString()}
                </p>
              </div>

              <div>
                <label className="block font-medium mb-2">
                  Reason for Rollback <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  className="w-full border rounded p-2 h-24"
                  placeholder="Please explain why this action should be rolled back..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRequestDialogExecution(null);
                    setRollbackReason('');
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleRequestRollback}>Request Rollback</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reject Rollback Dialog */}
      {rejectDialogId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Reject Rollback Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block font-medium mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full border rounded p-2 h-24"
                  placeholder="Please explain why this rollback should not be performed..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRejectDialogId(null);
                    setRejectReason('');
                  }}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleRejectRollback}>
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface RollbackableExecutionCardProps {
  execution: RollbackableExecution;
  actionTypeLabels: Record<string, string>;
  onRequestRollback: () => void;
}

function RollbackableExecutionCard({
  execution,
  actionTypeLabels,
  onRequestRollback,
}: RollbackableExecutionCardProps) {
  const getTimeRemaining = () => {
    const now = new Date().getTime();
    const deadline = new Date(execution.rollbackDeadline).getTime();
    const remaining = deadline - now;

    if (remaining < 0) return 'Expired';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const isExpiringSoon =
    new Date(execution.rollbackDeadline).getTime() - new Date().getTime() <
    60 * 60 * 1000;

  return (
    <div
      className={`border rounded-lg p-4 ${
        isExpiringSoon ? 'border-orange-300 bg-orange-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline">
              {actionTypeLabels[execution.actionType] || execution.actionType}
            </Badge>
            {isExpiringSoon && (
              <Badge className="bg-orange-100 text-orange-700">⏰ Expiring Soon</Badge>
            )}
          </div>
          <p className="font-medium">{execution.actionName}</p>
          <p className="text-sm text-gray-500">
            Executed: {new Date(execution.executedAt).toLocaleString()} |{' '}
            <span className={isExpiringSoon ? 'text-orange-600 font-medium' : ''}>
              {getTimeRemaining()}
            </span>
          </p>
          {execution.affectedEntities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {execution.affectedEntities.slice(0, 3).map((entity, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {entity.name}
                </Badge>
              ))}
              {execution.affectedEntities.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{execution.affectedEntities.length - 3} more
                </Badge>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRequestRollback}
          disabled={execution.rollbackRequested}
        >
          {execution.rollbackRequested ? 'Requested' : 'Request Rollback'}
        </Button>
      </div>
    </div>
  );
}

interface RollbackRequestCardProps {
  request: RollbackRequest;
  statusColors: Record<RollbackStatus, string>;
  actionTypeLabels: Record<string, string>;
  onApprove: () => void;
  onReject: () => void;
}

function RollbackRequestCard({
  request,
  statusColors,
  actionTypeLabels,
  onApprove,
  onReject,
}: RollbackRequestCardProps) {
  return (
    <div className="border rounded-lg p-4 border-yellow-300 bg-yellow-50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={statusColors[request.status]}>
              {request.status.replace('_', ' ')}
            </Badge>
            <Badge variant="outline">
              {actionTypeLabels[request.actionType] || request.actionType}
            </Badge>
          </div>
          <p className="font-medium">{request.actionName}</p>
          <p className="text-sm text-gray-600 mt-1">
            Reason: {request.reason}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Requested by {request.requestedBy} at{' '}
            {new Date(request.requestedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:bg-red-50"
            onClick={onReject}
          >
            Reject
          </Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={onApprove}>
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}

interface RollbackHistoryCardProps {
  request: RollbackRequest;
  statusColors: Record<RollbackStatus, string>;
  actionTypeLabels: Record<string, string>;
}

function RollbackHistoryCard({
  request,
  statusColors,
  actionTypeLabels,
}: RollbackHistoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer ${
        request.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-gray-200'
      }`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={statusColors[request.status]}>
              {request.status.replace('_', ' ')}
            </Badge>
            <Badge variant="outline">
              {actionTypeLabels[request.actionType] || request.actionType}
            </Badge>
          </div>
          <p className="font-medium">{request.actionName}</p>
          <p className="text-sm text-gray-500">
            {request.status === 'completed' && request.completedAt
              ? `Completed: ${new Date(request.completedAt).toLocaleString()}`
              : request.status === 'rejected' && request.rejectedAt
              ? `Rejected: ${new Date(request.rejectedAt).toLocaleString()}`
              : `Requested: ${new Date(request.requestedAt).toLocaleString()}`}
          </p>
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t space-y-2">
          <div>
            <h5 className="text-sm font-medium">Reason:</h5>
            <p className="text-sm text-gray-600">{request.reason}</p>
          </div>

          {request.approvedBy && (
            <div>
              <h5 className="text-sm font-medium">Approved By:</h5>
              <p className="text-sm text-gray-600">
                {request.approvedBy} at{' '}
                {request.approvedAt && new Date(request.approvedAt).toLocaleString()}
              </p>
            </div>
          )}

          {request.rejectedBy && (
            <div>
              <h5 className="text-sm font-medium">Rejected By:</h5>
              <p className="text-sm text-gray-600">
                {request.rejectedBy} at{' '}
                {request.rejectedAt && new Date(request.rejectedAt).toLocaleString()}
              </p>
              {request.rejectionReason && (
                <p className="text-sm text-red-600 mt-1">
                  Reason: {request.rejectionReason}
                </p>
              )}
            </div>
          )}

          {request.errorMessage && (
            <div>
              <h5 className="text-sm font-medium text-red-600">Error:</h5>
              <p className="text-sm text-red-600">{request.errorMessage}</p>
            </div>
          )}

          {request.rollbackResult && (
            <div>
              <h5 className="text-sm font-medium">Result:</h5>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-24">
                {JSON.stringify(request.rollbackResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RollbackManagementUI;
