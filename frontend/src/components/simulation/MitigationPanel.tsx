/**
 * Mitigation Panel Component (T180)
 * Displays mitigation recommendations for simulated changes
 */

import React, { useState } from 'react';
import type { MitigationPlan } from '../../hooks/useSimulations';

interface MitigationPanelProps {
  mitigation: MitigationPlan;
}

export function MitigationPanel({ mitigation }: MitigationPanelProps) {
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<number>(0);

  // Toggle expanded risk
  const toggleRisk = (riskId: string) => {
    setExpandedRisk(expandedRisk === riskId ? null : riskId);
  };

  // Get approach color
  const getApproachColor = (approach: string) => {
    switch (approach) {
      case 'accept': return 'bg-green-100 text-green-700';
      case 'mitigate': return 'bg-blue-100 text-blue-700';
      case 'transfer': return 'bg-purple-100 text-purple-700';
      case 'avoid': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Strategy */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Recommended Strategy</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getApproachColor(mitigation.overallStrategy.approach)}`}>
                {mitigation.overallStrategy.approach}
              </span>
            </div>
            <p className="text-gray-700">{mitigation.overallStrategy.rationale}</p>
          </div>
          <div className="text-right ml-6">
            <div className="text-sm text-gray-500">Estimated Cost</div>
            <div className="text-xl font-bold text-gray-900">
              €{mitigation.overallStrategy.estimatedCost.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Key Principles */}
        <div className="mt-4 pt-4 border-t border-blue-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Key Principles</h4>
          <div className="flex flex-wrap gap-2">
            {mitigation.overallStrategy.keyPrinciples.map((principle, i) => (
              <span key={i} className="px-3 py-1 bg-white rounded-full text-sm text-gray-700 border border-gray-200">
                {principle}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Risk Mitigations */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Mitigation Strategies</h3>
        <div className="space-y-3">
          {mitigation.riskMitigations.map((risk) => (
            <div
              key={risk.riskId}
              className={`border rounded-lg transition-all ${getSeverityColor(risk.severity)}`}
            >
              {/* Risk Header */}
              <button
                onClick={() => toggleRisk(risk.riskId)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded capitalize ${getSeverityColor(risk.severity)}`}>
                    {risk.severity}
                  </span>
                  <span className="font-medium text-gray-900">{risk.riskDescription}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Score</div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-red-600">{risk.currentScore}</span>
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      <span className="font-medium text-green-600">{risk.targetScore}</span>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${expandedRisk === risk.riskId ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Strategies */}
              {expandedRisk === risk.riskId && (
                <div className="px-4 pb-4 border-t border-gray-200 bg-white">
                  <div className="pt-4 space-y-3">
                    {risk.strategies.map((strategy, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className={`px-2 py-1 text-xs font-medium rounded ${
                          strategy.type === 'preventive' ? 'bg-blue-100 text-blue-700' :
                          strategy.type === 'detective' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {strategy.type}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{strategy.strategy}</div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <span>Effectiveness: {strategy.effectiveness}%</span>
                            <span>Cost: €{strategy.cost.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Implementation Timeline */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Implementation Timeline</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="text-2xl font-bold text-gray-900">
              {mitigation.timeline.totalDuration} days
            </div>
            <div className="text-sm text-gray-500">Total Duration</div>
          </div>

          {/* Phase Selector */}
          <div className="flex gap-2 mb-6">
            {mitigation.timeline.phases.map((phase, i) => (
              <button
                key={i}
                onClick={() => setActivePhase(i)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  activePhase === i
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {phase.name}
              </button>
            ))}
          </div>

          {/* Phase Details */}
          {mitigation.timeline.phases[activePhase] && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-900">
                  {mitigation.timeline.phases[activePhase].name}
                </h4>
                <span className="text-sm text-gray-500">
                  {mitigation.timeline.phases[activePhase].duration} days
                </span>
              </div>
              <ul className="space-y-2">
                {mitigation.timeline.phases[activePhase].activities.map((activity, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-700">{activity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timeline Visual */}
          <div className="mt-6">
            <div className="flex items-center">
              {mitigation.timeline.phases.map((phase, i) => {
                const width = (phase.duration / mitigation.timeline.totalDuration) * 100;
                return (
                  <div
                    key={i}
                    className={`h-3 ${i === 0 ? 'rounded-l-full' : ''} ${i === mitigation.timeline.phases.length - 1 ? 'rounded-r-full' : ''} ${
                      activePhase === i ? 'bg-blue-600' : 'bg-blue-200'
                    }`}
                    style={{ width: `${width}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>Day 0</span>
              <span>Day {mitigation.timeline.totalDuration}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h4 className="font-medium text-blue-900 mb-3">Recommended Next Steps</h4>
        <div className="grid grid-cols-2 gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Report
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Schedule Review
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Assign Owners
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Create Tasks
          </button>
        </div>
      </div>
    </div>
  );
}

export default MitigationPanel;
