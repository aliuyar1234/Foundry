/**
 * Team Load Chart Component
 * T229 - Visualize team workload distribution
 *
 * Shows workload across team members with interactive features
 */

import React, { useState, useEffect, useMemo } from 'react';

// Types
export interface TeamMemberLoad {
  personId: string;
  personName: string;
  currentLoad: number;
  taskCount: number;
  capacityHours: number;
  usedHours: number;
  trend: 'up' | 'down' | 'stable';
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export interface TeamLoadData {
  teamId: string;
  teamName: string;
  members: TeamMemberLoad[];
  summary: {
    averageLoad: number;
    maxLoad: number;
    minLoad: number;
    overloadedCount: number;
    underutilizedCount: number;
    balanceScore: number;
  };
}

type ViewMode = 'bars' | 'heatmap' | 'distribution';
type SortOption = 'load-desc' | 'load-asc' | 'name' | 'risk';

interface TeamLoadChartProps {
  teamId: string;
  onMemberClick?: (personId: string) => void;
  viewMode?: ViewMode;
  showThresholds?: boolean;
  height?: number;
}

const LOAD_THRESHOLDS = {
  underutilized: 50,
  optimal: 80,
  warning: 100,
  critical: 120,
};

const LOAD_COLORS = {
  underutilized: '#94a3b8',
  optimal: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export function TeamLoadChart({
  teamId,
  onMemberClick,
  viewMode: initialViewMode = 'bars',
  showThresholds = true,
  height = 300,
}: TeamLoadChartProps) {
  const [data, setData] = useState<TeamLoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [sortOption, setSortOption] = useState<SortOption>('load-desc');
  const [hoveredMember, setHoveredMember] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/workload/team/${teamId}`);
        if (!response.ok) throw new Error('Failed to fetch team load data');
        const result = await response.json();
        setData(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [teamId]);

  const sortedMembers = useMemo(() => {
    if (!data) return [];

    return [...data.members].sort((a, b) => {
      switch (sortOption) {
        case 'load-desc':
          return b.currentLoad - a.currentLoad;
        case 'load-asc':
          return a.currentLoad - b.currentLoad;
        case 'name':
          return a.personName.localeCompare(b.personName);
        case 'risk':
          const riskOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
          return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
        default:
          return 0;
      }
    });
  }, [data, sortOption]);

  if (loading) {
    return (
      <div className="team-load-chart loading" style={{ height }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="team-load-chart error" style={{ height }}>
        <p>Unable to load chart</p>
      </div>
    );
  }

  return (
    <div className="team-load-chart">
      {/* Chart Header */}
      <div className="chart-header">
        <div className="chart-title">
          <h3>Team Workload</h3>
          <span className="member-count">{data.members.length} members</span>
        </div>
        <div className="chart-controls">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="sort-select"
          >
            <option value="load-desc">Highest Load</option>
            <option value="load-asc">Lowest Load</option>
            <option value="risk">Risk Level</option>
            <option value="name">Name</option>
          </select>
          <div className="view-toggle">
            {(['bars', 'heatmap', 'distribution'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                className={`toggle-btn ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode)}
                title={mode.charAt(0).toUpperCase() + mode.slice(1)}
              >
                {mode === 'bars' ? '▮' : mode === 'heatmap' ? '▦' : '◐'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="chart-summary">
        <div className="summary-stat">
          <span className="stat-label">Average</span>
          <span className={`stat-value ${getLoadStatus(data.summary.averageLoad)}`}>
            {data.summary.averageLoad}%
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Balance</span>
          <span className={`stat-value ${data.summary.balanceScore > 70 ? 'good' : data.summary.balanceScore > 50 ? 'warning' : 'poor'}`}>
            {data.summary.balanceScore}/100
          </span>
        </div>
        <div className="summary-stat warning">
          <span className="stat-label">Overloaded</span>
          <span className="stat-value">{data.summary.overloadedCount}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Underutilized</span>
          <span className="stat-value">{data.summary.underutilizedCount}</span>
        </div>
      </div>

      {/* Chart Content */}
      <div className="chart-content" style={{ height: height - 100 }}>
        {viewMode === 'bars' && (
          <BarsView
            members={sortedMembers}
            showThresholds={showThresholds}
            hoveredMember={hoveredMember}
            onHover={setHoveredMember}
            onMemberClick={onMemberClick}
          />
        )}
        {viewMode === 'heatmap' && (
          <HeatmapView
            members={sortedMembers}
            hoveredMember={hoveredMember}
            onHover={setHoveredMember}
            onMemberClick={onMemberClick}
          />
        )}
        {viewMode === 'distribution' && (
          <DistributionView
            members={sortedMembers}
            summary={data.summary}
          />
        )}
      </div>

      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: LOAD_COLORS.underutilized }} />
          <span>Under 50%</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: LOAD_COLORS.optimal }} />
          <span>50-80%</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: LOAD_COLORS.warning }} />
          <span>80-100%</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: LOAD_COLORS.critical }} />
          <span>Over 100%</span>
        </div>
      </div>
    </div>
  );
}

// Bars View
interface BarsViewProps {
  members: TeamMemberLoad[];
  showThresholds: boolean;
  hoveredMember: string | null;
  onHover: (id: string | null) => void;
  onMemberClick?: (id: string) => void;
}

function BarsView({ members, showThresholds, hoveredMember, onHover, onMemberClick }: BarsViewProps) {
  const maxLoad = Math.max(...members.map((m) => m.currentLoad), 120);

  return (
    <div className="bars-view">
      {/* Threshold Lines */}
      {showThresholds && (
        <div className="threshold-lines">
          <div
            className="threshold-line warning"
            style={{ left: `${(100 / maxLoad) * 100}%` }}
            title="100% - Full capacity"
          />
          <div
            className="threshold-line optimal"
            style={{ left: `${(80 / maxLoad) * 100}%` }}
            title="80% - Optimal load"
          />
        </div>
      )}

      {/* Member Bars */}
      {members.map((member) => (
        <div
          key={member.personId}
          className={`member-bar ${hoveredMember === member.personId ? 'hovered' : ''}`}
          onMouseEnter={() => onHover(member.personId)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onMemberClick?.(member.personId)}
        >
          <div className="bar-label">
            <span className="member-name">{member.personName}</span>
            <span className="member-load">{member.currentLoad}%</span>
          </div>
          <div className="bar-track">
            <div
              className={`bar-fill ${getLoadStatus(member.currentLoad)}`}
              style={{ width: `${Math.min(100, (member.currentLoad / maxLoad) * 100)}%` }}
            />
            {member.currentLoad > maxLoad && (
              <div className="overflow-indicator">+</div>
            )}
          </div>
          <div className="bar-meta">
            <span className="task-count">{member.taskCount} tasks</span>
            <span className={`trend ${member.trend}`}>
              {member.trend === 'up' ? '↑' : member.trend === 'down' ? '↓' : '→'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Heatmap View
interface HeatmapViewProps {
  members: TeamMemberLoad[];
  hoveredMember: string | null;
  onHover: (id: string | null) => void;
  onMemberClick?: (id: string) => void;
}

function HeatmapView({ members, hoveredMember, onHover, onMemberClick }: HeatmapViewProps) {
  // Create 7-day grid (simulate weekly view)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="heatmap-view">
      <div className="heatmap-header">
        <div className="header-spacer" />
        {days.map((day) => (
          <div key={day} className="day-label">{day}</div>
        ))}
      </div>
      <div className="heatmap-grid">
        {members.map((member) => (
          <div
            key={member.personId}
            className={`heatmap-row ${hoveredMember === member.personId ? 'hovered' : ''}`}
            onMouseEnter={() => onHover(member.personId)}
            onMouseLeave={() => onHover(null)}
          >
            <div className="member-label">{member.personName}</div>
            {days.map((day, i) => {
              // Simulate daily variation
              const dailyLoad = member.currentLoad + (Math.random() - 0.5) * 20;
              return (
                <div
                  key={day}
                  className="heatmap-cell"
                  style={{ backgroundColor: getLoadColor(dailyLoad) }}
                  onClick={() => onMemberClick?.(member.personId)}
                  title={`${member.personName} - ${day}: ${Math.round(dailyLoad)}%`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Distribution View
interface DistributionViewProps {
  members: TeamMemberLoad[];
  summary: TeamLoadData['summary'];
}

function DistributionView({ members, summary }: DistributionViewProps) {
  // Calculate distribution buckets
  const buckets = [
    { range: '0-50%', count: members.filter((m) => m.currentLoad < 50).length, color: LOAD_COLORS.underutilized },
    { range: '50-80%', count: members.filter((m) => m.currentLoad >= 50 && m.currentLoad < 80).length, color: LOAD_COLORS.optimal },
    { range: '80-100%', count: members.filter((m) => m.currentLoad >= 80 && m.currentLoad < 100).length, color: LOAD_COLORS.warning },
    { range: '100%+', count: members.filter((m) => m.currentLoad >= 100).length, color: LOAD_COLORS.critical },
  ];

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="distribution-view">
      {/* Histogram */}
      <div className="histogram">
        {buckets.map((bucket) => (
          <div key={bucket.range} className="histogram-bar">
            <div
              className="bar-fill"
              style={{
                height: `${(bucket.count / maxCount) * 100}%`,
                backgroundColor: bucket.color,
              }}
            />
            <span className="bar-count">{bucket.count}</span>
            <span className="bar-range">{bucket.range}</span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="distribution-stats">
        <div className="stat-item">
          <span className="stat-label">Mean Load</span>
          <span className="stat-value">{summary.averageLoad}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Range</span>
          <span className="stat-value">{summary.minLoad}% - {summary.maxLoad}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Std Dev</span>
          <span className="stat-value">{calculateStdDev(members)}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Gini Coefficient</span>
          <span className="stat-value">{calculateGini(members).toFixed(2)}</span>
        </div>
      </div>

      {/* Box Plot */}
      <div className="box-plot">
        <h4>Load Distribution</h4>
        <BoxPlot data={members.map((m) => m.currentLoad)} />
      </div>
    </div>
  );
}

// Box Plot Component
interface BoxPlotProps {
  data: number[];
}

function BoxPlot({ data }: BoxPlotProps) {
  if (data.length === 0) return null;

  const sorted = [...data].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];

  const range = Math.max(max, 120) - Math.min(min, 0);
  const scale = (val: number) => ((val - Math.min(min, 0)) / range) * 100;

  return (
    <svg viewBox="0 0 200 40" className="box-plot-svg">
      {/* Whiskers */}
      <line
        x1={scale(min) * 2}
        y1="20"
        x2={scale(q1) * 2}
        y2="20"
        stroke="#888"
        strokeWidth="2"
      />
      <line
        x1={scale(q3) * 2}
        y1="20"
        x2={scale(max) * 2}
        y2="20"
        stroke="#888"
        strokeWidth="2"
      />

      {/* Box */}
      <rect
        x={scale(q1) * 2}
        y="8"
        width={(scale(q3) - scale(q1)) * 2}
        height="24"
        fill="#6366f1"
        opacity="0.6"
        rx="2"
      />

      {/* Median */}
      <line
        x1={scale(median) * 2}
        y1="8"
        x2={scale(median) * 2}
        y2="32"
        stroke="#fff"
        strokeWidth="2"
      />

      {/* Min/Max markers */}
      <line x1={scale(min) * 2} y1="14" x2={scale(min) * 2} y2="26" stroke="#888" strokeWidth="2" />
      <line x1={scale(max) * 2} y1="14" x2={scale(max) * 2} y2="26" stroke="#888" strokeWidth="2" />

      {/* Labels */}
      <text x={scale(min) * 2} y="38" fontSize="8" textAnchor="middle" fill="#888">{min}</text>
      <text x={scale(max) * 2} y="38" fontSize="8" textAnchor="middle" fill="#888">{max}</text>
      <text x={scale(median) * 2} y="6" fontSize="8" textAnchor="middle" fill="#888">{median}</text>
    </svg>
  );
}

// Helper Functions
function getLoadStatus(load: number): string {
  if (load >= LOAD_THRESHOLDS.critical) return 'critical';
  if (load >= LOAD_THRESHOLDS.warning) return 'warning';
  if (load >= LOAD_THRESHOLDS.underutilized) return 'optimal';
  return 'underutilized';
}

function getLoadColor(load: number): string {
  if (load >= LOAD_THRESHOLDS.critical) return LOAD_COLORS.critical;
  if (load >= LOAD_THRESHOLDS.warning) return LOAD_COLORS.warning;
  if (load >= LOAD_THRESHOLDS.underutilized) return LOAD_COLORS.optimal;
  return LOAD_COLORS.underutilized;
}

function calculateStdDev(members: TeamMemberLoad[]): number {
  const loads = members.map((m) => m.currentLoad);
  const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
  const variance = loads.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / loads.length;
  return Math.round(Math.sqrt(variance));
}

function calculateGini(members: TeamMemberLoad[]): number {
  const loads = members.map((m) => m.currentLoad).sort((a, b) => a - b);
  const n = loads.length;
  const mean = loads.reduce((a, b) => a + b, 0) / n;

  if (mean === 0) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (2 * (i + 1) - n - 1) * loads[i];
  }

  return sum / (n * n * mean);
}

export default TeamLoadChart;
