/**
 * New Data Source Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { DataSourceConnect } from '../../components/data-sources/DataSourceConnect';

export function NewDataSourcePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/data-sources"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Data Sources
        </Link>
        <h1 className="text-2xl font-bold mt-2">Connect Data Source</h1>
        <p className="text-gray-500">
          Choose a data source type and configure the connection
        </p>
      </div>

      <DataSourceConnect />
    </div>
  );
}

export default NewDataSourcePage;
