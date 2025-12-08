/**
 * Reseller Dashboard
 * SCALE Tier - Task T136
 *
 * Main dashboard for reseller account management
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ==========================================================================
// Types
// ==========================================================================

interface ResellerAccount {
  id: string;
  name: string;
  contactEmail: string;
  billingEmail: string;
  tier: 'RESELLER_STARTER' | 'RESELLER_PROFESSIONAL' | 'RESELLER_ENTERPRISE';
  commissionRate: number;
  isActive: boolean;
  createdAt: string;
  _count?: {
    entities: number;
  };
}

interface Customer {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: string;
}

interface BillingSummary {
  period: { start: string; end: string };
  summary: {
    totalRevenue: number;
    totalCommission: number;
    netPayable: number;
    customerCount: number;
    userCount: number;
  };
  trends: {
    revenueChange: number;
    customerChange: number;
  };
}

// ==========================================================================
// API Hooks
// ==========================================================================

function useReseller(resellerId: string) {
  const [reseller, setReseller] = useState<ResellerAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReseller = async () => {
      try {
        const response = await fetch(`/api/resellers/${resellerId}`);
        if (!response.ok) throw new Error('Failed to fetch reseller');
        const data = await response.json();
        setReseller(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReseller();
  }, [resellerId]);

  return { reseller, isLoading, error };
}

function useCustomers(resellerId: string) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await fetch(`/api/resellers/${resellerId}/customers`);
        if (!response.ok) throw new Error('Failed to fetch customers');
        const data = await response.json();
        setCustomers(data.customers);
        setTotal(data.total);
      } catch (err) {
        console.error('Error fetching customers:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomers();
  }, [resellerId]);

  return { customers, total, isLoading };
}

function useBilling(resellerId: string) {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBilling = async () => {
      try {
        const response = await fetch(`/api/resellers/${resellerId}/billing`);
        if (!response.ok) throw new Error('Failed to fetch billing');
        const data = await response.json();
        setBilling(data);
      } catch (err) {
        console.error('Error fetching billing:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBilling();
  }, [resellerId]);

  return { billing, isLoading };
}

// ==========================================================================
// Components
// ==========================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
}

function StatCard({ title, value, change, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
          {change !== undefined && (
            <p
              className={`text-sm mt-1 ${
                change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {change >= 0 ? '+' : ''}
              {change.toFixed(1)}% from last period
            </p>
          )}
        </div>
        <div className="p-3 bg-blue-50 rounded-full">{icon}</div>
      </div>
    </div>
  );
}

interface TierBadgeProps {
  tier: ResellerAccount['tier'];
}

function TierBadge({ tier }: TierBadgeProps) {
  const colors = {
    RESELLER_STARTER: 'bg-gray-100 text-gray-800',
    RESELLER_PROFESSIONAL: 'bg-blue-100 text-blue-800',
    RESELLER_ENTERPRISE: 'bg-purple-100 text-purple-800',
  };

  const labels = {
    RESELLER_STARTER: 'Starter',
    RESELLER_PROFESSIONAL: 'Professional',
    RESELLER_ENTERPRISE: 'Enterprise',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[tier]}`}>
      {labels[tier]}
    </span>
  );
}

function CustomerStatusBadge({ status }: { status: Customer['status'] }) {
  const colors = {
    ACTIVE: 'bg-green-100 text-green-800',
    SUSPENDED: 'bg-yellow-100 text-yellow-800',
    ARCHIVED: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
      {status}
    </span>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

interface ResellerDashboardProps {
  resellerId: string;
}

export function ResellerDashboard({ resellerId }: ResellerDashboardProps) {
  const navigate = useNavigate();
  const { reseller, isLoading: resellerLoading, error } = useReseller(resellerId);
  const { customers, total: customerCount, isLoading: customersLoading } = useCustomers(resellerId);
  const { billing, isLoading: billingLoading } = useBilling(resellerId);

  if (resellerLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !reseller) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error || 'Reseller not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{reseller.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <TierBadge tier={reseller.tier} />
            <span className="text-gray-500">|</span>
            <span className="text-gray-600">
              Commission Rate: {reseller.commissionRate}%
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/reseller/${resellerId}/branding`)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Branding Settings
          </button>
          <button
            onClick={() => navigate(`/reseller/${resellerId}/customers/new`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Customer
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Customers"
          value={customerCount}
          change={billing?.trends.customerChange}
          icon={
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          title="Monthly Revenue"
          value={billing ? `€${billing.summary.totalRevenue.toLocaleString()}` : '-'}
          change={billing?.trends.revenueChange}
          icon={
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Commission Earned"
          value={billing ? `€${billing.summary.totalCommission.toLocaleString()}` : '-'}
          icon={
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
            </svg>
          }
        />
        <StatCard
          title="Active Users"
          value={billing?.summary.userCount || 0}
          icon={
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => navigate(`/reseller/${resellerId}/domain`)}
          className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Custom Domain</p>
              <p className="text-sm text-gray-500">Configure your domain</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate(`/reseller/${resellerId}/billing`)}
          className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Billing Reports</p>
              <p className="text-sm text-gray-500">View invoices & commission</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate(`/reseller/${resellerId}/settings`)}
          className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Account Settings</p>
              <p className="text-sm text-gray-500">Manage your account</p>
            </div>
          </div>
        </button>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Customers</h2>
          <button
            onClick={() => navigate(`/reseller/${resellerId}/customers`)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          {customersLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : customers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No customers yet</p>
              <button
                onClick={() => navigate(`/reseller/${resellerId}/customers/new`)}
                className="mt-2 text-blue-600 hover:text-blue-700"
              >
                Add your first customer
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {customers.slice(0, 5).map(customer => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{customer.name}</p>
                        <p className="text-sm text-gray-500">{customer.slug}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <CustomerStatusBadge status={customer.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => navigate(`/reseller/${resellerId}/customers/${customer.id}`)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResellerDashboard;
