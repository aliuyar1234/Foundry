/**
 * BMD Import Status Component (T160)
 * Displays import progress, records processed by type, errors, and success summary
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface BmdImportStatusProps {
  status: ImportStatus;
  progress?: ImportProgress;
  errors?: ImportError[];
  summary?: ImportSummary;
  onRetry?: () => void;
  onClose?: () => void;
}

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ImportProgress {
  currentStep: string;
  percentage: number;
  recordsProcessed: number;
  totalRecords: number;
  byType: RecordTypeProgress[];
}

export interface RecordTypeProgress {
  type: string;
  label: string;
  processed: number;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface ImportError {
  id: string;
  type: 'validation' | 'mapping' | 'system';
  severity: 'error' | 'warning';
  message: string;
  details?: string;
  recordNumber?: number;
  accountNumber?: string;
}

export interface ImportSummary {
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  warnings: number;
  duration: number; // in seconds
  byType: {
    type: string;
    label: string;
    count: number;
  }[];
}

export function BmdImportStatus({
  status,
  progress,
  errors = [],
  summary,
  onRetry,
  onClose,
}: BmdImportStatusProps) {
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusIcon = (status: ImportStatus) => {
    switch (status) {
      case 'processing':
        return (
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full" />
        );
      case 'completed':
        return (
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        );
      case 'failed':
        return (
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (
    itemStatus: 'pending' | 'processing' | 'completed' | 'error'
  ) => {
    switch (itemStatus) {
      case 'pending':
        return <Badge variant="secondary">Ausstehend</Badge>;
      case 'processing':
        return <Badge variant="info">Verarbeitung...</Badge>;
      case 'completed':
        return <Badge variant="success">Abgeschlossen</Badge>;
      case 'error':
        return <Badge variant="destructive">Fehler</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">{getStatusIcon(status)}</div>

        {status === 'processing' && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Import läuft...
            </h3>
            <p className="text-sm text-gray-500">
              {progress?.currentStep || 'Daten werden verarbeitet'}
            </p>
          </div>
        )}

        {status === 'completed' && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Import erfolgreich abgeschlossen!
            </h3>
            <p className="text-sm text-gray-500">
              {summary?.successfulRecords || 0} von {summary?.totalRecords || 0}{' '}
              Datensätzen erfolgreich importiert
            </p>
          </div>
        )}

        {status === 'failed' && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Import fehlgeschlagen</h3>
            <p className="text-sm text-red-600">
              Der Import konnte nicht abgeschlossen werden
            </p>
          </div>
        )}
      </div>

      {/* Progress Details */}
      {status === 'processing' && progress && (
        <div className="space-y-4">
          {/* Overall Progress Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-700">Fortschritt</span>
              <span className="font-medium text-gray-900">
                {progress.percentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1 text-right">
              {progress.recordsProcessed} / {progress.totalRecords} Datensätze
            </div>
          </div>

          {/* Record Type Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Verarbeitung nach Typ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {progress.byType.map((item) => (
                <div key={item.type}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        {item.label}
                      </span>
                      {getStatusBadge(item.status)}
                    </div>
                    <span className="text-sm text-gray-600">
                      {item.processed} / {item.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        item.status === 'error'
                          ? 'bg-red-500'
                          : item.status === 'completed'
                            ? 'bg-green-500'
                            : 'bg-blue-500'
                      }`}
                      style={{
                        width: `${item.total > 0 ? (item.processed / item.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Success Summary */}
      {status === 'completed' && summary && (
        <div className="space-y-4">
          {/* Statistics Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {summary.totalRecords}
                </div>
                <div className="text-xs text-gray-500 mt-1">Gesamt</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {summary.successfulRecords}
                </div>
                <div className="text-xs text-gray-500 mt-1">Erfolgreich</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {summary.failedRecords}
                </div>
                <div className="text-xs text-gray-500 mt-1">Fehler</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {summary.warnings}
                </div>
                <div className="text-xs text-gray-500 mt-1">Warnungen</div>
              </CardContent>
            </Card>
          </div>

          {/* Records by Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Importierte Datensätze nach Typ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.byType.map((item) => (
                  <div
                    key={item.type}
                    className="flex items-center justify-between py-2 border-b last:border-b-0"
                  >
                    <span className="text-sm text-gray-700">{item.label}</span>
                    <Badge variant="secondary">{item.count} Datensätze</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Duration */}
          <div className="text-center text-sm text-gray-500">
            Import abgeschlossen in {formatDuration(summary.duration)}
          </div>
        </div>
      )}

      {/* Error Display */}
      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              <span>
                Fehler und Warnungen ({errors.length})
              </span>
              <Badge variant="destructive">
                {errors.filter((e) => e.severity === 'error').length} Fehler
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {errors.map((error) => (
                <div
                  key={error.id}
                  className={`p-3 rounded-lg border ${
                    error.severity === 'error'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          error.severity === 'error' ? 'destructive' : 'warning'
                        }
                      >
                        {error.type === 'validation'
                          ? 'Validierung'
                          : error.type === 'mapping'
                            ? 'Zuordnung'
                            : 'System'}
                      </Badge>
                      {error.recordNumber && (
                        <span className="text-xs text-gray-500">
                          Zeile {error.recordNumber}
                        </span>
                      )}
                      {error.accountNumber && (
                        <span className="text-xs text-gray-500">
                          Konto {error.accountNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    className={`text-sm font-medium ${
                      error.severity === 'error' ? 'text-red-800' : 'text-yellow-800'
                    }`}
                  >
                    {error.message}
                  </p>
                  {error.details && (
                    <p
                      className={`text-xs mt-1 ${
                        error.severity === 'error' ? 'text-red-700' : 'text-yellow-700'
                      }`}
                    >
                      {error.details}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {(status === 'completed' || status === 'failed') && (
        <div className="flex justify-center gap-3">
          {status === 'failed' && onRetry && (
            <Button onClick={onRetry} variant="default">
              Erneut versuchen
            </Button>
          )}
          {onClose && (
            <Button onClick={onClose} variant={status === 'failed' ? 'outline' : 'default'}>
              Schließen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default BmdImportStatus;
