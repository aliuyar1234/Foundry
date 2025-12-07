/**
 * Routing Page
 * T062 - Create main routing page
 */

import React, { useState } from 'react';
import {
  RoutingDashboard,
  RuleEditor,
  ExpertFinder,
  DecisionHistory,
  RoutingAnalytics,
} from '../../components/routing';

type Tab = 'dashboard' | 'rules' | 'experts' | 'history' | 'analytics';

export function RoutingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'rules', label: 'Rules' },
    { id: 'experts', label: 'Find Experts' },
    { id: 'history', label: 'History' },
    { id: 'analytics', label: 'Analytics' },
  ];

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Intelligent Routing</h1>
        <p className="text-gray-500">
          Manage routing rules, find experts, and analyze routing performance
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'dashboard' && <RoutingDashboard />}
        {activeTab === 'rules' && <RuleEditor />}
        {activeTab === 'experts' && <ExpertFinder />}
        {activeTab === 'history' && <DecisionHistory />}
        {activeTab === 'analytics' && <RoutingAnalytics />}
      </div>
    </div>
  );
}

export default RoutingPage;
