/**
 * Billing Report Component
 * SCALE Tier - Task T142
 *
 * Displays billing information and commission reports for resellers
 */

import React, { useState, useEffect, useMemo } from 'react';

// ==========================================================================
// Types
// ==========================================================================

interface BillingReportProps {
  resellerId: string;
}

interface BillingSummary {
  reseller: {
    id: string;
    name: string;
    tier: 'RESELLER_STARTER' | 'RESELLER_PROFESSIONAL' | 'RESELLER_ENTERPRISE';
  };
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

interface Invoice {
  id: string;
  resellerId: string;
  resellerName: string;
  period: { start: string; end: string };
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    entityId?: string;
    entityName?: string;
  }[];
  subtotal: number;
  commissionRate: number;
  commissionAmount: number;
  total: number;
  currency: string;
  status: 'draft' | 'pending' | 'paid' | 'overdue';
  dueDate: string;
  generatedAt: string;
}

interface CommissionReport {
  resellerId: string;
  resellerName: string;
  tier: string;
  period: { start: string; end: string };
  totalRevenue: number;
  commissionRate: number;
  commissionEarned: number;
  customerBreakdown: {
    entityId: string;
    entityName: string;
    revenue: number;
    commission: number;
  }[];
}

type TabId = 'overview' | 'invoices' | 'commission';

// ==========================================================================
// Utility Functions
// ==========================================================================

function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPeriod(period: { start: string; end: string }): string {
  return `${formatDate(period.start)} - ${formatDate(period.end)}`;
}

// ==========================================================================
// Sub Components
// ==========================================================================

interface StatCardProps {
  label: string;
  value: string;
  change?: number;
  icon?: React.ReactNode;
}

function StatCard({ label, value, change, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
          {change !== undefined && (
            <p
              className={`text-sm mt-1 flex items-center gap-1 ${
                change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              <svg
                className={`w-4 h-4 ${change < 0 ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
              {Math.abs(change).toFixed(1)}% vs last period
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">{icon}</div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const styles = {
    draft: 'bg-gray-100 text-gray-700',
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
}

function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={startDate}
        onChange={e => onStartChange(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      <span className="text-gray-500">to</span>
      <input
        type="date"
        value={endDate}
        onChange={e => onEndChange(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
    </div>
  );
}

// ==========================================================================
// Tab: Overview
// ==========================================================================

interface OverviewTabProps {
  summary: BillingSummary | null;
  isLoading: boolean;
}

function OverviewTab({ summary, isLoading }: OverviewTabProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-12 text-gray-500">
        No billing data available for this period
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(summary.summary.totalRevenue)}
          change={summary.trends.revenueChange}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Commission Earned"
          value={formatCurrency(summary.summary.totalCommission)}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Customers"
          value={summary.summary.customerCount.toString()}
          change={summary.trends.customerChange}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Active Users"
          value={summary.summary.userCount.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          }
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Breakdown</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-gray-600">Gross Revenue</span>
            <span className="font-medium">{formatCurrency(summary.summary.totalRevenue)}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b text-green-600">
            <span>Commission ({summary.reseller.tier.split('_').pop()} Tier)</span>
            <span className="font-medium">-{formatCurrency(summary.summary.totalCommission)}</span>
          </div>
          <div className="flex items-center justify-between py-2 text-lg font-semibold">
            <span>Net Payable</span>
            <span>{formatCurrency(summary.summary.netPayable)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// Tab: Invoices
// ==========================================================================

interface InvoicesTabProps {
  resellerId: string;
  startDate: string;
  endDate: string;
}

function InvoicesTab({ resellerId, startDate, endDate }: InvoicesTabProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const params = new URLSearchParams({ startDate, endDate });
        const response = await fetch(`/api/resellers/${resellerId}/invoice?${params}`);
        if (response.ok) {
          const data = await response.json();
          setInvoice(data);
        }
      } catch (err) {
        console.error('Failed to fetch invoice:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoice();
  }, [resellerId, startDate, endDate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12 text-gray-500">
        No invoice available for this period
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Invoice Header */}
      <div className="p-6 border-b">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{invoice.id}</h3>
            <p className="text-gray-500 mt-1">{formatPeriod(invoice.period)}</p>
          </div>
          <div className="text-right">
            <StatusBadge status={invoice.status} />
            <p className="text-sm text-gray-500 mt-2">
              Due: {formatDate(invoice.dueDate)}
            </p>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Description
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Qty
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Unit Price
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {invoice.lineItems.map((item, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{item.description}</p>
                  {item.entityName && (
                    <p className="text-sm text-gray-500">{item.entityName}</p>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-gray-600">{item.quantity}</td>
                <td className="px-6 py-4 text-right text-gray-600">
                  {formatCurrency(item.unitPrice)}
                </td>
                <td className="px-6 py-4 text-right font-medium">
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="p-6 bg-gray-50 space-y-2">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>{formatCurrency(invoice.subtotal)}</span>
        </div>
        <div className="flex justify-between text-green-600">
          <span>Commission ({invoice.commissionRate}%)</span>
          <span>-{formatCurrency(invoice.commissionAmount)}</span>
        </div>
        <div className="flex justify-between text-xl font-bold pt-2 border-t">
          <span>Total Due</span>
          <span>{formatCurrency(invoice.total)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="p-6 border-t flex justify-end gap-3">
        <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          Download PDF
        </button>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Export CSV
        </button>
      </div>
    </div>
  );
}

// ==========================================================================
// Tab: Commission
// ==========================================================================

interface CommissionTabProps {
  resellerId: string;
  startDate: string;
  endDate: string;
}

function CommissionTab({ resellerId, startDate, endDate }: CommissionTabProps) {
  const [report, setReport] = useState<CommissionReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCommission = async () => {
      try {
        const params = new URLSearchParams({ startDate, endDate });
        const response = await fetch(`/api/resellers/${resellerId}/commission?${params}`);
        if (response.ok) {
          const data = await response.json();
          setReport(data);
        }
      } catch (err) {
        console.error('Failed to fetch commission:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCommission();
  }, [resellerId, startDate, endDate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12 text-gray-500">
        No commission data available for this period
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="text-2xl font-semibold mt-1">{formatCurrency(report.totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Commission Rate</p>
          <p className="text-2xl font-semibold mt-1">{report.commissionRate}%</p>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-5">
          <p className="text-sm text-green-700">Commission Earned</p>
          <p className="text-2xl font-semibold text-green-800 mt-1">
            {formatCurrency(report.commissionEarned)}
          </p>
        </div>
      </div>

      {/* Customer Breakdown */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Commission by Customer</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Customer
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Revenue
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Commission
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {report.customerBreakdown.map(customer => (
                <tr key={customer.entityId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {customer.entityName}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">
                    {formatCurrency(customer.revenue)}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-green-600">
                    {formatCurrency(customer.commission)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-6 py-4 font-semibold">Total</td>
                <td className="px-6 py-4 text-right font-semibold">
                  {formatCurrency(report.totalRevenue)}
                </td>
                <td className="px-6 py-4 text-right font-semibold text-green-600">
                  {formatCurrency(report.commissionEarned)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

export function BillingReport({ resellerId }: BillingReportProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    date.setDate(0); // Last day of previous month
    return date.toISOString().split('T')[0];
  });

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ startDate, endDate });
        const response = await fetch(`/api/resellers/${resellerId}/billing?${params}`);
        if (response.ok) {
          const data = await response.json();
          setSummary(data);
        }
      } catch (err) {
        console.error('Failed to fetch billing summary:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [resellerId, startDate, endDate]);

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'invoices' as const, label: 'Invoices' },
    { id: 'commission' as const, label: 'Commission' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Billing & Commission</h2>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab summary={summary} isLoading={isLoading} />}
      {activeTab === 'invoices' && (
        <InvoicesTab resellerId={resellerId} startDate={startDate} endDate={endDate} />
      )}
      {activeTab === 'commission' && (
        <CommissionTab resellerId={resellerId} startDate={startDate} endDate={endDate} />
      )}
    </div>
  );
}

export default BillingReport;
