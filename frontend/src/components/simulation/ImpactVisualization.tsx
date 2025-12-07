/**
 * Impact Visualization Component (T179)
 * Visualizes simulation results and impact analysis
 */

import React, { useState } from 'react';
import { useSimulation, useSimulationStatus, type QuantifiedImpact } from '../../hooks/useSimulations';
import { MitigationPanel } from './MitigationPanel';

interface ImpactVisualizationProps {
  organizationId: string;
  simulationId: string;
  onClose: () => void;
}

export function ImpactVisualization({
  organizationId,
  simulationId,
  onClose,
}: ImpactVisualizationProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'financial' | 'risk' | 'mitigation'>('summary');

  const { data: simulation, isLoading } = useSimulation(organizationId, simulationId);
  const { data: status } = useSimulationStatus(organizationId, simulationId, 2000);

  // Handle loading and processing states
  if (isLoading || (status?.status === 'pending' || status?.status === 'processing')) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <h2 className="text-xl font-semibold text-gray-900 mt-6">Running Simulation...</h2>
          <p className="text-gray-600 mt-2">{status?.statusMessage || 'Analyzing impact'}</p>
          {status?.progress !== undefined && (
            <div className="mt-6 max-w-xs mx-auto">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
              <div className="text-sm text-gray-500 mt-1">{status.progress}% complete</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Handle error or not found
  if (!simulation || status?.status === 'failed') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Simulation Failed</h2>
          <p className="text-gray-600 mt-2">{status?.error || 'An error occurred'}</p>
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const results = simulation.results;
  const quantified = results?.quantified as QuantifiedImpact | undefined;

  // Get impact color
  const getImpactColor = (level: string) => {
    switch (level) {
      case 'minimal': return 'text-green-600 bg-green-100';
      case 'moderate': return 'text-blue-600 bg-blue-100';
      case 'significant': return 'text-yellow-600 bg-yellow-100';
      case 'major': return 'text-orange-600 bg-orange-100';
      case 'transformational': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-blue-600';
    if (score >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{simulation.name}</h2>
              <p className="text-gray-600 mt-1">{simulation.description}</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Summary Stats */}
          {quantified && (
            <div className="grid grid-cols-4 gap-4 mt-6">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className={`text-3xl font-bold ${getScoreColor(quantified.summary.overallScore)}`}>
                  {quantified.summary.overallScore}
                </div>
                <div className="text-sm text-gray-600 mt-1">Overall Score</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getImpactColor(quantified.summary.impactLevel)}`}>
                  {quantified.summary.impactLevel}
                </span>
                <div className="text-sm text-gray-600 mt-2">Impact Level</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className={`text-3xl font-bold ${quantified.summary.netBenefit ? 'text-green-600' : 'text-red-600'}`}>
                  {quantified.summary.netBenefit ? '+' : '-'}
                </div>
                <div className="text-sm text-gray-600 mt-1">Net Benefit</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {quantified.summary.confidenceLevel}%
                </div>
                <div className="text-sm text-gray-600 mt-1">Confidence</div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex gap-6">
            {(['summary', 'financial', 'risk', 'mitigation'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'summary' && quantified && (
            <div className="space-y-6">
              {/* Key Takeaway */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Key Takeaway</h3>
                <p className="text-blue-800">{quantified.summary.keyTakeaway}</p>
              </div>

              {/* Timeline */}
              {quantified.timeline && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Implementation Timeline</h3>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="text-2xl font-bold text-gray-900">
                      {quantified.timeline.totalDuration}
                    </div>
                    <div className="text-gray-600">days total</div>
                  </div>
                  <div className="space-y-2">
                    {quantified.timeline.phases.map((phase, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{phase.name}</div>
                          <div className="text-sm text-gray-500">{phase.duration} days</div>
                        </div>
                        <div className="h-2 flex-1 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${(phase.duration / quantified.timeline.totalDuration) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Operational Impact */}
              {quantified.operational && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Operational Impact</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Short-term Productivity</div>
                      <div className={`text-2xl font-bold ${quantified.operational.productivity.shortTermChange < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {quantified.operational.productivity.shortTermChange > 0 ? '+' : ''}{quantified.operational.productivity.shortTermChange}%
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Long-term Productivity</div>
                      <div className={`text-2xl font-bold ${quantified.operational.productivity.longTermChange < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {quantified.operational.productivity.longTermChange > 0 ? '+' : ''}{quantified.operational.productivity.longTermChange}%
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Transition Period</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {quantified.operational.productivity.transitionPeriod} days
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {quantified.recommendations && quantified.recommendations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Recommendations</h3>
                  <div className="space-y-3">
                    {quantified.recommendations.slice(0, 5).map((rec, i) => (
                      <div
                        key={i}
                        className={`p-4 rounded-lg border ${
                          rec.priority === 'critical' ? 'border-red-200 bg-red-50' :
                          rec.priority === 'high' ? 'border-orange-200 bg-orange-50' :
                          'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            rec.priority === 'critical' ? 'bg-red-200 text-red-700' :
                            rec.priority === 'high' ? 'bg-orange-200 text-orange-700' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {rec.priority}
                          </span>
                          <div>
                            <div className="font-medium text-gray-900">{rec.recommendation}</div>
                            <p className="text-sm text-gray-600 mt-1">{rec.rationale}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'financial' && quantified?.financial && (
            <div className="space-y-6">
              {/* Net Impact */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">One-Time Costs</h3>
                  <div className="text-3xl font-bold text-red-600">
                    -{quantified.financial.currency} {quantified.financial.oneTimeCosts.total.toLocaleString()}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Implementation, training, and transition costs
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">5-Year Net Impact</h3>
                  <div className={`text-3xl font-bold ${quantified.financial.netFinancialImpact.fiveYear >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {quantified.financial.netFinancialImpact.fiveYear >= 0 ? '+' : ''}{quantified.financial.currency} {quantified.financial.netFinancialImpact.fiveYear.toLocaleString()}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Projected cumulative financial impact
                  </p>
                </div>
              </div>

              {/* ROI Metrics */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Return on Investment</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Simple ROI</div>
                    <div className={`text-2xl font-bold ${quantified.financial.roi.simple >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {quantified.financial.roi.simple}%
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-500">Payback Period</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {quantified.financial.roi.paybackMonths} months
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-sm text-gray-500">NPV (3-year)</div>
                    <div className={`text-2xl font-bold ${quantified.financial.roi.npv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {quantified.financial.currency} {quantified.financial.roi.npv.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Year by Year */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Year-by-Year Impact</h3>
                <div className="flex items-end gap-4 h-48">
                  {['yearOne', 'yearTwo', 'yearThree'].map((year, i) => {
                    const value = quantified.financial.netFinancialImpact[year as keyof typeof quantified.financial.netFinancialImpact];
                    const maxValue = Math.max(
                      Math.abs(quantified.financial.netFinancialImpact.yearOne),
                      Math.abs(quantified.financial.netFinancialImpact.yearTwo),
                      Math.abs(quantified.financial.netFinancialImpact.yearThree)
                    );
                    const height = (Math.abs(value) / maxValue) * 100;
                    const isPositive = value >= 0;

                    return (
                      <div key={year} className="flex-1 flex flex-col items-center">
                        <div
                          className={`w-full rounded-t ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ height: `${height}%` }}
                        />
                        <div className="mt-2 text-center">
                          <div className={`font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {isPositive ? '+' : ''}{quantified.financial.currency} {(value / 1000).toFixed(0)}K
                          </div>
                          <div className="text-xs text-gray-500">Year {i + 1}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'risk' && quantified?.risk && (
            <div className="space-y-6">
              {/* Overall Risk */}
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Overall Risk Score</h3>
                    <p className="text-sm text-gray-500 mt-1">Combined assessment of all risk factors</p>
                  </div>
                  <div className={`text-4xl font-bold ${
                    quantified.risk.overallRiskScore < 30 ? 'text-green-600' :
                    quantified.risk.overallRiskScore < 60 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {quantified.risk.overallRiskScore}
                  </div>
                </div>
                <div className="mt-4 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      quantified.risk.overallRiskScore < 30 ? 'bg-green-500' :
                      quantified.risk.overallRiskScore < 60 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${quantified.risk.overallRiskScore}%` }}
                  />
                </div>
              </div>

              {/* Top Risks */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Top Risks</h3>
                <div className="space-y-3">
                  {quantified.risk.topRisks.map((risk, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{risk.risk}</div>
                          <div className="text-sm text-gray-500 mt-1">{risk.category}</div>
                        </div>
                        <div className={`text-lg font-bold ${
                          risk.score < 30 ? 'text-green-600' :
                          risk.score < 60 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {risk.score}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-sm">
                          <span className="text-gray-500">Mitigation:</span>
                          <span className="text-gray-700 ml-1">{risk.mitigation}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mitigation' && results?.mitigation && (
            <MitigationPanel mitigation={results.mitigation} />
          )}
        </div>
      </div>
    </div>
  );
}

export default ImpactVisualization;
