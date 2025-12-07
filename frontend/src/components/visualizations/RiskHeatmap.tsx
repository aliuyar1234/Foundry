/**
 * Risk Heatmap Component
 * Visualizes risk exposure across people and domains
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useRiskExposure, RiskExposureReport } from '../../hooks/useInsights';

interface RiskHeatmapProps {
  lookbackDays?: number;
  currency?: string;
}

type ViewMode = 'person' | 'domain' | 'scenario';

const colorScale = [
  { threshold: 0, bg: 'bg-green-100', text: 'text-green-800' },
  { threshold: 10000, bg: 'bg-green-200', text: 'text-green-800' },
  { threshold: 50000, bg: 'bg-yellow-100', text: 'text-yellow-800' },
  { threshold: 100000, bg: 'bg-yellow-200', text: 'text-yellow-800' },
  { threshold: 250000, bg: 'bg-orange-100', text: 'text-orange-800' },
  { threshold: 500000, bg: 'bg-orange-200', text: 'text-orange-800' },
  { threshold: 1000000, bg: 'bg-red-100', text: 'text-red-800' },
  { threshold: 2500000, bg: 'bg-red-200', text: 'text-red-900' },
];

function getRiskColor(value: number): { bg: string; text: string } {
  for (let i = colorScale.length - 1; i >= 0; i--) {
    if (value >= colorScale[i].threshold) {
      return { bg: colorScale[i].bg, text: colorScale[i].text };
    }
  }
  return colorScale[0];
}

function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function RiskHeatmap({ lookbackDays = 90, currency = 'EUR' }: RiskHeatmapProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('person');
  const { data: riskData, isLoading, error } = useRiskExposure({ lookbackDays, currency });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Exposure Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-4 gap-2">
              {Array(12).fill(0).map((_, i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !riskData) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Risk Exposure Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">Failed to load risk exposure data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Risk Exposure Analysis</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Total Exposure: {formatCurrency(riskData.totalRiskExposure, riskData.currency)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={viewMode === 'person' ? 'default' : 'outline'}
              onClick={() => setViewMode('person')}
            >
              By Person
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'domain' ? 'default' : 'outline'}
              onClick={() => setViewMode('domain')}
            >
              By Domain
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'scenario' ? 'default' : 'outline'}
              onClick={() => setViewMode('scenario')}
            >
              Scenarios
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'person' && (
          <PersonRiskView data={riskData} currency={riskData.currency} />
        )}
        {viewMode === 'domain' && (
          <DomainRiskView data={riskData} currency={riskData.currency} />
        )}
        {viewMode === 'scenario' && (
          <ScenarioView data={riskData} currency={riskData.currency} />
        )}

        {/* Legend */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-gray-500 mb-2">Risk Exposure Scale:</p>
          <div className="flex gap-1">
            {colorScale.map((level, i) => (
              <div key={i} className="flex-1">
                <div className={`h-4 ${level.bg}`}></div>
                <p className="text-xs text-gray-500 mt-1">
                  {i === 0 ? 'Low' : i === colorScale.length - 1 ? 'Critical' : ''}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        {riskData.mitigationRecommendations && riskData.mitigationRecommendations.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium text-gray-700 mb-2">Mitigation Recommendations:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              {riskData.mitigationRecommendations.slice(0, 4).map((rec, i) => (
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
  );
}

function PersonRiskView({ data, currency }: { data: RiskExposureReport; currency: string }) {
  const sortedPersons = useMemo(() => {
    return [...(data.byPerson || [])].sort((a, b) => b.riskExposure - a.riskExposure);
  }, [data.byPerson]);

  if (sortedPersons.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No person-level risk data available
      </div>
    );
  }

  const maxRisk = Math.max(...sortedPersons.map(p => p.riskExposure));

  return (
    <div className="space-y-2">
      {sortedPersons.slice(0, 10).map((person) => {
        const color = getRiskColor(person.riskExposure);
        const barWidth = (person.riskExposure / maxRisk) * 100;

        return (
          <div
            key={person.personId}
            className={`p-3 rounded-lg ${color.bg} ${color.text}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium">{person.personName}</p>
                <div className="flex gap-1 mt-1">
                  {person.domains.slice(0, 3).map((domain) => (
                    <Badge key={domain} variant="outline" className="text-xs bg-white/50">
                      {domain}
                    </Badge>
                  ))}
                  {person.domains.length > 3 && (
                    <span className="text-xs opacity-75">+{person.domains.length - 3}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">{formatCurrency(person.riskExposure, currency)}</p>
                <p className="text-xs opacity-75">risk exposure</p>
              </div>
            </div>
            <div className="h-2 bg-white/30 rounded-full">
              <div
                className="h-full bg-current rounded-full opacity-50"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DomainRiskView({ data, currency }: { data: RiskExposureReport; currency: string }) {
  const sortedDomains = useMemo(() => {
    return [...(data.byDomain || [])].sort((a, b) => b.riskExposure - a.riskExposure);
  }, [data.byDomain]);

  if (sortedDomains.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No domain-level risk data available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {sortedDomains.slice(0, 12).map((domain) => {
        const color = getRiskColor(domain.riskExposure);

        return (
          <div
            key={domain.domain}
            className={`p-4 rounded-lg ${color.bg} ${color.text}`}
          >
            <p className="font-medium truncate">{domain.domain}</p>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(domain.riskExposure, currency)}
            </p>
            <p className="text-xs opacity-75 mt-1">
              {domain.experts.length} expert{domain.experts.length !== 1 ? 's' : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ScenarioView({ data, currency }: { data: RiskExposureReport; currency: string }) {
  const sortedScenarios = useMemo(() => {
    return [...(data.scenarios || [])].sort((a, b) => b.expectedLoss - a.expectedLoss);
  }, [data.scenarios]);

  if (sortedScenarios.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No scenario analysis available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedScenarios.map((scenario, index) => {
        const color = getRiskColor(scenario.expectedLoss);

        return (
          <div
            key={index}
            className={`p-4 rounded-lg border ${color.bg}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium text-gray-900">{scenario.scenario}</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <div>
                    <span className="text-gray-500">Probability:</span>
                    <span className="ml-1 font-medium">{(scenario.probability * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Impact:</span>
                    <span className="ml-1 font-medium">{formatCurrency(scenario.impact, currency)}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${color.text}`}>
                  {formatCurrency(scenario.expectedLoss, currency)}
                </p>
                <p className="text-xs text-gray-500">expected loss</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default RiskHeatmap;
