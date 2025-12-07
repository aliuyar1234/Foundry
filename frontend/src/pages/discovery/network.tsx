/**
 * Network Analysis Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { NetworkGraph } from '../../components/discovery/NetworkGraph';

export function NetworkPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/discovery"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Discovery
        </Link>
        <h1 className="text-2xl font-bold mt-2">Communication Network</h1>
        <p className="text-gray-500">
          Visualize communication patterns across your organization
        </p>
      </div>

      <NetworkGraph />
    </div>
  );
}

export default NetworkPage;
