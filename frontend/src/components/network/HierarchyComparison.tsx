/**
 * Hierarchy Comparison Component
 * Visualizes formal vs informal hierarchy alignment
 * T247 - Hierarchy comparison visualization
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export interface HierarchyNode {
  email: string;
  displayName?: string;
  department?: string;
  jobTitle?: string;
  formalLevel: number;
  actualLevel: number;
  directReports: number;
  formalManager?: string;
  discrepancy: number;
  discrepancyType: 'aligned' | 'under-leveraged' | 'over-performer' | 'shadow-leader';
}

export interface HierarchyLevel {
  level: number;
  label: string;
  members: Array<{
    email: string;
    displayName?: string;
    department?: string;
  }>;
}

interface HierarchyComparisonProps {
  nodes: HierarchyNode[];
  formalHierarchy: HierarchyLevel[];
  actualHierarchy: HierarchyLevel[];
  metrics: {
    alignmentScore: number;
    shadowLeaderCount: number;
    underLeveragedCount: number;
    overPerformerCount: number;
    avgDiscrepancy: number;
  };
  onNodeSelect?: (email: string) => void;
  selectedNode?: string;
}

const LEVEL_LABELS = ['', 'Top Leadership', 'Senior Leaders', 'Key Influencers', 'Contributors', 'Participants'];

const DISCREPANCY_CONFIG = {
  aligned: { bg: 'bg-green-100', text: 'text-green-800', icon: '✓' },
  'under-leveraged': { bg: 'bg-orange-100', text: 'text-orange-800', icon: '↓' },
  'over-performer': { bg: 'bg-blue-100', text: 'text-blue-800', icon: '↑' },
  'shadow-leader': { bg: 'bg-purple-100', text: 'text-purple-800', icon: '★' },
};

export function HierarchyComparison({
  nodes,
  formalHierarchy,
  actualHierarchy,
  metrics,
  onNodeSelect,
  selectedNode,
}: HierarchyComparisonProps) {
  const [viewMode, setViewMode] = useState<'comparison' | 'discrepancies'>('comparison');
  const [filterType, setFilterType] = useState<string>('all');

  // Filter nodes by discrepancy type
  const filteredNodes = useMemo(() => {
    if (filterType === 'all') return nodes;
    return nodes.filter((n) => n.discrepancyType === filterType);
  }, [nodes, filterType]);

  // Sort by discrepancy magnitude
  const sortedNodes = useMemo(() => {
    return [...filteredNodes].sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));
  }, [filteredNodes]);

  return (
    <div className="space-y-6">
      {/* Metrics Overview */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-blue-600">
              {(metrics.alignmentScore * 100).toFixed(0)}%
            </p>
            <p className="text-sm text-gray-500">Alignment Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-purple-600">{metrics.shadowLeaderCount}</p>
            <p className="text-sm text-gray-500">Shadow Leaders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-orange-600">{metrics.underLeveragedCount}</p>
            <p className="text-sm text-gray-500">Under-Leveraged</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-600">{metrics.overPerformerCount}</p>
            <p className="text-sm text-gray-500">Over-Performers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-gray-600">
              {metrics.avgDiscrepancy.toFixed(1)}
            </p>
            <p className="text-sm text-gray-500">Avg Discrepancy</p>
          </CardContent>
        </Card>
      </div>

      {/* View Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'comparison' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('comparison')}
          >
            Comparison View
          </Button>
          <Button
            variant={viewMode === 'discrepancies' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('discrepancies')}
          >
            Discrepancy List
          </Button>
        </div>

        <select
          className="text-sm border rounded px-2 py-1"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="aligned">Aligned</option>
          <option value="shadow-leader">Shadow Leaders</option>
          <option value="over-performer">Over-Performers</option>
          <option value="under-leveraged">Under-Leveraged</option>
        </select>
      </div>

      {viewMode === 'comparison' ? (
        /* Side-by-side Hierarchy Comparison */
        <Card>
          <CardHeader>
            <CardTitle>Formal vs Actual Hierarchy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-8">
              {/* Formal Hierarchy */}
              <div>
                <h3 className="font-medium text-gray-700 mb-4 text-center">
                  Formal Hierarchy
                </h3>
                <div className="space-y-4">
                  {formalHierarchy.map((level) => (
                    <div key={level.level} className="border-l-4 border-blue-400 pl-4">
                      <p className="text-sm font-medium text-blue-600 mb-2">
                        {level.label} ({level.members.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {level.members.slice(0, 8).map((member) => (
                          <Badge
                            key={member.email}
                            className={`cursor-pointer ${
                              selectedNode === member.email
                                ? 'bg-blue-500 text-white'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                            onClick={() => onNodeSelect?.(member.email)}
                          >
                            {member.displayName || member.email.split('@')[0]}
                          </Badge>
                        ))}
                        {level.members.length > 8 && (
                          <Badge variant="outline">+{level.members.length - 8} more</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actual Hierarchy */}
              <div>
                <h3 className="font-medium text-gray-700 mb-4 text-center">
                  Actual (Influence-Based)
                </h3>
                <div className="space-y-4">
                  {actualHierarchy.map((level) => (
                    <div key={level.level} className="border-l-4 border-green-400 pl-4">
                      <p className="text-sm font-medium text-green-600 mb-2">
                        {level.label} ({level.members.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {level.members.slice(0, 8).map((member) => (
                          <Badge
                            key={member.email}
                            className={`cursor-pointer ${
                              selectedNode === member.email
                                ? 'bg-green-500 text-white'
                                : 'bg-green-50 text-green-700 hover:bg-green-100'
                            }`}
                            onClick={() => onNodeSelect?.(member.email)}
                          >
                            {member.displayName || member.email.split('@')[0]}
                          </Badge>
                        ))}
                        {level.members.length > 8 && (
                          <Badge variant="outline">+{level.members.length - 8} more</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Discrepancy List */
        <Card>
          <CardHeader>
            <CardTitle>Hierarchy Discrepancies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedNodes.map((node) => {
                const config = DISCREPANCY_CONFIG[node.discrepancyType];
                const isSelected = selectedNode === node.email;

                return (
                  <div
                    key={node.email}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-400 border-2'
                        : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                    }`}
                    onClick={() => onNodeSelect?.(node.email)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full ${config.bg} ${config.text} flex items-center justify-center font-bold`}>
                          {config.icon}
                        </div>
                        <div>
                          <p className="font-medium">{node.displayName || node.email}</p>
                          <p className="text-sm text-gray-500">{node.jobTitle || node.email}</p>
                          {node.department && (
                            <p className="text-xs text-gray-400">{node.department}</p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <Badge className={`${config.bg} ${config.text}`}>
                          {node.discrepancyType.replace('-', ' ')}
                        </Badge>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <div>
                            <p className="text-gray-400">Formal</p>
                            <p className="font-medium">{LEVEL_LABELS[node.formalLevel]}</p>
                          </div>
                          <div className="text-2xl text-gray-300">→</div>
                          <div>
                            <p className="text-gray-400">Actual</p>
                            <p className="font-medium text-green-600">{LEVEL_LABELS[node.actualLevel]}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Discrepancy indicator */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Level Difference:</span>
                      <div className="flex items-center">
                        {Array.from({ length: Math.abs(node.discrepancy) }).map((_, i) => (
                          <span
                            key={i}
                            className={`text-lg ${
                              node.discrepancy > 0 ? 'text-blue-500' : 'text-orange-500'
                            }`}
                          >
                            {node.discrepancy > 0 ? '▲' : '▼'}
                          </span>
                        ))}
                      </div>
                      <span className={`font-bold ${
                        node.discrepancy > 0 ? 'text-blue-600' : node.discrepancy < 0 ? 'text-orange-600' : 'text-gray-600'
                      }`}>
                        {node.discrepancy > 0 ? '+' : ''}{node.discrepancy} levels
                      </span>
                    </div>
                  </div>
                );
              })}

              {sortedNodes.length === 0 && (
                <p className="text-center text-gray-500 py-8">No results for selected filter</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Discrepancy Types:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(DISCREPANCY_CONFIG).map(([type, config]) => (
              <div key={type} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded ${config.bg} ${config.text} flex items-center justify-center font-bold`}>
                  {config.icon}
                </div>
                <div>
                  <p className="text-sm font-medium capitalize">{type.replace('-', ' ')}</p>
                  <p className="text-xs text-gray-500">
                    {type === 'aligned' && 'Position matches influence'}
                    {type === 'shadow-leader' && 'High influence, low position'}
                    {type === 'over-performer' && 'Exceeds role expectations'}
                    {type === 'under-leveraged' && 'Senior but low influence'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default HierarchyComparison;
