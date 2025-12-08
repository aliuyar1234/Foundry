/**
 * ConnectorMarketplace Page (T193)
 * Grid of available connectors with category filtering and search
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectorCard, ConnectorCardSkeleton, ConnectorType } from '../../components/connectors/ConnectorCard';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';

// Mock data - in real app, this would come from an API
const AVAILABLE_CONNECTORS: ConnectorType[] = [
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Connect to Salesforce CRM to sync contacts, accounts, opportunities, and activities',
    category: 'CRM',
    logo: '/connectors/salesforce.svg',
    status: 'available',
    features: ['Bi-directional sync', 'Real-time updates', 'Custom field mapping'],
    version: '2.1.0',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Integrate with HubSpot CRM for contacts, companies, deals, and engagement tracking',
    category: 'CRM',
    logo: '/connectors/hubspot.svg',
    status: 'available',
    features: ['Contact sync', 'Deal tracking', 'Email integration'],
    version: '1.8.5',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Connect to Slack workspace for message analysis and communication patterns',
    category: 'Communication',
    logo: '/connectors/slack.svg',
    status: 'available',
    features: ['Message analysis', 'Channel monitoring', 'User activity tracking'],
    version: '3.2.1',
  },
  {
    id: 'microsoft-teams',
    name: 'Microsoft Teams',
    description: 'Integrate Microsoft Teams for communication analytics and collaboration insights',
    category: 'Communication',
    logo: '/connectors/teams.svg',
    status: 'available',
    features: ['Chat analysis', 'Meeting data', 'Team collaboration metrics'],
    version: '2.0.3',
  },
  {
    id: 'datev',
    name: 'DATEV',
    description: 'Connect to DATEV accounting system for financial data and document management',
    category: 'Accounting',
    logo: '/connectors/datev.svg',
    status: 'available',
    features: ['Financial data sync', 'Document import', 'Compliance reporting'],
    version: '1.5.2',
  },
  {
    id: 'bmd',
    name: 'BMD',
    description: 'Integrate BMD accounting software for Austrian market financial management',
    category: 'Accounting',
    logo: '/connectors/bmd.svg',
    status: 'available',
    features: ['Accounting sync', 'Invoice processing', 'Tax compliance'],
    version: '1.3.0',
  },
  {
    id: 'sap',
    name: 'SAP ERP',
    description: 'Connect to SAP ERP system for comprehensive enterprise resource planning data',
    category: 'ERP',
    logo: '/connectors/sap.svg',
    status: 'beta',
    features: ['Master data sync', 'Transaction import', 'Real-time integration'],
    version: '0.9.1',
  },
  {
    id: 'oracle',
    name: 'Oracle ERP',
    description: 'Integrate Oracle ERP Cloud for financial and operational data synchronization',
    category: 'ERP',
    logo: '/connectors/oracle.svg',
    status: 'coming_soon',
    features: ['Financial modules', 'Supply chain data', 'HR integration'],
  },
  {
    id: 'sharepoint',
    name: 'SharePoint',
    description: 'Connect to SharePoint for document management and collaboration data',
    category: 'DMS',
    logo: '/connectors/sharepoint.svg',
    status: 'available',
    features: ['Document sync', 'Metadata extraction', 'Version tracking'],
    version: '2.4.0',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Integrate Google Drive for file storage and document collaboration analytics',
    category: 'DMS',
    logo: '/connectors/drive.svg',
    status: 'available',
    features: ['File sync', 'Sharing analysis', 'Activity tracking'],
    version: '1.9.2',
  },
];

type CategoryFilter = ConnectorType['category'] | 'All';

export function ConnectorMarketplace() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('All');
  const [isLoading] = useState(false);

  // Get unique categories
  const categories: CategoryFilter[] = useMemo(() => {
    const cats = Array.from(new Set(AVAILABLE_CONNECTORS.map((c) => c.category)));
    return ['All', ...cats];
  }, []);

  // Filter connectors based on search and category
  const filteredConnectors = useMemo(() => {
    return AVAILABLE_CONNECTORS.filter((connector) => {
      const matchesSearch =
        searchTerm === '' ||
        connector.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        connector.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'All' || connector.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  // Count connectors by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: AVAILABLE_CONNECTORS.length };
    AVAILABLE_CONNECTORS.forEach((connector) => {
      counts[connector.category] = (counts[connector.category] || 0) + 1;
    });
    return counts;
  }, []);

  const handleAddConnector = (connectorId: string) => {
    // Navigate to connector setup wizard
    navigate(`/connectors/setup/${connectorId}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Connector Marketplace</h1>
        <p className="text-gray-600">
          Connect your business systems to Foundry for comprehensive process discovery and analysis
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        {/* Search Bar */}
        <div className="relative max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Input
            type="text"
            placeholder="Search connectors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Category:</span>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {category} ({categoryCounts[category] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 flex items-center gap-4 text-sm text-gray-600">
        <span>
          Showing <strong>{filteredConnectors.length}</strong> of{' '}
          <strong>{AVAILABLE_CONNECTORS.length}</strong> connectors
        </span>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear search
          </button>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ConnectorCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredConnectors.length === 0 && (
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-10 h-10 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No connectors found</h3>
          <p className="text-gray-600 mb-4">
            Try adjusting your search or filter criteria
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('All');
            }}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Connector Grid */}
      {!isLoading && filteredConnectors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredConnectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              onAdd={handleAddConnector}
              isInstalled={false}
            />
          ))}
        </div>
      )}

      {/* Help Section */}
      <div className="mt-12 bg-blue-50 rounded-lg p-6 border border-blue-200">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Need a custom connector?
            </h3>
            <p className="text-blue-800 mb-3">
              If you don't see the connector you need, we can help you build a custom integration
              for your specific requirements.
            </p>
            <a
              href="/support/custom-connectors"
              className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
            >
              Request custom connector
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConnectorMarketplace;
