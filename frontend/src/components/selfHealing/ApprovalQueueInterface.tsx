/**
 * Approval Queue Interface Component
 * T159 - Create approval queue interface
 *
 * Displays pending approvals and allows users to approve/reject actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

// =============================================================================
// Types
// =============================================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated';

export interface ApprovalRequest {
  id: string;
  actionId: string;
  actionName: string;
  actionType: string;
  executionId: string;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt: string;
  requestedBy: string;
  assignedTo?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  patternId?: string;
  patternDescription?: string;
  patternSeverity?: string;
  actionConfig: Record<string, unknown>;
  safetyChecks?: {
    name: string;
    passed: boolean;
    message?: string;
  }[];
  impactSummary?: {
    affectedEntities: number;
    estimatedDuration: string;
    rollbackable: boolean;
  };
  escalationLevel: number;
  escalationHistory: Array<{
    level: number;
    escalatedAt: string;
    escalatedTo: string;
  }>;
}

export interface ApprovalStatistics {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  expiredToday: number;
  avgApprovalTimeMinutes: number;
  byPriority: Record<string, number>;
}

interface ApprovalQueueInterfaceProps {
  organizationId: string;
  userId?: string;
  onApprove?: (requestId: string) => void;
  onReject?: (requestId: string, reason: string) => void;
  showOnlyAssigned?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function ApprovalQueueInterface({
  organizationId,
  userId,
  onApprove,
  onReject,
  showOnlyAssigned = false,
}: ApprovalQueueInterfaceProps) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [statistics, setStatistics] = useState<ApprovalStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch pending approvals
  const fetchApprovals = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (showOnlyAssigned && userId) {
        params.append('assignedTo', userId);
      }

      const response = await fetch(
        `/api/self-healing/approvals/pending?${params.toString()}`,
        {
          headers: {
            'X-Organization-Id': organizationId,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
        setStatistics(data.statistics || null);
      }
    } catch (error) {
      console.error('Failed to fetch approval requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, userId, showOnlyAssigned]);

  useEffect(() => {
    fetchApprovals();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchApprovals, 30000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  // Handle approval
  const handleApprove = async (requestId: string) => {
    try {
      const response = await fetch(
        `/api/self-healing/approvals/${requestId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Organization-Id': organizationId,
          },
          body: JSON.stringify({ approvedBy: userId }),
        }
      );

      if (response.ok) {
        onApprove?.(requestId);
        fetchApprovals();
      }
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };

  // Handle rejection
  const handleReject = async (requestId: string) => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      const response = await fetch(
        `/api/self-healing/approvals/${requestId}/reject`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Organization-Id': organizationId,
          },
          body: JSON.stringify({
            rejectedBy: userId,
            reason: rejectReason,
          }),
        }
      );

      if (response.ok) {
        onReject?.(requestId, rejectReason);
        setRejectDialogId(null);
        setRejectReason('');
        fetchApprovals();
      }
    } catch (error) {
      console.error('Rejection failed:', error);
    }
  };

  // Filter requests
  const filteredRequests = requests.filter((r) => {
    if (selectedPriority && r.priority !== selectedPriority) return false;
    return true;
  });

  // Sort by priority and expiration
  const sortedRequests = [...filteredRequests].sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff =
      priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
  });

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  const actionTypeLabels: Record<string, string> = {
    send_reminder: 'Send Reminder',
    escalate: 'Escalate',
    retry_operation: 'Retry Operation',
    redistribute_workload: 'Redistribute',
    notify: 'Notify',
    custom: 'Custom',
  };

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
              <div className="text-2xl font-bold text-orange-600">
                {statistics.pending}
              </div>
              <p className="text-sm text-gray-500">Pending Approvals</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {statistics.approvedToday}
              </div>
              <p className="text-sm text-gray-500">Approved Today</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {statistics.rejectedToday}
              </div>
              <p className="text-sm text-gray-500">Rejected Today</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-gray-600">
                {statistics.expiredToday}
              </div>
              <p className="text-sm text-gray-500">Expired Today</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {Math.round(statistics.avgApprovalTimeMinutes)}m
              </div>
              <p className="text-sm text-gray-500">Avg Approval Time</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Approval Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Approval Queue
              {statistics?.pending ? (
                <Badge className="ml-2 bg-orange-100 text-orange-700">
                  {statistics.pending} pending
                </Badge>
              ) : null}
            </CardTitle>
            <Button variant="outline" onClick={fetchApprovals}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Priority Filters */}
          <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b">
            <span className="text-sm font-medium text-gray-500 self-center mr-2">
              Priority:
            </span>
            {['critical', 'high', 'medium', 'low'].map((priority) => (
              <Badge
                key={priority}
                className={`cursor-pointer ${
                  selectedPriority === priority
                    ? priorityColors[priority]
                    : 'bg-gray-100 text-gray-600'
                }`}
                onClick={() =>
                  setSelectedPriority(
                    selectedPriority === priority ? null : priority
                  )
                }
              >
                {priority} ({statistics?.byPriority?.[priority] || 0})
              </Badge>
            ))}

            {selectedPriority && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedPriority(null)}
              >
                Clear Filter
              </Button>
            )}
          </div>

          {/* Request List */}
          {sortedRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">No pending approvals</p>
              <p className="text-sm">All caught up! Check back later.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedRequests.map((request) => (
                <ApprovalCard
                  key={request.id}
                  request={request}
                  priorityColors={priorityColors}
                  actionTypeLabels={actionTypeLabels}
                  isExpanded={expandedId === request.id}
                  onToggleExpand={() =>
                    setExpandedId(expandedId === request.id ? null : request.id)
                  }
                  onApprove={() => handleApprove(request.id)}
                  onReject={() => setRejectDialogId(request.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rejection Dialog */}
      {rejectDialogId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Reject Approval Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full border rounded p-2 h-24"
                  placeholder="Please explain why this action should not be executed..."
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
                <Button
                  variant="destructive"
                  onClick={() => handleReject(rejectDialogId)}
                >
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
// Approval Card Sub-component
// =============================================================================

interface ApprovalCardProps {
  request: ApprovalRequest;
  priorityColors: Record<string, string>;
  actionTypeLabels: Record<string, string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApprove: () => void;
  onReject: () => void;
}

function ApprovalCard({
  request,
  priorityColors,
  actionTypeLabels,
  isExpanded,
  onToggleExpand,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const getTimeRemaining = () => {
    const now = new Date().getTime();
    const expires = new Date(request.expiresAt).getTime();
    const remaining = expires - now;

    if (remaining < 0) return 'Expired';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const isUrgent =
    new Date(request.expiresAt).getTime() - new Date().getTime() <
    30 * 60 * 1000;

  return (
    <div
      className={`border rounded-lg p-4 ${
        request.priority === 'critical'
          ? 'border-red-300 bg-red-50'
          : request.priority === 'high'
          ? 'border-orange-300 bg-orange-50'
          : isUrgent
          ? 'border-yellow-300 bg-yellow-50'
          : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex-1 cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge className={priorityColors[request.priority]}>
              {request.priority}
            </Badge>
            <Badge variant="outline">
              {actionTypeLabels[request.actionType] || request.actionType}
            </Badge>
            {request.escalationLevel > 0 && (
              <Badge className="bg-purple-100 text-purple-700">
                Escalated L{request.escalationLevel}
              </Badge>
            )}
            {isUrgent && (
              <Badge className="bg-yellow-100 text-yellow-700">⏰ Urgent</Badge>
            )}
          </div>
          <p className="font-medium">{request.actionName}</p>
          <p className="text-sm text-gray-500">
            Requested: {new Date(request.requestedAt).toLocaleString()} |{' '}
            <span className={isUrgent ? 'text-orange-600 font-medium' : ''}>
              {getTimeRemaining()}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              onReject();
            }}
          >
            Reject
          </Button>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
          >
            Approve
          </Button>
          <span
            className="text-gray-400 cursor-pointer"
            onClick={onToggleExpand}
          >
            {isExpanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t space-y-3">
          {/* Pattern Info */}
          {request.patternDescription && (
            <div>
              <h5 className="text-sm font-medium mb-1">Triggered by Pattern:</h5>
              <p className="text-sm text-gray-600">
                {request.patternDescription}
                {request.patternSeverity && (
                  <Badge className="ml-2" variant="outline">
                    {request.patternSeverity}
                  </Badge>
                )}
              </p>
            </div>
          )}

          {/* Impact Summary */}
          {request.impactSummary && (
            <div>
              <h5 className="text-sm font-medium mb-1">Impact Summary:</h5>
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  Affected entities: {request.impactSummary.affectedEntities}
                </p>
                <p>
                  Estimated duration: {request.impactSummary.estimatedDuration}
                </p>
                <p>
                  Rollback:{' '}
                  {request.impactSummary.rollbackable ? (
                    <span className="text-green-600">Available</span>
                  ) : (
                    <span className="text-orange-600">Not available</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Safety Checks */}
          {request.safetyChecks && request.safetyChecks.length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-1">Safety Checks:</h5>
              <div className="space-y-1">
                {request.safetyChecks.map((check, idx) => (
                  <div
                    key={idx}
                    className={`text-sm flex items-center gap-2 ${
                      check.passed ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    <span>{check.passed ? '✓' : '✗'}</span>
                    <span>{check.name}</span>
                    {check.message && (
                      <span className="text-gray-500">- {check.message}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Config */}
          <div>
            <h5 className="text-sm font-medium mb-1">Action Configuration:</h5>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
              {JSON.stringify(request.actionConfig, null, 2)}
            </pre>
          </div>

          {/* Escalation History */}
          {request.escalationHistory.length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-1">Escalation History:</h5>
              <div className="text-sm space-y-1">
                {request.escalationHistory.map((esc, idx) => (
                  <p key={idx} className="text-gray-600">
                    Level {esc.level}: Escalated to {esc.escalatedTo} at{' '}
                    {new Date(esc.escalatedAt).toLocaleString()}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Assignment */}
          {request.assignedTo && (
            <div>
              <h5 className="text-sm font-medium mb-1">Assigned To:</h5>
              <p className="text-sm text-gray-600">{request.assignedTo}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ApprovalQueueInterface;
