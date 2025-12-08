/**
 * Customer List Component
 * SCALE Tier - Task T137
 *
 * Displays list of customers for a reseller
 */

import React, { useState, useEffect, useCallback } from 'react';

// ==========================================================================
// Types
// ==========================================================================

interface Customer {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  configuration: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface CustomerListProps {
  resellerId: string;
  onCustomerSelect?: (customer: Customer) => void;
  onAddCustomer?: () => void;
}

// ==========================================================================
// Status Badge Component
// ==========================================================================

function StatusBadge({ status }: { status: Customer['status'] }) {
  const styles = {
    ACTIVE: 'bg-green-100 text-green-800 border-green-200',
    SUSPENDED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    ARCHIVED: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ==========================================================================
// Search & Filter Component
// ==========================================================================

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
}

function FilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="flex-1">
        <div className="relative">
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>
      <div className="flex gap-2">
        <select
          value={statusFilter}
          onChange={e => onStatusChange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
    </div>
  );
}

// ==========================================================================
// Customer Card Component
// ==========================================================================

interface CustomerCardProps {
  customer: Customer;
  onSelect?: () => void;
  onSuspend?: () => void;
  onActivate?: () => void;
}

function CustomerCard({ customer, onSelect, onSuspend, onActivate }: CustomerCardProps) {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {customer.name}
            </h3>
            <p className="text-sm text-gray-500 truncate">{customer.slug}</p>
          </div>
          <StatusBadge status={customer.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Created</p>
            <p className="font-medium">
              {new Date(customer.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Last Updated</p>
            <p className="font-medium">
              {new Date(customer.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 pt-4 border-t border-gray-100">
          <button
            onClick={onSelect}
            className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            View Details
          </button>
          {customer.status === 'ACTIVE' ? (
            <button
              onClick={onSuspend}
              className="px-3 py-2 text-sm font-medium text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
            >
              Suspend
            </button>
          ) : customer.status === 'SUSPENDED' ? (
            <button
              onClick={onActivate}
              className="px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            >
              Activate
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// Empty State Component
// ==========================================================================

function EmptyState({ onAddCustomer }: { onAddCustomer?: () => void }) {
  return (
    <div className="text-center py-12">
      <svg
        className="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
      <h3 className="mt-4 text-lg font-medium text-gray-900">No customers yet</h3>
      <p className="mt-2 text-sm text-gray-500">
        Get started by adding your first customer to your reseller account.
      </p>
      {onAddCustomer && (
        <button
          onClick={onAddCustomer}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add Customer
        </button>
      )}
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

export function CustomerList({
  resellerId,
  onCustomerSelect,
  onAddCustomer,
}: CustomerListProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 12;

  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        skip: ((page - 1) * pageSize).toString(),
        take: pageSize.toString(),
      });

      if (statusFilter) {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/resellers/${resellerId}/customers?${params}`);
      if (!response.ok) throw new Error('Failed to fetch customers');

      const data = await response.json();
      setCustomers(data.customers);
      setTotalPages(Math.ceil(data.total / pageSize));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [resellerId, page, statusFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSuspend = async (customerId: string) => {
    if (!confirm('Are you sure you want to suspend this customer?')) return;

    try {
      const response = await fetch(`/api/entities/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SUSPENDED' }),
      });

      if (!response.ok) throw new Error('Failed to suspend customer');
      fetchCustomers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to suspend customer');
    }
  };

  const handleActivate = async (customerId: string) => {
    try {
      const response = await fetch(`/api/entities/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      });

      if (!response.ok) throw new Error('Failed to activate customer');
      fetchCustomers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to activate customer');
    }
  };

  // Filter customers by search query (client-side)
  const filteredCustomers = customers.filter(customer => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.slug.toLowerCase().includes(query)
    );
  });

  if (isLoading && customers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          onClick={fetchCustomers}
          className="mt-2 text-red-600 hover:text-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={status => {
          setStatusFilter(status);
          setPage(1);
        }}
      />

      {filteredCustomers.length === 0 ? (
        <EmptyState onAddCustomer={onAddCustomer} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCustomers.map(customer => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                onSelect={() => onCustomerSelect?.(customer)}
                onSuspend={() => handleSuspend(customer.id)}
                onActivate={() => handleActivate(customer.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CustomerList;
