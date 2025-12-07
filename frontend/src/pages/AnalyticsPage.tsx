/**
 * Analytics Page (T103, T127)
 * Process optimization and predictive analytics
 */

import React, { useState } from 'react';
import { OptimizationPanel } from '../components/optimization';
import { HealthDashboard, AnomalyList } from '../components/predictions';

type Tab = 'optimization' | 'health' | 'anomalies';

interface AnalyticsPageProps {
  processId?: string;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  processId = 'process-1', // Default for demo
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('health');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'health', label: 'Health Score', icon: '❤️' },
    { id: 'optimization', label: 'Optimization', icon: '⚡' },
    { id: 'anomalies', label: 'Anomalies', icon: '🔔' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Process Analytics</h1>
        <p className="text-gray-600 mt-2">
          Monitor health, detect anomalies, and optimize processes
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-gray-50 rounded-lg p-6">
        {activeTab === 'health' && (
          <HealthDashboard processId={processId} />
        )}

        {activeTab === 'optimization' && (
          <OptimizationPanel processId={processId} />
        )}

        {activeTab === 'anomalies' && (
          <AnomalyList processId={processId} />
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
