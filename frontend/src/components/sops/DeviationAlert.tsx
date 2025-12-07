/**
 * Deviation Alert Component
 * Displays SOP deviation alerts with severity indicators
 */

import React, { useState } from 'react';
import type { DeviationReport, Deviation } from '../../hooks/useSOPs';

interface DeviationAlertProps {
  report: DeviationReport;
  onDismiss?: () => void;
  onViewDetails?: () => void;
  compact?: boolean;
}

// Severity configuration
const SEVERITY_CONFIG = {
  critical: {
    icon: '!',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-300',
    label: 'Critical',
  },
  high: {
    icon: '!',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-300',
    label: 'High',
  },
  medium: {
    icon: '!',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    borderColor: 'border-yellow-300',
    label: 'Medium',
  },
  low: {
    icon: 'i',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-300',
    label: 'Low',
  },
};

export function DeviationAlert({ report, onDismiss, onViewDetails, compact = false }: DeviationAlertProps) {
  const [expanded, setExpanded] = useState(!compact);
  const [selectedDeviation, setSelectedDeviation] = useState<Deviation | null>(null);

  const hasCritical = report.summary.criticalDeviations > 0;
  const highestSeverity = hasCritical
    ? 'critical'
    : report.summary.bySeverity.high > 0
    ? 'high'
    : report.summary.bySeverity.medium > 0
    ? 'medium'
    : 'low';

  const config = SEVERITY_CONFIG[highestSeverity];

  // Compact view
  if (compact && !expanded) {
    return (
      <div
        className={`flex items-center gap-3 p-3 rounded-lg border ${config.bgColor} ${config.borderColor} cursor-pointer hover:shadow-sm transition-shadow`}
        onClick={() => setExpanded(true)}
      >
        <div className={`w-8 h-8 rounded-full ${config.bgColor} flex items-center justify-center`}>
          <span className={`font-bold ${config.color}`}>{report.summary.totalDeviations}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${config.color} truncate`}>
            {report.summary.totalDeviations} deviation{report.summary.totalDeviations !== 1 ? 's' : ''} detected
          </p>
          <p className="text-sm text-gray-600 truncate">{report.sopTitle}</p>
        </div>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${config.borderColor} overflow-hidden`}>
      {/* Header */}
      <div className={`${config.bgColor} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full ${
                hasCritical ? 'bg-red-500' : 'bg-orange-500'
              } flex items-center justify-center`}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h3 className={`font-semibold ${config.color}`}>
                Process Deviations Detected
              </h3>
              <p className="text-sm text-gray-600">
                {report.sopTitle} - {report.processName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onViewDetails && (
              <button
                onClick={onViewDetails}
                className="px-3 py-1 text-sm bg-white rounded-lg hover:bg-gray-50 transition-colors"
              >
                View Details
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-white/50 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{report.summary.totalDeviations}</div>
            <div className="text-xs text-gray-600">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {report.summary.criticalDeviations}
            </div>
            <div className="text-xs text-gray-600">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(report.complianceScore * 100)}%
            </div>
            <div className="text-xs text-gray-600">Compliance</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {Object.keys(report.summary.byType).length}
            </div>
            <div className="text-xs text-gray-600">Types</div>
          </div>
        </div>
      </div>

      {/* Deviations List */}
      <div className="bg-white">
        <div className="px-4 py-3 border-b border-gray-100">
          <h4 className="font-medium text-gray-900">Deviations</h4>
        </div>
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {report.deviations.map((deviation) => (
            <DeviationItem
              key={deviation.id}
              deviation={deviation}
              isSelected={selectedDeviation?.id === deviation.id}
              onSelect={() =>
                setSelectedDeviation(
                  selectedDeviation?.id === deviation.id ? null : deviation
                )
              }
            />
          ))}
        </div>

        {/* Selected Deviation Details */}
        {selectedDeviation && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-start justify-between mb-3">
              <h5 className="font-medium text-gray-900">Deviation Details</h5>
              <button
                onClick={() => setSelectedDeviation(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Expected:</span>
                <p className="text-gray-900 mt-0.5">{selectedDeviation.expectedBehavior}</p>
              </div>
              <div>
                <span className="text-gray-500">Actual:</span>
                <p className="text-gray-900 mt-0.5">{selectedDeviation.actualBehavior}</p>
              </div>
              <div>
                <span className="text-gray-500">Impact:</span>
                <p className="text-gray-900 mt-0.5">{selectedDeviation.impact}</p>
              </div>
              {selectedDeviation.suggestedAction && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-blue-700 font-medium">Suggested Action:</span>
                  <p className="text-blue-600 mt-0.5">{selectedDeviation.suggestedAction}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {report.recommendations.length > 0 && (
          <div className="p-4 border-t border-gray-200">
            <h4 className="font-medium text-gray-900 mb-3">Recommendations</h4>
            <ul className="space-y-2">
              {report.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Deviation Item Component
interface DeviationItemProps {
  deviation: Deviation;
  isSelected: boolean;
  onSelect: () => void;
}

function DeviationItem({ deviation, isSelected, onSelect }: DeviationItemProps) {
  const config = SEVERITY_CONFIG[deviation.severity];

  return (
    <div
      className={`p-3 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-6 h-6 rounded-full ${config.bgColor} flex items-center justify-center flex-shrink-0`}
        >
          <span className={`text-xs font-bold ${config.color}`}>{config.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
            <span className="text-xs text-gray-500 capitalize">{deviation.type}</span>
            <span className="text-xs text-gray-400">|</span>
            <span className="text-xs text-gray-500">{deviation.category}</span>
          </div>
          <p className="text-sm text-gray-900 mt-1">{deviation.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span>Frequency: {deviation.frequency}x</span>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isSelected ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

// Compact Summary Card
interface DeviationSummaryCardProps {
  report: DeviationReport;
  onClick?: () => void;
}

export function DeviationSummaryCard({ report, onClick }: DeviationSummaryCardProps) {
  const hasCritical = report.summary.criticalDeviations > 0;

  return (
    <div
      className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
        hasCritical
          ? 'border-red-200 bg-red-50'
          : report.summary.bySeverity.high > 0
          ? 'border-orange-200 bg-orange-50'
          : 'border-yellow-200 bg-yellow-50'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              hasCritical ? 'bg-red-500' : 'bg-orange-500'
            }`}
          >
            <span className="text-xl font-bold text-white">{report.summary.totalDeviations}</span>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">{report.sopTitle}</h4>
            <p className="text-sm text-gray-600">{report.processName}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {Math.round(report.complianceScore * 100)}%
          </div>
          <div className="text-xs text-gray-500">Compliance</div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4">
        {Object.entries(report.summary.bySeverity).map(([severity, count]) => {
          if (count === 0) return null;
          const cfg = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
          return (
            <span key={severity} className={`text-xs font-medium px-2 py-1 rounded ${cfg.bgColor} ${cfg.color}`}>
              {count} {cfg.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default DeviationAlert;
