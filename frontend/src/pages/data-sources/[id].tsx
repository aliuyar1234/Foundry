/**
 * Data Source Detail Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { DataSourceDetail } from '../../components/data-sources/DataSourceDetail';

export function DataSourceDetailPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/data-sources"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Data Sources
        </Link>
      </div>

      <DataSourceDetail />
    </div>
  );
}

export default DataSourceDetailPage;
