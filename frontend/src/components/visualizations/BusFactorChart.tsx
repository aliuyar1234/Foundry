/**
 * Bus Factor Chart Component
 * Visualizes knowledge concentration and single points of failure
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  useBusFactor,
  useSinglePointsOfFailure,
  DomainBusFactor,
  SinglePointOfFailure,
} from '../../hooks/useInsights';

const riskLevelColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  moderate: 'bg-yellow-500',
  low: 'bg-green-500',
};

const riskLevelBadgeColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  moderate: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

interface BusFactorChartProps {
  lookbackDays?: number;
  showDetails?: boolean;
}

export function BusFactorChart({ lookbackDays = 90, showDetails = true }: BusFactorChartProps) {
  const { data: busFactor, isLoading, error } = useBusFactor({ lookbackDays });
  const { data: spofData } = useSinglePointsOfFailure(lookbackDays);

  const singlePointsOfFailure = spofData || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bus Factor Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !busFactor) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Bus Factor Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">Failed to load bus factor data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Score Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Organization Bus Factor</span>
            <Badge className={riskLevelBadgeColors[busFactor.riskLevel]}>
              {busFactor.riskLevel.toUpperCase()} RISK
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={getScoreColor(busFactor.organizationScore)}
                  strokeWidth="10"
                  strokeDasharray={`${(busFactor.organizationScore / 100) * 283} 283`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl font-bold">{busFactor.organizationScore}</div>
                  <div className="text-xs text-gray-500">Score</div>
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {busFactor.criticalDomainsCount}
                </div>
                <div className="text-sm text-gray-600">Critical Domains</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {busFactor.highRiskDomainsCount}
                </div>
                <div className="text-sm text-gray-600">High Risk Domains</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {singlePointsOfFailure.length}
                </div>
                <div className="text-sm text-gray-600">Single Points of Failure</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {busFactor.domainScores?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Knowledge Domains</div>
              </div>
            </div>
          </div>

          {busFactor.recommendations && busFactor.recommendations.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium text-gray-700 mb-2">Key Recommendations:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {busFactor.recommendations.slice(0, 3).map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">&#x2022;</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domain Breakdown */}
      {showDetails && busFactor.domainScores && busFactor.domainScores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Domain Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {busFactor.domainScores
                .sort((a, b) => a.busFactorScore - b.busFactorScore)
                .slice(0, 10)
                .map((domain) => (
                  <DomainRow key={domain.domain} domain={domain} />
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single Points of Failure */}
      {showDetails && singlePointsOfFailure.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Single Points of Failure</span>
              <Badge variant="outline" className="bg-red-50 text-red-700">
                {singlePointsOfFailure.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {singlePointsOfFailure.map((spof) => (
                <SPOFRow key={spof.personId} spof={spof} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DomainRow({ domain }: { domain: DomainBusFactor }) {
  const barWidth = Math.max(5, Math.min(100, domain.busFactorScore));

  return (
    <div className="flex items-center gap-4">
      <div className="w-40 truncate font-medium text-sm">{domain.domain}</div>
      <div className="flex-1">
        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${riskLevelColors[domain.riskLevel]}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
      <div className="w-12 text-right text-sm font-medium">{domain.busFactorScore}</div>
      <Badge className={riskLevelBadgeColors[domain.riskLevel]} variant="outline">
        {domain.riskLevel}
      </Badge>
      <div className="w-24 text-right text-xs text-gray-500">
        {domain.expertCount} expert{domain.expertCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function SPOFRow({ spof }: { spof: SinglePointOfFailure }) {
  return (
    <div className="p-3 bg-red-50 rounded-lg border border-red-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-gray-900">{spof.personName}</p>
          <p className="text-sm text-gray-500">{spof.email}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-red-600">{spof.riskScore}</div>
          <div className="text-xs text-gray-500">risk score</div>
        </div>
      </div>
      <div className="mt-2">
        <p className="text-xs text-gray-500 mb-1">Sole expert in:</p>
        <div className="flex flex-wrap gap-1">
          {spof.domains.map((domain) => (
            <Badge key={domain} variant="outline" className="text-xs">
              {domain}
            </Badge>
          ))}
        </div>
      </div>
      {spof.estimatedImpact && (
        <p className="mt-2 text-sm text-red-700">{spof.estimatedImpact}</p>
      )}
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e'; // green
  if (score >= 50) return '#eab308'; // yellow
  if (score >= 30) return '#f97316'; // orange
  return '#ef4444'; // red
}

export default BusFactorChart;
