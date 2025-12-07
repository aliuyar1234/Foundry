/**
 * Alert List Component
 * T123 - Create alert list component
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { type Alert, acknowledgeAlert, resolveAlert } from '../../services/commandCenterApi';

export interface AlertListProps {
  alerts: Alert[];
  title?: string;
  maxVisible?: number;
  showActions?: boolean;
  onAlertClick?: (alert: Alert) => void;
  onAlertUpdate?: (alert: Alert) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function AlertList({
  alerts,
  title = 'Active Alerts',
  maxVisible = 10,
  showActions = true,
  onAlertClick,
  onAlertUpdate,
  loading = false,
  emptyMessage = 'No active alerts',
}: AlertListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const visibleAlerts = alerts.slice(0, maxVisible);
  const remainingCount = alerts.length - maxVisible;

  const handleAcknowledge = async (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading(alertId);
    try {
      const updated = await acknowledgeAlert(alertId);
      onAlertUpdate?.(updated);
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading(alertId);
    try {
      const updated = await resolveAlert(alertId);
      onAlertUpdate?.(updated);
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const severityConfig = {
    critical: {
      bg: 'bg-red-100',
      border: 'border-red-300',
      text: 'text-red-800',
      icon: '🚨',
      badge: 'bg-red-500',
    },
    error: {
      bg: 'bg-orange-100',
      border: 'border-orange-300',
      text: 'text-orange-800',
      icon: '❌',
      badge: 'bg-orange-500',
    },
    warning: {
      bg: 'bg-yellow-100',
      border: 'border-yellow-300',
      text: 'text-yellow-800',
      icon: '⚠️',
      badge: 'bg-yellow-500',
    },
    info: {
      bg: 'bg-blue-100',
      border: 'border-blue-300',
      text: 'text-blue-800',
      icon: 'ℹ️',
      badge: 'bg-blue-500',
    },
  };

  const statusLabels = {
    active: 'Active',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
    suppressed: 'Suppressed',
  };

  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {title}
            {alerts.length > 0 && (
              <Badge variant="secondary">{alerts.length}</Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleAlerts.map(alert => {
              const config = severityConfig[alert.severity];
              const isExpanded = expandedId === alert.id;

              return (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${config.bg} ${config.border} ${
                    onAlertClick ? 'cursor-pointer hover:shadow-sm' : ''
                  }`}
                  onClick={() => {
                    setExpandedId(isExpanded ? null : alert.id);
                    onAlertClick?.(alert);
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`font-medium ${config.text} truncate`}>
                          {alert.title}
                        </h4>
                        <Badge className={`${config.badge} text-white text-xs`}>
                          {alert.severity}
                        </Badge>
                        {alert.status !== 'active' && (
                          <Badge variant="outline" className="text-xs">
                            {statusLabels[alert.status]}
                          </Badge>
                        )}
                        {alert.priorityRank && (
                          <Badge variant="outline" className="text-xs">
                            #{alert.priorityRank}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {alert.description}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {formatTimeAgo(alert.createdAt)}
                    </span>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div>
                          <span className="text-gray-500">Category:</span>
                          <span className="ml-1 font-medium">{alert.category}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Source:</span>
                          <span className="ml-1 font-medium">{alert.source.name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Affected Users:</span>
                          <span className="ml-1 font-medium">{alert.impact.affectedUsers}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Affected Processes:</span>
                          <span className="ml-1 font-medium">{alert.impact.affectedProcesses}</span>
                        </div>
                        {alert.impact.slaRisk && (
                          <div className="col-span-2">
                            <Badge variant="destructive" className="text-xs">
                              SLA AT RISK
                            </Badge>
                          </div>
                        )}
                      </div>

                      {showActions && alert.status === 'active' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => handleAcknowledge(alert.id, e)}
                            disabled={actionLoading === alert.id}
                          >
                            {actionLoading === alert.id ? 'Loading...' : 'Acknowledge'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => handleResolve(alert.id, e)}
                            disabled={actionLoading === alert.id}
                          >
                            Resolve
                          </Button>
                        </div>
                      )}

                      {showActions && alert.status === 'acknowledged' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={(e) => handleResolve(alert.id, e)}
                            disabled={actionLoading === alert.id}
                          >
                            {actionLoading === alert.id ? 'Loading...' : 'Resolve'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {remainingCount > 0 && (
              <div className="text-center pt-2">
                <Button variant="link" className="text-sm">
                  Show {remainingCount} more alerts
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Alert summary badges for compact display
 */
export function AlertSummaryBadges({
  alerts,
  onClick,
}: {
  alerts: Alert[];
  onClick?: () => void;
}) {
  const counts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    error: alerts.filter(a => a.severity === 'error').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
  };

  return (
    <div
      className={`flex gap-2 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {counts.critical > 0 && (
        <Badge className="bg-red-500 text-white">
          🚨 {counts.critical}
        </Badge>
      )}
      {counts.error > 0 && (
        <Badge className="bg-orange-500 text-white">
          ❌ {counts.error}
        </Badge>
      )}
      {counts.warning > 0 && (
        <Badge className="bg-yellow-500 text-white">
          ⚠️ {counts.warning}
        </Badge>
      )}
      {counts.info > 0 && (
        <Badge className="bg-blue-500 text-white">
          ℹ️ {counts.info}
        </Badge>
      )}
      {alerts.length === 0 && (
        <Badge variant="outline" className="text-green-600">
          ✓ No alerts
        </Badge>
      )}
    </div>
  );
}

export default AlertList;
