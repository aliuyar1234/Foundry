/**
 * Process Detail Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ProcessFlowVisualization } from '../../../components/discovery/ProcessFlowVisualization';

export function ProcessDetailPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/discovery"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Discovery
        </Link>
      </div>

      <ProcessFlowVisualization />
    </div>
  );
}

export default ProcessDetailPage;
