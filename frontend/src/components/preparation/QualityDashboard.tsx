/**
 * Quality Dashboard Component
 * Visualizes data quality metrics and trends
 */

import React, { useMemo } from 'react';
import {
  useEntityStats,
  useEntityRecords,
  EntityType,
  EntityStatus,
} from '../../hooks/usePreparation';

interface QualityDashboardProps {
  organizationId: string;
}

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Persons',
  company: 'Companies',
  address: 'Addresses',
  product: 'Products',
  contact: 'Contacts',
};

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  person: '#3B82F6',
  company: '#10B981',
  address: '#F59E0B',
  product: '#8B5CF6',
  contact: '#EC4899',
};

function QualityGauge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 80
      ? '#10B981'
      : score >= 60
        ? '#F59E0B'
        : score >= 40
          ? '#F97316'
          : '#EF4444';

  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Score text */}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-2xl font-bold"
          fill={color}
        >
          {score.toFixed(0)}
        </text>
        <text
          x="50"
          y="65"
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-xs"
          fill="#6B7280"
        >
          %
        </text>
      </svg>
      <span className="text-sm text-gray-600 mt-2">{label}</span>
    </div>
  );
}

function BarChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-700">{item.label}</span>
            <span className="text-gray-500">{item.value.toLocaleString()}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function QualityDistribution({
  records,
}: {
  records: Array<{ qualityScore: number }>;
}) {
  const distribution = useMemo(() => {
    const buckets = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0,
    };

    records.forEach((r) => {
      const score = r.qualityScore;
      if (score <= 20) buckets['0-20']++;
      else if (score <= 40) buckets['21-40']++;
      else if (score <= 60) buckets['41-60']++;
      else if (score <= 80) buckets['61-80']++;
      else buckets['81-100']++;
    });

    return Object.entries(buckets).map(([range, count]) => ({
      range,
      count,
      percentage: records.length > 0 ? (count / records.length) * 100 : 0,
    }));
  }, [records]);

  const colors = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981'];

  return (
    <div className="flex items-end justify-between h-32 gap-2">
      {distribution.map((bucket, index) => (
        <div key={bucket.range} className="flex-1 flex flex-col items-center">
          <div
            className="w-full rounded-t transition-all duration-500"
            style={{
              height: `${Math.max(bucket.percentage, 2)}%`,
              backgroundColor: colors[index],
            }}
          />
          <div className="text-xs text-gray-500 mt-2 text-center">
            <div>{bucket.range}%</div>
            <div className="font-medium text-gray-700">{bucket.count}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function QualityDashboard({ organizationId }: QualityDashboardProps) {
  const { data: stats, isLoading: statsLoading } = useEntityStats(organizationId);
  const { data: recordsData, isLoading: recordsLoading } = useEntityRecords(organizationId, {
    limit: 1000,
    statuses: ['active', 'pending_review', 'golden'] as EntityStatus[],
  });

  const records = recordsData?.data || [];

  // Calculate quality metrics by type
  const qualityByType = useMemo(() => {
    const byType: Record<EntityType, { total: number; sumScore: number }> = {
      person: { total: 0, sumScore: 0 },
      company: { total: 0, sumScore: 0 },
      address: { total: 0, sumScore: 0 },
      product: { total: 0, sumScore: 0 },
      contact: { total: 0, sumScore: 0 },
    };

    records.forEach((record) => {
      byType[record.entityType].total++;
      byType[record.entityType].sumScore += record.qualityScore;
    });

    return (Object.keys(byType) as EntityType[]).map((type) => ({
      type,
      label: ENTITY_TYPE_LABELS[type],
      avgScore: byType[type].total > 0 ? byType[type].sumScore / byType[type].total : 0,
      count: byType[type].total,
      color: ENTITY_TYPE_COLORS[type],
    })).filter((item) => item.count > 0);
  }, [records]);

  // Calculate status distribution
  const statusData = useMemo(() => {
    if (!stats?.byStatus) return [];

    return [
      { label: 'Active', value: stats.byStatus.active || 0, color: '#10B981' },
      { label: 'Pending Review', value: stats.byStatus.pending_review || 0, color: '#F59E0B' },
      { label: 'Golden Records', value: stats.byStatus.golden || 0, color: '#8B5CF6' },
      { label: 'Duplicates', value: stats.byStatus.duplicate || 0, color: '#F97316' },
      { label: 'Merged', value: stats.byStatus.merged || 0, color: '#3B82F6' },
    ].filter((item) => item.value > 0);
  }, [stats]);

  if (statsLoading || recordsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Quality Score */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Overall Data Quality</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <QualityGauge
            score={stats?.avgQualityScore || 0}
            label="Overall Score"
          />
          <div className="col-span-2 md:col-span-3">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Quality Distribution</h3>
            <QualityDistribution records={records} />
          </div>
        </div>
      </div>

      {/* Quality by Entity Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality by Entity Type</h2>
          <div className="space-y-4">
            {qualityByType.map((item) => (
              <div key={item.type} className="flex items-center gap-4">
                <div className="w-24 text-sm text-gray-600">{item.label}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${item.avgScore}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-12 text-right">
                      {item.avgScore.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 w-16 text-right">
                  {item.count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Record Status</h2>
          <BarChart data={statusData} />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Total Records</p>
          <p className="text-2xl font-bold text-gray-900">
            {stats?.total.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">High Quality (80%+)</p>
          <p className="text-2xl font-bold text-green-600">
            {records.filter((r) => r.qualityScore >= 80).length.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Needs Review</p>
          <p className="text-2xl font-bold text-yellow-600">
            {records.filter((r) => r.qualityScore < 60).length.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Duplicate Groups</p>
          <p className="text-2xl font-bold text-orange-600">
            {stats?.duplicateGroups || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-gray-500">Golden Records</p>
          <p className="text-2xl font-bold text-purple-600">
            {stats?.byStatus?.golden || 0}
          </p>
        </div>
      </div>

      {/* Improvement Recommendations */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Improvement Recommendations</h2>
        <div className="space-y-3">
          {(stats?.duplicateGroups || 0) > 0 && (
            <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
              <svg className="w-5 h-5 text-orange-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-orange-800">
                  Review {stats?.duplicateGroups} duplicate group{stats?.duplicateGroups !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  Merge duplicate records to create authoritative golden records
                </p>
              </div>
            </div>
          )}

          {records.filter((r) => r.qualityScore < 40).length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
              <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">
                  {records.filter((r) => r.qualityScore < 40).length} records with poor quality (&lt;40%)
                </p>
                <p className="text-xs text-red-600 mt-1">
                  Review and enrich these records to improve overall data quality
                </p>
              </div>
            </div>
          )}

          {(stats?.avgQualityScore || 0) >= 80 && (
            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
              <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-800">
                  Data quality is excellent!
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Your data is ready for ERP export
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QualityDashboard;
