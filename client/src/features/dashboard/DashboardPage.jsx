import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, ShoppingCart, Users, Package,
  ArrowUpRight, AlertTriangle, Star, Building2,
} from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/app/store';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { usePermission } from '@/hooks/usePermission';
import { PageSpinner } from '@/components/ui/Spinner';

// ── Trend grouping helper ──────────────────────────────────────────────────────
// Aggregates daily trend rows into day / week / month buckets based on range length.
// Each output item: { date, total, txnCount, label }
function groupTrend(trend, days) {
  if (!trend?.length) return [];
  const toDate = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00');

  if (days <= 31) {
    // Daily — label: "5 Jan"
    return trend.map((d) => ({
      ...d,
      label: toDate(d.date).toLocaleDateString('en', { day: 'numeric', month: 'short' }),
    }));
  }

  if (days <= 89) {
    // Weekly — bucket by Monday
    const map = new Map();
    for (const d of trend) {
      const dt = toDate(d.date);
      const dow = dt.getDay(); // 0=Sun
      const diff = dow === 0 ? -6 : 1 - dow;
      const mon = new Date(dt);
      mon.setDate(dt.getDate() + diff);
      const key = mon.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { date: key, total: 0, txnCount: 0 });
      const b = map.get(key);
      b.total    += d.total    || 0;
      b.txnCount += d.txnCount || 0;
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        ...v,
        label: toDate(key).toLocaleDateString('en', { day: 'numeric', month: 'short' }),
      }));
  }

  // Monthly — label: "Jan '25"
  const map = new Map();
  for (const d of trend) {
    const key = String(d.date).slice(0, 7); // "2025-01"
    if (!map.has(key)) map.set(key, { date: key + '-01', total: 0, txnCount: 0 });
    const b = map.get(key);
    b.total    += d.total    || 0;
    b.txnCount += d.txnCount || 0;
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      ...v,
      label: toDate(key + '-15').toLocaleDateString('en', { month: 'short', year: '2-digit' }),
    }));
}

// ── Mini bar chart (pure SVG, no library) ──────────────────────────────────────
function BarChart({ data, color = '#FFA916' }) {
  if (!data?.length) return <div className="flex h-20 items-center justify-center text-xs text-gray-300">No data</div>;
  const max = Math.max(...data.map((d) => d.value ?? d.total ?? 0), 1);
  const W = 300;
  const H = 100;
  const labelH = 18;
  const chartH = H - labelH;
  const count = data.length;
  const gap = count > 20 ? 1 : count > 10 ? 2 : 4;
  const barW = Math.max(2, (W - gap * (count - 1)) / count);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      {data.map((d, i) => {
        const val = d.value ?? d.total ?? 0;
        const bh = Math.max((val / max) * chartH, val > 0 ? 2 : 0);
        const x = i * (barW + gap);
        const y = chartH - bh;
        // Only show labels when there's room: skip if too many bars
        const showLabel = count <= 31 || i % Math.ceil(count / 12) === 0;
        return (
          <g key={d.date ?? i}>
            <rect x={x} y={y} width={barW} height={bh}
              fill={val > 0 ? color : '#E5E7EB'} rx="2" />
            {showLabel && (
              <text x={x + barW / 2} y={H - 2}
                textAnchor="middle" fontSize="8" fill="#9CA3AF"
                fontFamily="system-ui, sans-serif">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, Icon, iconBg, sub }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 truncate">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700',
  void:      'bg-red-100 text-red-600',
  refund:    'bg-orange-100 text-orange-600',
  held:      'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

// ── Section card wrapper ───────────────────────────────────────────────────────
function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-gray-100 bg-white shadow-sm ${className}`}>
      <div className="flex items-center gap-2 border-b border-gray-50 px-5 py-4">
        {Icon && <Icon className="h-4 w-4 text-gray-400" />}
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Sales trend chart card ─────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: '7d',  days: 6  },
  { label: '30d', days: 29 },
  { label: '90d', days: 89 },
];

function SalesTrendCard({ trend, trendDays, period, onPeriod }) {
  const grouped   = groupTrend(trend, trendDays ?? 6);
  const periodTotal = grouped.reduce((s, d) => s + (d.total || 0), 0);
  const bucketLabel = trendDays <= 31 ? 'days' : trendDays <= 89 ? 'weeks' : 'months';

  return (
    <Card title="Revenue Trend" icon={TrendingUp}>
      {/* Period tabs */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {bucketLabel === 'days'   && `Last ${trendDays + 1} days`}
          {bucketLabel === 'weeks'  && `${grouped.length} week${grouped.length !== 1 ? 's' : ''}`}
          {bucketLabel === 'months' && `${grouped.length} months`}
          {': '}
          <span className="font-semibold text-gray-700">{formatCurrency(periodTotal)}</span>
        </p>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px]">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.label}
              onClick={() => onPeriod(p.label)}
              className={`px-2.5 py-1 font-medium transition-colors ${
                period === p.label
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <BarChart data={grouped} />
    </Card>
  );
}

// ── Branch comparison card (company admin+) ───────────────────────────────────
function BranchComparisonCard({ branches }) {
  if (!branches?.length) {
    return (
      <Card title="Branch Performance" icon={Building2}>
        <p className="text-sm text-gray-400">No branch data yet.</p>
      </Card>
    );
  }

  const maxMonth = Math.max(...branches.map((b) => b.monthSales), 1);

  return (
    <Card title="Branch Performance (This Month)" icon={Building2}>
      <div className="space-y-3">
        {branches.map((b, i) => (
          <div key={b.branchId}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700 truncate max-w-[120px]" title={b.branchName}>
                {i === 0 && <Star className="mr-1 inline h-3 w-3 text-secondary-500" />}
                {b.branchName}
              </span>
              <span className="text-gray-500">{formatCurrency(b.monthSales)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-secondary-500 transition-all duration-500"
                style={{ width: `${(b.monthSales / maxMonth) * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-right text-xs text-gray-400">
              Today: {formatCurrency(b.todaySales)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Top products card ──────────────────────────────────────────────────────────
function TopProductsCard({ products }) {
  if (!products?.length) {
    return (
      <Card title="Top Products (30 days)" icon={Package}>
        <p className="text-sm text-gray-400">No sales data yet.</p>
      </Card>
    );
  }

  const maxRevenue = Math.max(...products.map((p) => p.revenue), 1);

  return (
    <Card title="Top Products (30 days)" icon={Package}>
      <div className="space-y-3">
        {products.map((p, i) => (
          <div key={p.sku}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700 truncate max-w-[130px]" title={p.productName}>
                <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold">
                  {i + 1}
                </span>
                {p.productName}
              </span>
              <span className="text-gray-500">{formatCurrency(p.revenue)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary-500 transition-all duration-500"
                style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Recent transactions table ──────────────────────────────────────────────────
function RecentTransactionsCard({ transactions }) {
  if (!transactions?.length) {
    return (
      <Card title="Recent Transactions" icon={ShoppingCart} className="lg:col-span-2">
        <p className="text-sm text-gray-400">No transactions yet today.</p>
      </Card>
    );
  }

  return (
    <Card title="Recent Transactions" icon={ShoppingCart} className="lg:col-span-2">
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="pb-2 text-left">Ref</th>
              <th className="pb-2 text-left">Customer</th>
              <th className="pb-2 text-left hidden md:table-cell">Cashier</th>
              <th className="pb-2 text-left hidden lg:table-cell">Branch</th>
              <th className="pb-2 text-right">Amount</th>
              <th className="pb-2 text-center hidden sm:table-cell">Method</th>
              <th className="pb-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {transactions.map((t) => (
              <tr key={t.transactionId} className="hover:bg-gray-50/50 transition-colors">
                <td className="py-2.5 pr-4 font-mono text-xs text-gray-600">
                  {t.transactionNumber}
                </td>
                <td className="py-2.5 pr-4 text-gray-800 truncate max-w-[110px]">
                  {t.customerName}
                </td>
                <td className="py-2.5 pr-4 text-gray-500 hidden md:table-cell truncate max-w-[90px]">
                  {t.cashierName}
                </td>
                <td className="py-2.5 pr-4 text-gray-500 hidden lg:table-cell truncate max-w-[100px]">
                  {t.branchName}
                </td>
                <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">
                  {formatCurrency(t.totalAmount)}
                </td>
                <td className="py-2.5 pr-4 text-center hidden sm:table-cell">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {t.paymentMethod}
                  </span>
                </td>
                <td className="py-2.5 text-center">
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Low stock alert card ───────────────────────────────────────────────────────
function LowStockAlertCard({ count }) {
  return (
    <Card title="Stock Alerts" icon={AlertTriangle}>
      {count > 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <p className="text-3xl font-bold text-red-600">{count}</p>
          <p className="text-sm text-gray-500">product{count !== 1 ? 's' : ''} below reorder level</p>
          <a
            href="/app/inventory"
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
          >
            View Inventory <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <Package className="h-7 w-7 text-green-500" />
          </div>
          <p className="text-sm font-medium text-green-600">All stock levels are healthy</p>
        </div>
      )}
    </Card>
  );
}

// ── Platform summary (super_admin without tenant) ──────────────────────────────
function PlatformBanner({ platform }) {
  if (!platform) return null;
  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 px-5 py-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-primary-800">
          Platform Overview · {platform.activeCompanies} active{' '}
          {platform.activeCompanies === 1 ? 'company' : 'companies'} of {platform.totalCompanies} total
        </p>
        <p className="text-xs text-primary-600 mt-0.5">
          Showing platform-wide totals. Select a company from Admin to view tenant-specific data.
        </p>
      </div>
      <a href="/app/admin"
        className="shrink-0 rounded-lg bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-200 transition-colors">
        Go to Admin
      </a>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
  const [trendPeriod, setTrendPeriod] = useState('7d');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', activeCompanyId ?? 'platform', trendPeriod],
    queryFn: () => api.get('/reports/dashboard', { params: { period: trendPeriod } }).then((r) => r.data.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
    keepPreviousData: true,
  });

  const { hasCapability, user } = usePermission();
  const canViewSales = hasCapability('sales.view') || ['super_admin', 'company_admin', 'branch_manager', 'accountant'].includes(user?.role);
  const canViewInventory = hasCapability('inventory.view');
  const canViewCustomers = hasCapability('customers.view');
  const canCompareBranches = hasCapability('settings.manage') || hasCapability('platform.admin');

  if (isLoading) return <PageSpinner />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-gray-500">Could not load dashboard. Check that the server is running.</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-6">

      {/* Platform banner (super_admin only) */}
      {data?.platform && <PlatformBanner platform={data.platform} />}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {canViewSales && (
          <>
            <StatCard
              label="Today's Sales"
              value={formatCurrency(data?.todaySales ?? 0)}
              Icon={TrendingUp}
              iconBg="bg-secondary-500"
              sub={`${data?.todayTransactions ?? 0} transactions`}
            />
            <StatCard
              label="Transactions"
              value={data?.todayTransactions ?? 0}
              Icon={ShoppingCart}
              iconBg="bg-green-500"
              sub="completed today"
            />
          </>
        )}
        {canViewCustomers && canViewSales && (
          <StatCard
            label="Customers Served"
            value={data?.customersServed ?? 0}
            Icon={Users}
            iconBg="bg-purple-500"
            sub="today"
          />
        )}
        {canViewInventory && (
          <StatCard
            label="Low Stock Items"
            value={data?.lowStockCount ?? 0}
            Icon={Package}
            iconBg={data?.lowStockCount > 0 ? 'bg-red-500' : 'bg-gray-400'}
            sub={data?.lowStockCount > 0 ? 'need restocking' : 'all healthy'}
          />
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canViewSales && (
          <SalesTrendCard
            trend={data?.salesTrend}
            trendDays={data?.trendDays ?? 6}
            period={trendPeriod}
            onPeriod={setTrendPeriod}
          />
        )}
        {canCompareBranches
          ? <BranchComparisonCard branches={data?.branchComparison} />
          : canViewSales
          ? <TopProductsCard products={data?.topProducts} />
          : canViewInventory && <LowStockAlertCard count={data?.lowStockCount ?? 0} />
        }
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {canViewSales && <RecentTransactionsCard transactions={data?.recentTransactions} />}
        {canCompareBranches
          ? <TopProductsCard products={data?.topProducts} />
          : canViewInventory && <LowStockAlertCard count={data?.lowStockCount ?? 0} />
        }
      </div>
    </div>
  );
}
