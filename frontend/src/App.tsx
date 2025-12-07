import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';

// Pages
import DataSourcesPage from '@/pages/data-sources';
import NewDataSourcePage from '@/pages/data-sources/new';
import DataSourceDetailPage from '@/pages/data-sources/[id]';
import DiscoveryPage from '@/pages/discovery';
import ProcessDetailPage from '@/pages/discovery/processes/[id]';
import NetworkPage from '@/pages/discovery/network';
import SearchPage from '@/pages/SearchPage';
import DecisionsPage from '@/pages/DecisionsPage';
import SopPage from '@/pages/SopPage';
import AnalyticsPage from '@/pages/AnalyticsPage';

function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Welcome to the Enterprise AI Foundation Platform.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        {/* T044: Knowledge Search card */}
        <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow border border-blue-100">
          <h3 className="font-semibold text-lg mb-2 text-blue-900">Knowledge Search</h3>
          <p className="text-sm text-blue-700 mb-4">Search across all your organization's documents and communications</p>
          <a href="/search" className="text-blue-600 hover:underline text-sm font-medium">
            Search Now &rarr;
          </a>
        </div>

        <div className="p-6 bg-white rounded-lg shadow border">
          <h3 className="font-semibold text-lg mb-2">Data Sources</h3>
          <p className="text-sm text-gray-500 mb-4">Connect and manage your data sources</p>
          <a href="/data-sources" className="text-blue-600 hover:underline text-sm">
            Manage Sources &rarr;
          </a>
        </div>

        <div className="p-6 bg-white rounded-lg shadow border">
          <h3 className="font-semibold text-lg mb-2">Process Discovery</h3>
          <p className="text-sm text-gray-500 mb-4">Discover processes from your data</p>
          <a href="/discovery" className="text-blue-600 hover:underline text-sm">
            View Processes &rarr;
          </a>
        </div>

        <div className="p-6 bg-white rounded-lg shadow border">
          <h3 className="font-semibold text-lg mb-2">Network Analysis</h3>
          <p className="text-sm text-gray-500 mb-4">Analyze communication patterns</p>
          <a href="/discovery/network" className="text-blue-600 hover:underline text-sm">
            View Network &rarr;
          </a>
        </div>

        {/* T074: Decision Archaeology card */}
        <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg shadow border border-purple-100">
          <h3 className="font-semibold text-lg mb-2 text-purple-900">Decision Archaeology</h3>
          <p className="text-sm text-purple-700 mb-4">Discover and analyze organizational decisions</p>
          <a href="/decisions" className="text-purple-600 hover:underline text-sm font-medium">
            Explore Decisions &rarr;
          </a>
        </div>

        {/* T089: SOP Management card */}
        <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow border border-green-100">
          <h3 className="font-semibold text-lg mb-2 text-green-900">SOP Management</h3>
          <p className="text-sm text-green-700 mb-4">Generate and manage Standard Operating Procedures</p>
          <a href="/sop" className="text-green-600 hover:underline text-sm font-medium">
            Manage SOPs &rarr;
          </a>
        </div>

        {/* T103: Process Analytics card */}
        <div className="p-6 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg shadow border border-orange-100">
          <h3 className="font-semibold text-lg mb-2 text-orange-900">Process Analytics</h3>
          <p className="text-sm text-orange-700 mb-4">Monitor health, detect anomalies, optimize processes</p>
          <a href="/analytics" className="text-orange-600 hover:underline text-sm font-medium">
            View Analytics &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Login</h1>
          <p className="text-muted-foreground">Sign in to your account</p>
        </div>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Data Sources */}
      <Route
        path="/data-sources"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DataSourcesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/data-sources/new"
        element={
          <ProtectedRoute>
            <AppLayout>
              <NewDataSourcePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/data-sources/:id"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DataSourceDetailPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Search (T043) */}
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SearchPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Discovery */}
      <Route
        path="/discovery"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DiscoveryPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/discovery/processes/:processId"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ProcessDetailPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/discovery/network"
        element={
          <ProtectedRoute>
            <AppLayout>
              <NetworkPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Decisions (T074) */}
      <Route
        path="/decisions"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DecisionsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* SOP (T089) */}
      <Route
        path="/sop"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SopPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Analytics (T103) */}
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AnalyticsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Redirect root to dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
