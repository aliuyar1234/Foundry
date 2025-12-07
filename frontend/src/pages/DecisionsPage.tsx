/**
 * Decisions Page (T074)
 * Decision archaeology main page
 */

import React, { useState } from 'react';
import { DecisionList, DecisionTimeline, DecisionExtractor } from '../components/decisions';

type Tab = 'list' | 'timeline' | 'extract';

export const DecisionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'list', label: 'All Decisions', icon: '📋' },
    { id: 'timeline', label: 'Timeline', icon: '📅' },
    { id: 'extract', label: 'Extract', icon: '🔍' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Decision Archaeology</h1>
        <p className="text-gray-600 mt-2">
          Discover, document, and analyze organizational decisions
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
        {activeTab === 'list' && (
          <DecisionList
            onSelect={(decision) => setSelectedDecisionId(decision.id)}
          />
        )}

        {activeTab === 'timeline' && (
          <DecisionTimeline
            onSelect={(id) => setSelectedDecisionId(id)}
          />
        )}

        {activeTab === 'extract' && (
          <DecisionExtractor
            onExtracted={(decisions) => {
              console.log('Extracted decisions:', decisions);
              // Switch to list view after extraction
              if (decisions.length > 0) {
                setActiveTab('list');
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

export default DecisionsPage;
