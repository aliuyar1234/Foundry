/**
 * Insight Card Component
 * Displays an insight with severity indicators and actions
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Insight,
  InsightSeverity,
  InsightStatus,
  InsightCategory,
  InsightType,
  useAcknowledgeInsight,
  useResolveInsight,
  useDismissInsight,
} from '../../hooks/useInsights';

const severityColors: Record<InsightSeverity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-blue-100 text-blue-800 border-blue-300',
};

const severityBorderColors: Record<InsightSeverity, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-blue-500',
};

const statusColors: Record<InsightStatus, string> = {
  new: 'bg-purple-100 text-purple-800',
  acknowledged: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-800',
};

const categoryIcons: Record<InsightCategory, string> = {
  people: 'Users',
  process: 'Cog',
  risk: 'AlertTriangle',
  opportunity: 'TrendingUp',
};

const typeLabels: Record<InsightType, string> = {
  burnout_risk: 'Burnout Risk',
  process_degradation: 'Process Degradation',
  team_conflict: 'Team Conflict',
  bus_factor_risk: 'Bus Factor Risk',
  data_quality: 'Data Quality',
  compliance_gap: 'Compliance Gap',
  opportunity: 'Opportunity',
  anomaly: 'Anomaly',
};

interface InsightCardProps {
  insight: Insight;
  onViewDetail?: (insight: Insight) => void;
  compact?: boolean;
}

export function InsightCard({ insight, onViewDetail, compact = false }: InsightCardProps) {
  const [showActions, setShowActions] = useState(false);
  const acknowledgeInsight = useAcknowledgeInsight();
  const resolveInsight = useResolveInsight();
  const dismissInsight = useDismissInsight();

  const isActionable = insight.status === 'new' || insight.status === 'acknowledged';

  const handleAcknowledge = async () => {
    await acknowledgeInsight.mutateAsync(insight.id);
  };

  const handleResolve = async () => {
    await resolveInsight.mutateAsync({ id: insight.id });
  };

  const handleDismiss = async () => {
    await dismissInsight.mutateAsync({ id: insight.id });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (compact) {
    return (
      <div
        className={`p-3 rounded-lg border-l-4 ${severityBorderColors[insight.severity]} bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
        onClick={() => onViewDetail?.(insight)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={severityColors[insight.severity]} variant="outline">
                {insight.severity}
              </Badge>
              <Badge className={statusColors[insight.status]} variant="outline">
                {insight.status.replace('_', ' ')}
              </Badge>
            </div>
            <h4 className="font-medium text-sm truncate">{insight.title}</h4>
            <p className="text-xs text-gray-500 truncate">{insight.entityName || insight.entityType}</p>
          </div>
          <div className="text-xs text-gray-400 whitespace-nowrap ml-2">
            {formatDate(insight.createdAt)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card
      className={`border-l-4 ${severityBorderColors[insight.severity]} hover:shadow-md transition-shadow`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={severityColors[insight.severity]} variant="outline">
                {insight.severity}
              </Badge>
              <Badge className={statusColors[insight.status]} variant="outline">
                {insight.status.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="text-gray-600">
                {typeLabels[insight.type] || insight.type}
              </Badge>
            </div>
            <CardTitle className="text-lg">{insight.title}</CardTitle>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-700">{insight.score}</div>
            <div className="text-xs text-gray-500">score</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-gray-600 mb-3">{insight.description}</p>

        {insight.entityName && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <span className="font-medium">Affected:</span>
            <span>{insight.entityName}</span>
            <span className="text-gray-400">({insight.entityType})</span>
          </div>
        )}

        {insight.recommendedActions.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-1">Recommended Actions:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              {insight.recommendedActions.slice(0, 3).map((action, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">&#x2022;</span>
                  <span>{action}</span>
                </li>
              ))}
              {insight.recommendedActions.length > 3 && (
                <li className="text-gray-400 text-xs">
                  +{insight.recommendedActions.length - 3} more actions
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-xs text-gray-500">
            Created {formatDate(insight.createdAt)}
            {insight.acknowledgedAt && (
              <span> &middot; Acknowledged {formatDate(insight.acknowledgedAt)}</span>
            )}
          </div>

          {(showActions || !isActionable) && (
            <div className="flex items-center gap-2">
              {insight.status === 'new' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAcknowledge}
                  disabled={acknowledgeInsight.isPending}
                >
                  {acknowledgeInsight.isPending ? 'Acknowledging...' : 'Acknowledge'}
                </Button>
              )}
              {isActionable && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResolve}
                    disabled={resolveInsight.isPending}
                  >
                    {resolveInsight.isPending ? 'Resolving...' : 'Resolve'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismiss}
                    disabled={dismissInsight.isPending}
                  >
                    {dismissInsight.isPending ? 'Dismissing...' : 'Dismiss'}
                  </Button>
                </>
              )}
              {onViewDetail && (
                <Button size="sm" onClick={() => onViewDetail(insight)}>
                  View Details
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default InsightCard;
