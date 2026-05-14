import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, ShoppingCart, Users, BarChart2, Calendar,
  FileText, Scale, AlertTriangle, Package, Truck,
} from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/app/store';
import { formatCurrency } from '@/utils/formatters';
import { PageSpinner } from '@/components/ui/Spinner';

// ── Shared utilities ──────────────────────────────────────────────────────────

function toISO(d) { return d.toISOString().slice(0, 10); }

const today = toISO(new Date());

const PRESETS = [
  { label: 'Today',     days: 0  },
  { label: 'Last 7d',   days: 6  },
  { label: 'Last 30d',  days: 29 },
  { label: 'Last 90d',  days: 89 },
];

function DateRange({ startDate, endDate, preset, onStart, onEnd, onPreset }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => onPreset(p)}
            className={`px-3 py-2 font-medium transition-colors ${preset === p.label ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5">
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
        <input type="date" value={startDate} max={endDate}
          onChange={(e) => onStart(e.target.value)}
          className="text-xs border-none outline-none bg-transparent" />
        <span className="text-gray-400 text-xs">—</span>
        <input type="date" value={endDate} min={startDate} max={today}
          onChange={(e) => onEnd(e.target.value)}
          className="text-xs border-none outline-none bg-transparent" />
      </div>
    </div>
  );
}

function KPICard({ label, value, icon: Icon, sub, accent }) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${accent ? 'border-primary-200' : 'border-gray-100'}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}>
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

function SectionCard({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────

function groupTrend(trend, days) {
  if (!trend?.length) return [];
  const toDate = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00');
  if (days <= 31) return trend.map((d) => ({ ...d, label: toDate(d.date).toLocaleDateString('en', { day: 'numeric', month: 'short' }) }));
  if (days <= 89) {
    const map = new Map();
    for (const d of trend) {
      const dt = toDate(d.date); const dow = dt.getDay();
      const mon = new Date(dt); mon.setDate(dt.getDate() + (dow === 0 ? -6 : 1 - dow));
      const key = mon.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { date: key, total: 0, txnCount: 0 });
      const b = map.get(key); b.total += d.total || 0; b.txnCount += d.txnCount || 0;
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ ...v, label: toDate(key).toLocaleDateString('en', { day: 'numeric', month: 'short' }) }));
  }
  const map = new Map();
  for (const d of trend) {
    const key = String(d.date).slice(0, 7);
    if (!map.has(key)) map.set(key, { date: key + '-01', total: 0, txnCount: 0 });
    const b = map.get(key); b.total += d.total || 0; b.txnCount += d.txnCount || 0;
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ ...v, label: new Date(key + '-15T12:00:00').toLocaleDateString('en', { month: 'short', year: '2-digit' }) }));
}

function BarChart({ data, height = 130 }) {
  if (!data?.length) return <div className="flex items-center justify-center h-24 text-gray-300 text-sm">No data</div>;
  const max = Math.max(...data.map((d) => d.total), 1);
  const W = 360; const count = data.length;
  const gap = count > 20 ? 1 : count > 10 ? 2 : 3;
  const barW = Math.max(2, Math.floor((W - gap * (count - 1)) / count));
  const chartH = height - 22;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} aria-hidden>
      {data.map((d, i) => {
        const bh = Math.max(2, (d.total / max) * chartH);
        const x = i * (barW + gap);
        const showLabel = count <= 31 || i % Math.ceil(count / 14) === 0;
        return (
          <g key={d.date ?? i}>
            <rect x={x} y={chartH - bh} width={barW} height={bh} rx={2} fill="#FFA916" opacity={0.85} />
            {showLabel && <text x={x + barW / 2} y={height - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── Tab: Sales Summary ────────────────────────────────────────────────────────

function SalesTab() {
  const [startDate, setStart] = useState(toISO(new Date(Date.now() - 29 * 86400000)));
  const [endDate,   setEnd]   = useState(today);
  const [preset,    setPreset] = useState('Last 30d');

  const applyPreset = (p) => {
    const end = new Date(); const start = new Date();
    start.setDate(end.getDate() - p.days);
    setStart(toISO(start)); setEnd(toISO(end)); setPreset(p.label);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['reports-sales', startDate, endDate],
    queryFn:  () => api.get('/reports/sales', { params: { startDate, endDate } }).then((r) => r.data.data),
  });

  if (isLoading) return <PageSpinner />;
  const s = data?.summary;
  const days = Math.round((new Date(endDate) - new Date(startDate)) / 86400000);
  const trend = groupTrend(data?.trend ?? [], days);
  const bucketLabel = days <= 31 ? 'Daily' : days <= 89 ? 'Weekly' : 'Monthly';

  return (
    <div className="space-y-5">
      <DateRange startDate={startDate} endDate={endDate} preset={preset}
        onStart={(v) => { setStart(v); setPreset(''); }}
        onEnd={(v) => { setEnd(v); setPreset(''); }}
        onPreset={applyPreset} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Total Revenue"     value={formatCurrency(s?.totalSales ?? 0)} icon={TrendingUp} accent />
        <KPICard label="Transactions"      value={(s?.totalTxns ?? 0).toLocaleString()} icon={ShoppingCart} sub={`Avg ${formatCurrency(s?.avgTxn ?? 0)}`} />
        <KPICard label="Unique Customers"  value={(s?.uniqueCustomers ?? 0).toLocaleString()} icon={Users} />
        <KPICard label="Daily Average"     value={formatCurrency(
          (data?.trend ?? []).filter((d) => d.total > 0).length
            ? (s?.totalSales ?? 0) / (data.trend.filter((d) => d.total > 0).length)
            : 0
        )} icon={BarChart2} sub={`${(data?.trend ?? []).filter((d) => d.total > 0).length} active days`} />
      </div>

      <SectionCard title={`Revenue Trend — ${bucketLabel} · ${trend.length} ${days <= 31 ? 'days' : days <= 89 ? 'weeks' : 'months'}`}>
        <BarChart data={trend} height={140} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Top Products">
          {data?.topProducts?.length ? (
            <div className="space-y-2">
              {data.topProducts.map((p, i) => {
                const maxRev = data.topProducts[0]?.revenue || 1;
                return (
                  <div key={p.sku}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-700 font-medium truncate">{i + 1}. {p.productName}</span>
                      <span className="text-secondary-600 font-semibold ml-2 shrink-0">{formatCurrency(p.revenue)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-secondary-400" style={{ width: `${(p.revenue / maxRev) * 100}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{p.qtySold} units</p>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-center text-gray-400 text-sm py-6">No data</p>}
        </SectionCard>

        <SectionCard title="By Category">
          {data?.categories?.length ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-100">
                <th className="pb-2 text-left font-medium text-gray-500">Category</th>
                <th className="pb-2 text-right font-medium text-gray-500">Revenue</th>
                <th className="pb-2 text-right font-medium text-gray-500">Units</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.categories.map((c) => (
                  <tr key={c.categoryName}>
                    <td className="py-1.5 text-gray-700">{c.categoryName}</td>
                    <td className="py-1.5 text-right font-semibold">{formatCurrency(c.revenue)}</td>
                    <td className="py-1.5 text-right text-gray-500">{c.qtySold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-center text-gray-400 text-sm py-6">No data</p>}
        </SectionCard>

        <SectionCard title="Cashier Performance">
          {data?.cashiers?.length ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-100">
                <th className="pb-2 text-left font-medium text-gray-500">Cashier</th>
                <th className="pb-2 text-right font-medium text-gray-500">TXNs</th>
                <th className="pb-2 text-right font-medium text-gray-500">Revenue</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.cashiers.map((c) => (
                  <tr key={c.cashierName}>
                    <td className="py-1.5 text-gray-700 font-medium">{c.cashierName}</td>
                    <td className="py-1.5 text-right text-gray-500">{c.txnCount}</td>
                    <td className="py-1.5 text-right font-semibold">{formatCurrency(c.totalSales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-center text-gray-400 text-sm py-6">No data</p>}
        </SectionCard>
      </div>
    </div>
  );
}

// ── Tab: P&L Statement ────────────────────────────────────────────────────────

function PLRow({ label, value, bold, indent, positive, negative, separator }) {
  if (separator) return <tr><td colSpan={2} className="py-1"><div className="border-t border-gray-200" /></td></tr>;
  const textColor = positive ? 'text-green-700' : negative ? 'text-red-600' : 'text-gray-900';
  return (
    <tr>
      <td className={`py-1.5 text-sm ${indent ? 'pl-6' : ''} ${bold ? 'font-semibold' : 'text-gray-600'}`}>{label}</td>
      <td className={`py-1.5 text-right text-sm ${bold ? 'font-bold' : ''} ${textColor}`}>{formatCurrency(value)}</td>
    </tr>
  );
}

function PLTab() {
  const [startDate, setStart] = useState(toISO(new Date(Date.now() - 29 * 86400000)));
  const [endDate,   setEnd]   = useState(today);
  const [preset,    setPreset] = useState('Last 30d');

  const applyPreset = (p) => {
    const end = new Date(); const start = new Date();
    start.setDate(end.getDate() - p.days);
    setStart(toISO(start)); setEnd(toISO(end)); setPreset(p.label);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports-pl', startDate, endDate],
    queryFn:  () => api.get('/reports/pl', { params: { startDate, endDate } }).then((r) => r.data.data),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <p className="py-12 text-center text-gray-400">Failed to load P&L report. Please try again.</p>;

  const { income, cogs, grossProfit, grossMargin, operatingExpenses, operatingProfit, operatingMargin, expenseBreakdown, paymentBreakdown } = data;

  return (
    <div className="space-y-5">
      <DateRange startDate={startDate} endDate={endDate} preset={preset}
        onStart={(v) => { setStart(v); setPreset(''); }}
        onEnd={(v) => { setEnd(v); setPreset(''); }}
        onPreset={applyPreset} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Net Revenue (ex-VAT)" value={formatCurrency(income.netRevenue)} icon={TrendingUp} accent />
        <KPICard label="Gross Profit"   value={formatCurrency(grossProfit)}  icon={BarChart2}
          sub={`${grossMargin.toFixed(1)}% margin`} />
        <KPICard label="Operating Profit" value={formatCurrency(operatingProfit)} icon={Scale}
          sub={`${operatingMargin.toFixed(1)}% margin`} />
        <KPICard label="Returns"        value={formatCurrency(income.totalReturns)} icon={AlertTriangle}
          sub={`${income.returnCount} returns`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Full Income Statement */}
        <SectionCard title="Income Statement">
          <table className="w-full">
            <tbody>
              <tr><td colSpan={2} className="pb-1 text-xs font-bold uppercase tracking-widest text-gray-400">Revenue</td></tr>
              <PLRow label="Gross Sales Revenue"      value={income.grossRevenue} />
              <PLRow label="Less: VAT Collected"      value={-income.taxCollected} indent negative={income.taxCollected > 0} />
              <PLRow label="Revenue (ex-VAT)"         value={income.revenueExVat} bold />
              <PLRow label="Less: Sales Returns"      value={-income.totalReturns} indent negative={income.totalReturns > 0} />
              <PLRow label="Net Revenue"              value={income.netRevenue} bold positive={income.netRevenue > 0} />
              <PLRow separator />
              <tr><td colSpan={2} className="py-1 text-xs font-bold uppercase tracking-widest text-gray-400">Cost of Goods Sold</td></tr>
              <PLRow label="Cost of Goods Sold"       value={-cogs} indent negative={cogs > 0} />
              <PLRow separator />
              <PLRow label="Gross Profit"             value={grossProfit} bold positive={grossProfit > 0} negative={grossProfit < 0} />
              <tr>
                <td className="pb-1 text-xs text-gray-400">Gross Margin</td>
                <td className={`pb-1 text-right text-xs font-semibold ${grossMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {grossMargin.toFixed(2)}%
                </td>
              </tr>
              <PLRow separator />
              <tr><td colSpan={2} className="py-1 text-xs font-bold uppercase tracking-widest text-gray-400">Operating Expenses</td></tr>
              <PLRow label="Supplier Payments (period)" value={-operatingExpenses} indent negative={operatingExpenses > 0} />
              <PLRow separator />
              <PLRow label="Operating Profit"         value={operatingProfit} bold positive={operatingProfit > 0} negative={operatingProfit < 0} />
              <tr>
                <td className="pt-1 text-xs text-gray-400">Operating Margin</td>
                <td className={`pt-1 text-right text-xs font-semibold ${operatingMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {operatingMargin.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-400 italic">
            COGS = qty sold × product cost price. Operating expenses = all supplier payments in period.
          </p>
        </SectionCard>

        <div className="space-y-5">
          {/* Revenue by Payment Method */}
          <SectionCard title="Revenue by Payment Method">
            {paymentBreakdown?.length ? (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Method</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">TXNs</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Amount</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Share</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {paymentBreakdown.map((p) => (
                    <tr key={p.method}>
                      <td className="py-1.5 text-gray-700 font-medium">{p.method}</td>
                      <td className="py-1.5 text-right text-gray-500">{p.txnCount}</td>
                      <td className="py-1.5 text-right font-semibold">{formatCurrency(p.amount)}</td>
                      <td className="py-1.5 text-right text-gray-400 text-xs">
                        {income.grossRevenue > 0 ? ((p.amount / income.grossRevenue) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-center text-gray-400 text-sm py-6">No payment data</p>}
          </SectionCard>

          {/* Expense Breakdown by Supplier */}
          {expenseBreakdown?.length > 0 && (
            <SectionCard title="Expenses by Supplier">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Supplier</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Pmts</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {expenseBreakdown.map((e) => (
                    <tr key={e.supplierName}>
                      <td className="py-1.5 text-gray-700 font-medium">{e.supplierName}</td>
                      <td className="py-1.5 text-right text-gray-500">{e.paymentCount}</td>
                      <td className="py-1.5 text-right font-semibold text-red-600">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200">
                  <tr>
                    <td colSpan={2} className="pt-2 text-xs font-bold text-gray-700">Total</td>
                    <td className="pt-2 text-right text-xs font-bold text-red-600">{formatCurrency(operatingExpenses)}</td>
                  </tr>
                </tfoot>
              </table>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: AP Aging ─────────────────────────────────────────────────────────────

const AGING_BUCKETS = [
  { key: 'current', label: '0–30 days',  color: 'bg-green-100 text-green-700' },
  { key: '31_60',   label: '31–60 days', color: 'bg-amber-100 text-amber-700' },
  { key: '61_90',   label: '61–90 days', color: 'bg-orange-100 text-orange-700' },
  { key: 'over_90', label: '90+ days',   color: 'bg-red-100 text-red-700' },
];

function APAgingTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports-ap-aging'],
    queryFn:  () => api.get('/reports/ap-aging').then((r) => r.data.data),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <p className="py-12 text-center text-gray-400">Failed to load AP Aging report. Please try again.</p>;

  const { suppliers, totals } = data;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {AGING_BUCKETS.map((b) => (
          <div key={b.key} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${b.color}`}>{b.label}</span>
            <p className="mt-2 text-xl font-bold text-gray-900">{formatCurrency(totals[b.key])}</p>
          </div>
        ))}
      </div>

      <SectionCard title={`Outstanding AP — ${suppliers.length} supplier${suppliers.length !== 1 ? 's' : ''}`}>
        {suppliers.length === 0 ? (
          <p className="text-center text-gray-400 py-6">No outstanding balances</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Supplier</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Oldest Invoice</th>
                  <th className="pb-2 text-center text-xs font-medium text-gray-500">Days Out</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Bucket</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.map((s) => {
                  const bucket = AGING_BUCKETS.find((b) => b.key === s.bucket) ?? AGING_BUCKETS[0];
                  return (
                    <tr key={s.supplierId}>
                      <td className="py-2">
                        <p className="font-medium text-gray-900">{s.supplierName}</p>
                        <p className="text-xs text-gray-400">{s.phone || s.email || ''}</p>
                      </td>
                      <td className="py-2 text-gray-500 text-xs">{s.oldestInvoice ?? '—'}</td>
                      <td className="py-2 text-center font-mono text-sm">
                        {s.daysOutstanding !== null ? s.daysOutstanding : '—'}
                      </td>
                      <td className="py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${bucket.color}`}>
                          {bucket.label}
                        </span>
                      </td>
                      <td className="py-2 text-right font-semibold text-red-600">{formatCurrency(s.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-300">
                <tr>
                  <td colSpan={4} className="pt-2 text-sm font-bold text-gray-700">Total AP Outstanding</td>
                  <td className="pt-2 text-right text-sm font-bold text-red-600">{formatCurrency(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Tab: Balance Sheet ────────────────────────────────────────────────────────

function BSRow({ label, value, indent, bold, highlight }) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${indent ? 'pl-4' : ''} ${bold ? 'border-t border-gray-200 mt-1 pt-2' : ''}`}>
      <span className={bold ? 'font-bold text-gray-900' : indent ? 'text-gray-600' : 'font-medium text-gray-800'}>{label}</span>
      <span className={`font-${bold ? 'bold' : 'semibold'} ${highlight === 'pos' ? 'text-green-700' : highlight === 'neg' ? 'text-red-600' : 'text-gray-900'}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function BalanceSheetTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports-balance-sheet'],
    queryFn:  () => api.get('/reports/balance-sheet').then((r) => r.data.data),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <p className="py-12 text-center text-gray-400">Failed to load Balance Sheet. Please try again.</p>;

  const { assets, liabilities, equity } = data;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">Snapshot as of <strong>{data.asOf}</strong></p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Total Assets"      value={formatCurrency(assets.total)}      icon={Scale}   accent />
        <KPICard label="Total Liabilities" value={formatCurrency(liabilities.total)} icon={AlertTriangle} />
        <KPICard label="Equity"            value={formatCurrency(equity)}            icon={TrendingUp} />
        <KPICard label="Inventory Value"   value={formatCurrency(assets.inventory.total)} icon={Package}
          sub={`${assets.inventory.productCount} products`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Assets */}
        <SectionCard title="Assets">
          <div className="space-y-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cash & Bank</p>
            {assets.cashAndBank.accounts.map((a) => (
              <BSRow key={a.account_number} label={`${a.account_name} (${a.bank_name})`} value={a.balance} indent />
            ))}
            {assets.cashAndBank.accounts.length === 0 && <p className="text-xs text-gray-400 pl-4">No bank accounts</p>}
            <BSRow label="Total Cash & Bank" value={assets.cashAndBank.total} bold />

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-2">Inventory</p>
            <BSRow label={`Stock (${assets.inventory.totalUnits.toFixed(0)} units)`} value={assets.inventory.total} indent />
            <BSRow label="Total Inventory" value={assets.inventory.total} bold />

            <div className="mt-4 rounded-lg bg-primary-50 px-4 py-3 flex justify-between">
              <span className="text-sm font-bold text-primary-800">TOTAL ASSETS</span>
              <span className="text-sm font-bold text-primary-800">{formatCurrency(assets.total)}</span>
            </div>
          </div>
        </SectionCard>

        {/* Liabilities + Equity */}
        <div className="space-y-5">
          <SectionCard title="Liabilities">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Accounts Payable</p>
            {liabilities.accountsPayable.suppliers.map((s) => (
              <BSRow key={s.supplierName} label={s.supplierName} value={s.balance} indent />
            ))}
            {liabilities.accountsPayable.suppliers.length === 0 && <p className="text-xs text-gray-400 pl-4">No outstanding balances</p>}
            <BSRow label="Total AP" value={liabilities.accountsPayable.total} bold />
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 flex justify-between">
              <span className="text-sm font-bold text-red-800">TOTAL LIABILITIES</span>
              <span className="text-sm font-bold text-red-800">{formatCurrency(liabilities.total)}</span>
            </div>
          </SectionCard>

          <SectionCard title="Equity">
            <div className={`rounded-lg px-4 py-4 flex justify-between ${equity >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <span className={`text-base font-bold ${equity >= 0 ? 'text-green-800' : 'text-red-800'}`}>Net Equity (Assets − Liabilities)</span>
              <span className={`text-base font-bold ${equity >= 0 ? 'text-green-800' : 'text-red-800'}`}>{formatCurrency(equity)}</span>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Stock Valuation ──────────────────────────────────────────────────────

function StockTab() {
  const [branchId, setBranchId] = useState('');

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/branches').then((r) => r.data.data ?? []) });

  const { data, isLoading } = useQuery({
    queryKey: ['reports-stock', branchId],
    queryFn:  () => api.get('/reports/stock-valuation', { params: branchId ? { branchId } : {} }).then((r) => r.data.data),
  });

  if (isLoading) return <PageSpinner />;

  const { items = [], totalValue = 0, totalUnits = 0 } = data ?? {};
  const belowReorder = items.filter((i) => i.belowReorder);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-primary-500 focus:outline-none"
          value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KPICard label="Total Stock Value"   value={formatCurrency(totalValue)} icon={Package} accent />
        <KPICard label="Total Units"         value={totalUnits.toLocaleString()} icon={BarChart2} />
        <KPICard label="Below Reorder Level" value={belowReorder.length} icon={AlertTriangle}
          sub={belowReorder.length > 0 ? 'Needs restocking' : 'All adequately stocked'} />
      </div>

      <SectionCard title={`Stock by Product — ${items.length} lines`}>
        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-6">No inventory data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Product</th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-500">Category</th>
                  {!branchId && <th className="pb-2 text-left text-xs font-medium text-gray-500">Branch</th>}
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Qty</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Unit Cost</th>
                  <th className="pb-2 text-right text-xs font-medium text-gray-500">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={`${item.productId}-${item.branchId}`}
                    className={item.belowReorder ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    <td className="py-2">
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      <p className="text-xs text-gray-400">{item.sku}</p>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{item.category}</td>
                    {!branchId && <td className="py-2 text-gray-500 text-xs">{item.branchName}</td>}
                    <td className="py-2 text-right">
                      <span className={item.belowReorder ? 'text-amber-600 font-semibold' : 'text-gray-700'}>
                        {item.qty.toLocaleString()} {item.uom}
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-500">{item.unitCost > 0 ? formatCurrency(item.unitCost) : '—'}</td>
                    <td className="py-2 text-right font-semibold">{item.totalValue > 0 ? formatCurrency(item.totalValue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-300">
                <tr>
                  <td colSpan={branchId ? 3 : 4} className="pt-2 text-sm font-bold text-gray-700">Total</td>
                  <td className="pt-2 text-right text-sm font-bold">{formatCurrency(totalValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: 'sales',          label: 'Sales',          icon: TrendingUp,    finance: false },
  { id: 'pl',             label: 'P&L',            icon: FileText,      finance: true  },
  { id: 'ap-aging',       label: 'AP Aging',       icon: AlertTriangle, finance: true  },
  { id: 'balance-sheet',  label: 'Balance Sheet',  icon: Scale,         finance: true  },
  { id: 'stock',          label: 'Stock Value',    icon: Package,       finance: false },
];

export default function ReportsPage() {
  const [tab, setTab] = useState('sales');
  const user = useAuthStore((s) => s.user);
  const hasFinance = user?.role === 'super_admin' || !!user?.planFeatures?.hasFinance;

  const visibleTabs = ALL_TABS.filter((t) => !t.finance || hasFinance);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Business analytics and financial statements</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 -mx-1 px-1">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'sales'         && <SalesTab />}
      {tab === 'pl'            && <PLTab />}
      {tab === 'ap-aging'      && <APAgingTab />}
      {tab === 'balance-sheet' && <BalanceSheetTab />}
      {tab === 'stock'         && <StockTab />}
    </div>
  );
}
