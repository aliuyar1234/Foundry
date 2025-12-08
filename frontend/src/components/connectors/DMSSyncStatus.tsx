/**
 * DMS Sync Status
 * T182: Display sync status for DMS systems
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  FileText,
  AlertCircle,
  TrendingUp,
  Calendar,
  Zap,
} from 'lucide-react';

export interface SyncError {
  id: string;
  timestamp: Date;
  message: string;
  severity: 'error' | 'warning';
  documentId?: string;
  documentName?: string;
}

export interface SyncStats {
  totalDocuments: number;
  syncedDocuments: number;
  failedDocuments: number;
  workflowsTracked?: number;
  lastSyncTime?: Date;
  nextSyncTime?: Date;
  syncDuration?: number; // in seconds
}

export interface DMSConnection {
  id: string;
  name: string;
  type: 'docuware' | 'mfiles';
  status: 'connected' | 'syncing' | 'error' | 'paused';
  stats: SyncStats;
  errors: SyncError[];
  connectedAt: Date;
}

interface DMSSyncStatusProps {
  connection: DMSConnection;
  onSync?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onViewErrors?: () => void;
  onDisconnect?: () => void;
  isSyncing?: boolean;
}

export function DMSSyncStatus({
  connection,
  onSync,
  onPause,
  onResume,
  onViewErrors,
  onDisconnect,
  isSyncing = false,
}: DMSSyncStatusProps) {
  const { name, type, status, stats, errors } = connection;

  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Connected
          </Badge>
        );
      case 'syncing':
        return (
          <Badge variant="info" className="flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Syncing
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Error
          </Badge>
        );
      case 'paused':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Paused
          </Badge>
        );
    }
  };

  const getSystemLabel = () => {
    return type === 'docuware' ? 'DocuWare' : 'M-Files';
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDateTime = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const calculateSyncProgress = (): number => {
    if (stats.totalDocuments === 0) return 0;
    return Math.round((stats.syncedDocuments / stats.totalDocuments) * 100);
  };

  const syncProgress = calculateSyncProgress();
  const hasErrors = errors.length > 0;
  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl">{name}</CardTitle>
              {getStatusBadge()}
            </div>
            <CardDescription className="mt-1">
              {getSystemLabel()} • Connected{' '}
              {new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }).format(connection.connectedAt)}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {status === 'paused' && onResume && (
              <Button size="sm" onClick={onResume}>
                Resume
              </Button>
            )}
            {status !== 'paused' && onPause && (
              <Button size="sm" variant="outline" onClick={onPause}>
                Pause
              </Button>
            )}
            {onSync && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSync}
                disabled={isSyncing || status === 'syncing'}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync Now
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Sync Progress */}
        {status === 'syncing' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Sync Progress</span>
              <span className="text-gray-600">{syncProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {stats.syncedDocuments.toLocaleString()} of{' '}
              {stats.totalDocuments.toLocaleString()} documents
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
              <FileText className="w-4 h-4" />
              <span>Documents Synced</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.syncedDocuments.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              of {stats.totalDocuments.toLocaleString()} total
            </div>
          </div>

          {stats.workflowsTracked !== undefined && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
                <Zap className="w-4 h-4" />
                <span>Workflows Tracked</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {stats.workflowsTracked.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">Active processes</div>
            </div>
          )}

          {stats.failedDocuments > 0 && (
            <div className="bg-red-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
                <XCircle className="w-4 h-4" />
                <span>Failed</span>
              </div>
              <div className="text-2xl font-bold text-red-900">
                {stats.failedDocuments.toLocaleString()}
              </div>
              <div className="text-xs text-red-600 mt-1">Sync errors</div>
            </div>
          )}

          {stats.lastSyncTime && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
                <Calendar className="w-4 h-4" />
                <span>Last Sync</span>
              </div>
              <div className="text-sm font-bold text-gray-900">
                {formatDateTime(stats.lastSyncTime)}
              </div>
              {stats.syncDuration && (
                <div className="text-xs text-gray-500 mt-1">
                  {formatDuration(stats.syncDuration)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Next Sync */}
        {stats.nextSyncTime && status === 'connected' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <TrendingUp className="w-4 h-4" />
              <span>
                Next automatic sync scheduled for{' '}
                <strong>{formatDateTime(stats.nextSyncTime)}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Errors Section */}
        {hasErrors && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                Recent Issues
              </h4>
              {onViewErrors && (
                <Button size="sm" variant="ghost" onClick={onViewErrors}>
                  View All
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {errors.slice(0, 3).map((error) => (
                <div
                  key={error.id}
                  className={`p-3 rounded-lg border ${
                    error.severity === 'error'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${
                          error.severity === 'error' ? 'text-red-900' : 'text-yellow-900'
                        }`}
                      >
                        {error.message}
                      </p>
                      {error.documentName && (
                        <p className="text-xs text-gray-600 mt-1">
                          Document: {error.documentName}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTime(error.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {errors.length > 3 && (
              <p className="text-xs text-gray-500 text-center">
                {errorCount > 0 && `${errorCount} error(s)`}
                {errorCount > 0 && warningCount > 0 && ' and '}
                {warningCount > 0 && `${warningCount} warning(s)`} total
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
          <div className="text-xs text-gray-500">
            Connection ID: {connection.id.substring(0, 8)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Mock data generator for testing
export function generateMockDMSConnection(
  type: 'docuware' | 'mfiles',
  status: DMSConnection['status'] = 'connected'
): DMSConnection {
  const now = new Date();
  const lastSync = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago
  const nextSync = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
  const connectedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

  const mockErrors: SyncError[] =
    status === 'error'
      ? [
          {
            id: 'err1',
            timestamp: new Date(now.getTime() - 10 * 60 * 1000),
            message: 'Failed to sync document: Permission denied',
            severity: 'error',
            documentId: 'doc123',
            documentName: 'Invoice_2024_001.pdf',
          },
          {
            id: 'err2',
            timestamp: new Date(now.getTime() - 5 * 60 * 1000),
            message: 'Document metadata incomplete',
            severity: 'warning',
            documentId: 'doc124',
            documentName: 'Contract_ABC.docx',
          },
        ]
      : [];

  return {
    id: `conn_${Math.random().toString(36).substring(7)}`,
    name: type === 'docuware' ? 'Production DocuWare' : 'Production M-Files',
    type,
    status,
    stats: {
      totalDocuments: 5420,
      syncedDocuments: status === 'error' ? 5100 : 5420,
      failedDocuments: status === 'error' ? 320 : 0,
      workflowsTracked: type === 'docuware' ? 45 : undefined,
      lastSyncTime: lastSync,
      nextSyncTime: status === 'connected' ? nextSync : undefined,
      syncDuration: 125,
    },
    errors: mockErrors,
    connectedAt,
  };
}

export default DMSSyncStatus;
