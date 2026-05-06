import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ShoppingCart, Users, BarChart2, Calendar } from 'lucide-react';
import api from '@/services/api';
import { formatCurrency } from '@/utils/formatters';
import { PageSpinner } from '@/components/ui/Spinner';

// ── Trend grouping (same logic as Dashboard) ──────────────────────────────────
// days = endDate - startDate in days. Outputs { date, total, txnCount, label }[].
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
      const dow = dt.getDay();
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
    const key = String(d.date).slice(0, 7);
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

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────
function BarChart({ data, height = 130 }) {
  if (!data?.length) return <div className="flex items-center justify-center h-24 text-gray-300 text-sm">No data</div>;
  const max = Math.max(...data.map((d) => d.total), 1);
  const W = 360;
  const count = data.length;
  const gap   = count > 20 ? 1 : count > 10 ? 2 : 3;
  const barW  = Math.max(2, Math.floor((W - gap * (count - 1)) / count));
  const chartH = height - 22;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} aria-hidden>
      {data.map((d, i) => {
        const bh = Math.max(2, (d.total / max) * chartH);
        const x  = i * (barW + gap);
        // Only render label if there's enough horizontal room
        const showLabel = count <= 31 || i % Math.ceil(count / 14) === 0;
        return (
          <g key={d.date ?? i}>
            <rect x={x} y={chartH - bh} width={barW} height={bh} rx={2}
              fill="#FFA916" opacity={0.85} />
            {showLabel && (
              <text x={x + barW / 2} y={height - 4}
                textAnchor="middle" fontSize={8} fill="#9ca3af">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, icon: Icon, sub }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Date Range Picker ─────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Today',      days: 0 },
  { label: 'Last 7d',   days: 6 },
  { label: 'Last 30d',  days: 29 },
  { label: 'Last 90d',  days: 89 },
];

function toISO(d) { return d.toISOString().slice(0, 10); }

export default function ReportsPage() {
  const today = toISO(new Date());
  const [startDate, setStartDate] = useState(toISO(new Date(Date.now() - 29 * 86400000)));
  const [endDate, setEndDate]     = useState(today);
  const [preset, setPreset]       = useState('Last 30d');

  const applyPreset = (p) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - p.days);
    setStartDate(toISO(start));
    setEndDate(toISO(end));
    setPreset(p.label);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['reports-sales', startDate, endDate],
    queryFn: () => api.get('/reports/sales', { params: { startDate, endDate } }).then((r) => r.data.data),
    keepPreviousData: true,
  });

  if (isLoading) return <PageSpinner />;

  const s         = data?.summary;
  const rawTrend  = data?.trend ?? [];
  const days      = Math.round((new Date(endDate) - new Date(startDate)) / 86400000);
  const trend     = groupTrend(rawTrend, days);
  const bucketLabel = days <= 31 ? 'Daily' : days <= 89 ? 'Weekly' : 'Monthly';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(startDate).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' — '}
            {new Date(endDate).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        {/* Date controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className={`px-3 py-2 font-medium transition-colors ${preset === p.label ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            <input type="date" value={startDate} max={endDate}
              onChange={(e) => { setStartDate(e.target.value); setPreset(''); }}
              className="text-xs border-none outline-none bg-transparent" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={endDate} min={startDate} max={today}
              onChange={(e) => { setEndDate(e.target.value); setPreset(''); }}
              className="text-xs border-none outline-none bg-transparent" />
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Total Revenue" value={formatCurrency(s?.totalSales ?? 0)} icon={TrendingUp} />
        <KPICard label="Transactions" value={(s?.totalTxns ?? 0).toLocaleString()} icon={ShoppingCart}
          sub={`Avg ${formatCurrency(s?.avgTxn ?? 0)}`} />
        <KPICard label="Unique Customers" value={(s?.uniqueCustomers ?? 0).toLocaleString()} icon={Users} />
        <KPICard label="Daily Average" value={formatCurrency(
          rawTrend.filter((d) => d.total > 0).length
            ? (s?.totalSales ?? 0) / rawTrend.filter((d) => d.total > 0).length
            : 0
        )} icon={BarChart2} sub={`over ${rawTrend.filter((d) => d.total > 0).length} active days`} />
      </div>

      {/* Sales trend */}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Revenue Trend</h2>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
            {bucketLabel} · {trend.length} {days <= 31 ? 'days' : days <= 89 ? 'weeks' : 'months'}
          </span>
        </div>
        <BarChart data={trend} height={140} />
      </div>

      {/* Bottom 3-col grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Top Products */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Top Products</h2>
          {data?.topProducts?.length ? (
            <div className="space-y-2">
              {data.topProducts.map((p, i) => {
                const maxRev = data.topProducts[0]?.revenue || 1;
                return (
                  <div key={p.sku}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-700 font-medium truncate">{i + 1}. {p.productName}</span>
                      <span className="text-secondary-600 font-semibold ml-2 flex-shrink-0">{formatCurrency(p.revenue)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-secondary-400" style={{ width: `${(p.revenue / maxRev) * 100}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{p.qtySold} units sold</p>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-center text-gray-400 text-sm py-6">No data</p>}
        </div>

        {/* Category breakdown */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">By Category</h2>
          {data?.categories?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left font-medium text-gray-500">Category</th>
                    <th className="pb-2 text-right font-medium text-gray-500">Revenue</th>
                    <th className="pb-2 text-right font-medium text-gray-500">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.categories.map((c) => (
                    <tr key={c.categoryName}>
                      <td className="py-1.5 text-gray-700">{c.categoryName}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900">{formatCurrency(c.revenue)}</td>
                      <td className="py-1.5 text-right text-gray-500">{c.qtySold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-center text-gray-400 text-sm py-6">No data</p>}
        </div>

        {/* Cashier performance */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Cashier Performance</h2>
          {data?.cashiers?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left font-medium text-gray-500">Cashier</th>
                    <th className="pb-2 text-right font-medium text-gray-500">TXNs</th>
                    <th className="pb-2 text-right font-medium text-gray-500">Revenue</th>
                    <th className="pb-2 text-right font-medium text-gray-500">Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.cashiers.map((c) => (
                    <tr key={c.cashierName}>
                      <td className="py-1.5 text-gray-700 font-medium">{c.cashierName}</td>
                      <td className="py-1.5 text-right text-gray-500">{c.txnCount}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900">{formatCurrency(c.totalSales)}</td>
                      <td className="py-1.5 text-right text-gray-500">{formatCurrency(c.avgTxn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-center text-gray-400 text-sm py-6">No data</p>}
        </div>
      </div>
    </div>
  );
}
