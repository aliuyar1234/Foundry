/**
 * Data Sources List Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { DataSourceList } from '../../components/data-sources/DataSourceList';

export function DataSourcesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Data Sources</h1>
          <p className="text-gray-500">
            Connect and manage your organization's data sources
          </p>
        </div>
        <Link to="/data-sources/new">
          <Button>Connect New Source</Button>
        </Link>
      </div>

      <DataSourceList />
    </div>
  );
}

export default DataSourcesPage;
