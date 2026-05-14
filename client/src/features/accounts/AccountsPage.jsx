import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, ChevronRight, ChevronDown, Edit2, Trash2, Sparkles, Layers, Calendar, Scale, AlertTriangle, BarChart2, Printer, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api from '@/services/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/utils/formatters';

const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
const sel = inp + ' bg-white';
const Field = ({ label, children, required }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-700">
      {label}{required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    {children}
  </div>
);

const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const TYPE_LABELS = { asset: 'Asset', liability: 'Liability', equity: 'Equity', revenue: 'Revenue', expense: 'Expense' };
const TYPE_COLORS = {
  asset:     'bg-blue-100 text-blue-700',
  liability: 'bg-red-100 text-red-700',
  equity:    'bg-purple-100 text-purple-700',
  revenue:   'bg-green-100 text-green-700',
  expense:   'bg-orange-100 text-orange-700',
};

// ── Account Modal ─────────────────────────────────────────────────────────────

function AccountModal({ account, accounts, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!account;

  const [form, setForm] = useState({
    account_code:      account?.account_code ?? '',
    account_name:      account?.account_name ?? '',
    account_type:      account?.account_type ?? 'asset',
    account_subtype:   account?.account_subtype ?? '',
    parent_account_id: account?.parent_account_id ?? '',
    description:       account?.description ?? '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const parents = accounts.filter(
    (a) => a.account_type === form.account_type && a.account_id !== account?.account_id
  );

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit
      ? api.patch(`/accounts/${account.account_id}`, data)
      : api.post('/accounts', data),
    onSuccess: () => {
      toast.success(isEdit ? 'Account updated' : 'Account created');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSave = () => {
    if (!form.account_code || !form.account_name) { toast.error('Code and name are required'); return; }
    mutate({ ...form, parent_account_id: form.parent_account_id || null });
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Account' : 'Add Account'}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth loading={isPending} onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Create Account'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account Code" required>
            <input value={form.account_code} onChange={(e) => set('account_code', e.target.value)}
              placeholder="e.g. 1100" className={inp} disabled={account?.is_system} />
          </Field>
          <Field label="Account Type" required>
            <select value={form.account_type} onChange={(e) => { set('account_type', e.target.value); set('parent_account_id', ''); }}
              className={sel} disabled={isEdit}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Account Name" required>
          <input value={form.account_name} onChange={(e) => set('account_name', e.target.value)}
            placeholder="e.g. Accounts Receivable" className={inp} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subtype">
            <input value={form.account_subtype} onChange={(e) => set('account_subtype', e.target.value)}
              placeholder="e.g. current_asset" className={inp} />
          </Field>
          <Field label="Parent Account">
            <select value={form.parent_account_id} onChange={(e) => set('parent_account_id', e.target.value)} className={sel}>
              <option value="">None (top-level)</option>
              {parents.map((a) => (
                <option key={a.account_id} value={a.account_id}>{a.account_code} — {a.account_name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)}
            className={inp + ' resize-none'} placeholder="Optional description" />
        </Field>
      </div>
    </Modal>
  );
}

// ── Print helpers ─────────────────────────────────────────────────────────────

const fmtKES = (n) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n ?? 0);

const TB_PRINT_STYLES = `<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px;line-height:1.5}
  h1{font-size:20px;font-weight:700;letter-spacing:1px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #222;margin-bottom:20px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
  .balanced{background:#dcfce7;color:#166534}.unbalanced{background:#fef9c3;color:#854d0e}
  table{width:100%;border-collapse:collapse}
  th{background:#f0f0f0;padding:8px 10px;font-size:11px;text-transform:uppercase;color:#555;border-bottom:2px solid #ccc;text-align:left}
  td{padding:6px 10px;border-bottom:1px solid #eee;font-size:12px}
  .r{text-align:right}.mono{font-family:monospace}
  tfoot td{font-weight:bold;border-top:2px solid #333;background:#f9f9f9;font-size:13px}
  @media print{body{padding:16px}}
</style>`;

const TYPE_PRINT_COLORS = { asset:'#1d4ed8', liability:'#dc2626', equity:'#7c3aed', revenue:'#15803d', expense:'#ea580c' };

function printTrialBalance(data, asOf) {
  const { rows = [], totalDebits, totalCredits, difference } = data;
  const balanced = Math.abs(difference) < 0.01;
  const rowsHtml = rows.filter((r) => r.hasData).map((row) => `<tr>
    <td class="mono">${row.accountCode}</td>
    <td>${row.accountName}</td>
    <td style="color:${TYPE_PRINT_COLORS[row.accountType] ?? '#555'};text-transform:capitalize">${row.accountType}</td>
    <td class="r mono">${row.debit > 0 ? fmtKES(row.debit) : '—'}</td>
    <td class="r mono">${row.credit > 0 ? fmtKES(row.credit) : '—'}</td>
  </tr>`).join('');

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Trial Balance — ${asOf}</title>${TB_PRINT_STYLES}</head><body>
    <div class="hdr">
      <div><h1>TRIAL BALANCE</h1><p style="color:#555;margin-top:4px">As of: <strong>${asOf}</strong></p></div>
      <div style="text-align:right">
        <span class="badge ${balanced ? 'balanced' : 'unbalanced'}">${balanced ? '✓ Balanced' : '⚠ Out of Balance'}</span>
        ${!balanced ? `<p style="font-size:12px;color:#854d0e;margin-top:6px">Difference: ${fmtKES(Math.abs(difference))}</p>` : ''}
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width:80px">Code</th><th>Account Name</th>
        <th style="width:90px">Type</th>
        <th class="r" style="width:140px">Debit (Dr)</th>
        <th class="r" style="width:140px">Credit (Cr)</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr>
        <td colspan="3" class="r">TOTALS</td>
        <td class="r mono">${fmtKES(totalDebits)}</td>
        <td class="r mono">${fmtKES(totalCredits)}</td>
      </tr></tfoot>
    </table>
    <script>window.onload=()=>window.print()</script>
  </body></html>`);
  w.document.close();
}

// ── Trial Balance Tab ─────────────────────────────────────────────────────────

const TB_TYPE_COLORS = {
  asset:     'text-blue-700',
  liability: 'text-red-600',
  equity:    'text-purple-700',
  revenue:   'text-green-700',
  expense:   'text-orange-600',
};

function TrialBalanceTab() {
  const [asOf, setAsOf] = useState(todayISO);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports-trial-balance', asOf],
    queryFn:  () => api.get('/reports/trial-balance', { params: { asOf } }).then((r) => r.data.data),
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !data) return <p className="py-12 text-center text-gray-400">Failed to load Trial Balance.</p>;

  const { rows = [], totalDebits, totalCredits, difference } = data;
  const balanced = Math.abs(difference) < 0.01;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs text-gray-500">As of</span>
            <input type="date" value={asOf} max={todayISO} onChange={(e) => setAsOf(e.target.value)}
              className="text-xs border-none outline-none bg-transparent" />
          </div>
          {balanced ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Balanced</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Out of balance by {formatCurrency(Math.abs(difference))}
            </span>
          )}
        </div>
        <button onClick={() => printTrialBalance(data, asOf)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <Printer className="h-3.5 w-3.5" />Print
        </button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <Scale className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-sm text-gray-700">Trial Balance — as of {formatDate(asOf)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-20" />
              <col />
              <col className="w-24" />
              <col className="w-32" />
              <col className="w-32" />
            </colgroup>
            <thead className="bg-gray-50/50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Account Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-blue-600">Debit (Dr)</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-green-600">Credit (Cr)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.accountCode} className={!row.hasData ? 'opacity-40' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{row.accountCode}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 truncate">{row.accountName}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium capitalize ${TB_TYPE_COLORS[row.accountType] ?? 'text-gray-600'}`}>
                      {row.accountType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {row.debit > 0 ? <span className="text-blue-700 font-semibold">{formatCurrency(row.debit)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {row.credit > 0 ? <span className="text-green-700 font-semibold">{formatCurrency(row.credit)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-400">
              <tr className="font-bold bg-gray-50">
                <td colSpan={3} className="px-4 py-3 text-sm text-gray-800">TOTALS</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatCurrency(totalDebits)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatCurrency(totalCredits)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Account Ledger Modal ──────────────────────────────────────────────────────

function toISO(d) { return d.toISOString().slice(0, 10); }
const todayISO = toISO(new Date());

const ENTRY_TYPE_COLORS = {
  SALE:    'bg-green-100 text-green-700',
  GRN:     'bg-blue-100 text-blue-700',
  PAYMENT: 'bg-red-100 text-red-600',
  RETURN:  'bg-amber-100 text-amber-700',
};

function AccountLedgerModal({ account, onClose }) {
  const [startDate, setStart] = useState(toISO(new Date(Date.now() - 29 * 86400000)));
  const [endDate,   setEnd]   = useState(todayISO);
  const [page, setPage]       = useState(1);

  const { data: balanceData } = useQuery({
    queryKey: ['account-balance', account.account_id],
    queryFn:  () => api.get(`/accounts/${account.account_id}/balance`).then((r) => r.data.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['account-ledger', account.account_id, startDate, endDate, page],
    queryFn:  () => api.get(`/accounts/${account.account_id}/ledger`, {
      params: { startDate, endDate, page, limit: 30 },
    }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const { refetch: fetchAllForExport, isFetching: isExporting } = useQuery({
    queryKey: ['account-ledger-export', account.account_id, startDate, endDate],
    queryFn:  () => api.get(`/accounts/${account.account_id}/ledger`, {
      params: { startDate, endDate, page: 1, limit: 5000 },
    }).then((r) => r.data.data),
    enabled: false,
    gcTime: 0,
  });

  const handleExport = async () => {
    const result = await fetchAllForExport();
    const allEntries = result.data?.entries ?? [];
    const header = ['Date', 'Type', 'Reference', 'Description', 'Debit (Dr)', 'Credit (Cr)', 'Balance'];
    const rows = allEntries.map((e) => [
      e.entryDate ? new Date(e.entryDate).toLocaleDateString('en-KE') : '',
      e.sourceType ?? '',
      e.sourceRef ?? e.entryNumber ?? '',
      e.description ?? '',
      e.debit ?? 0,
      e.credit ?? 0,
      e.balance ?? '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, account.account_code);
    XLSX.writeFile(wb, `Ledger_${account.account_code}_${startDate}_to_${endDate}.xlsx`);
  };

  const { entries = [], total = 0, pages = 1 } = data ?? {};

  return (
    <Modal open onClose={onClose} size="xl"
      title={
        <div>
          <p className="text-sm font-semibold text-gray-900">
            <span className="font-mono text-gray-500 mr-2">{account.account_code}</span>
            {account.account_name}
          </p>
          <p className="text-xs text-gray-400 capitalize mt-0.5">{account.account_type} account</p>
        </div>
      }
      footer={
        <div className="flex gap-3">
          <button onClick={handleExport} disabled={isExporting}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors">
            <Download className="h-4 w-4" />{isExporting ? 'Exporting…' : 'Export to Excel'}
          </button>
          <Button variant="secondary" fullWidth onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Balance summary */}
        {balanceData && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Balance', value: balanceData.balance ?? 0, accent: true },
              { label: 'Total Debits',  value: balanceData.totalDebits  ?? 0 },
              { label: 'Total Credits', value: balanceData.totalCredits ?? 0 },
            ].map(({ label, value, accent }) => (
              <div key={label} className={`rounded-lg p-3 text-center ${accent ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'}`}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-base font-bold mt-0.5 ${accent ? 'text-primary-700' : 'text-gray-800'}`}>{formatCurrency(value)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Date filters */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 w-fit">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <input type="date" value={startDate} max={endDate}
            onChange={(e) => { setStart(e.target.value); setPage(1); }}
            className="text-xs border-none outline-none bg-transparent" />
          <span className="text-gray-400 text-xs">—</span>
          <input type="date" value={endDate} min={startDate} max={todayISO}
            onChange={(e) => { setEnd(e.target.value); setPage(1); }}
            className="text-xs border-none outline-none bg-transparent" />
        </div>

        {/* Ledger table */}
        {isLoading ? <PageSpinner /> : entries.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">No entries for this period</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-24" />   {/* Date */}
                <col className="w-20" />   {/* Type */}
                <col className="w-28" />   {/* Reference */}
                <col />                    {/* Description — takes remaining space */}
                <col className="w-28" />   {/* Dr */}
                <col className="w-28" />   {/* Cr */}
                <col className="w-28" />   {/* Balance */}
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Reference</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-blue-600">Dr</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-green-600">Cr</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e, idx) => (
                  <tr key={`${e.lineId ?? e.entryId ?? idx}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDate(e.entryDate)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ENTRY_TYPE_COLORS[e.sourceType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {e.sourceType ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 truncate">{e.sourceRef ?? e.entryNumber}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700">
                      <p className="truncate" title={e.description}>{e.description}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {e.debit > 0 ? <span className="font-semibold text-blue-700">{formatCurrency(e.debit)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {e.credit > 0 ? <span className="font-semibold text-green-700">{formatCurrency(e.credit)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono text-xs font-semibold ${e.balance != null ? (e.balance >= 0 ? 'text-gray-800' : 'text-red-600') : 'text-gray-300'}`}>
                      {e.balance != null ? formatCurrency(e.balance) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Page {page} of {pages} · {total} records</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="rounded border px-3 py-1 disabled:opacity-40 hover:bg-gray-50">Prev</button>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
                className="rounded border px-3 py-1 disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Account Row ────────────────────────────────────────────────────────────────

// Normal balance side: debit accounts (asset/expense) → balance shows in Dr column
//                     credit accounts (liability/equity/revenue) → balance shows in Cr column
const DEBIT_NORMAL = new Set(['asset', 'expense']);

function AccountRow({ account, depth, allAccounts, balanceMap, onEdit, onDelete, onViewLedger }) {
  const [expanded, setExpanded] = useState(true);
  const children = allAccounts.filter((a) => a.parent_account_id === account.account_id);

  const bal = balanceMap?.[account.account_code];
  const isDebitNormal = DEBIT_NORMAL.has(account.account_type);

  // Amounts to show
  const drAmt  = bal?.debit  ?? 0;
  const crAmt  = bal?.credit ?? 0;
  const hasAmt = drAmt > 0 || crAmt > 0;

  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors ${!account.is_active ? 'opacity-50' : ''}`}>
        <td className="px-4 py-2.5" style={{ paddingLeft: `${16 + depth * 24}px` }}>
          <div className="flex items-center gap-2">
            {children.length > 0 ? (
              <button onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-600">
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-3.5" />
            )}
            <span className="font-mono text-xs text-gray-500 w-14 flex-shrink-0">{account.account_code}</span>
            <span className="text-sm font-medium text-gray-900">{account.account_name}</span>
            {account.is_system && (
              <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">system</span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-500">{account.account_subtype || '—'}</td>

        {/* Debit column */}
        <td className="px-4 py-2.5 text-right font-mono text-xs">
          {drAmt > 0
            ? <span className={`font-semibold ${isDebitNormal ? 'text-blue-700' : 'text-gray-500'}`}>{formatCurrency(drAmt)}</span>
            : <span className="text-gray-300">—</span>}
        </td>

        {/* Credit column */}
        <td className="px-4 py-2.5 text-right font-mono text-xs">
          {crAmt > 0
            ? <span className={`font-semibold ${!isDebitNormal ? 'text-green-700' : 'text-gray-500'}`}>{formatCurrency(crAmt)}</span>
            : <span className="text-gray-300">—</span>}
        </td>

        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => onViewLedger(account)} title="View ledger"
              className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
              <Layers className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onEdit(account)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600 transition-colors">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            {!account.is_system && (
              <button onClick={() => onDelete(account)}
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && children.map((child) => (
        <AccountRow key={child.account_id} account={child} depth={depth + 1}
          allAccounts={allAccounts} balanceMap={balanceMap}
          onEdit={onEdit} onDelete={onDelete} onViewLedger={onViewLedger} />
      ))}
    </>
  );
}

// ── Opening Balances Modal ────────────────────────────────────────────────────

function OpeningBalancesModal({ accounts, onClose }) {
  const qc = useQueryClient();
  // Only show balance-sheet accounts (asset, liability, equity)
  const eligible = accounts.filter((a) => ['asset', 'liability', 'equity'].includes(a.account_type) && a.is_active);
  const [amounts, setAmounts] = useState({});

  const setAmt = (id, val) => setAmounts((prev) => ({ ...prev, [id]: val }));

  const { mutate, isPending } = useMutation({
    mutationFn: (entries) => api.post('/journal/opening-balances', { entries }),
    onSuccess: () => {
      toast.success('Opening balances posted');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['trial-balance-coa'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Post failed'),
  });

  const handleSubmit = () => {
    const entries = eligible
      .filter((a) => parseFloat(amounts[a.account_id] || 0) > 0)
      .map((a) => ({
        accountId:     a.account_id,
        amount:        parseFloat(amounts[a.account_id]),
        normalBalance: DEBIT_NORMAL.has(a.account_type) ? 'debit' : 'credit',
        description:   `Opening balance — ${a.account_name}`,
      }));
    if (!entries.length) { toast.error('Enter at least one non-zero amount'); return; }
    mutate(entries);
  };

  const grouped = {};
  for (const a of eligible) {
    if (!grouped[a.account_type]) grouped[a.account_type] = [];
    grouped[a.account_type].push(a);
  }

  return (
    <Modal open onClose={onClose} title="Post Opening Balances"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth loading={isPending} onClick={handleSubmit}>Post Balances</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Enter existing balances for each account. Each entry is automatically balanced against Owner&apos;s Equity (3000). Leave blank or zero to skip.
        </p>
        {['asset', 'liability', 'equity'].map((type) => {
          const accs = grouped[type] ?? [];
          if (!accs.length) return null;
          return (
            <div key={type}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 capitalize">{TYPE_LABELS[type]}</p>
              <div className="space-y-1.5">
                {accs.map((a) => (
                  <div key={a.account_id} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-500 w-12 shrink-0">{a.account_code}</span>
                    <span className="text-xs text-gray-700 flex-1 truncate">{a.account_name}</span>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={amounts[a.account_id] ?? ''}
                      onChange={(e) => setAmt(a.account_id, e.target.value)}
                      className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-primary-500 focus:outline-none" />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const qc = useQueryClient();
  const [editTarget,      setEditTarget]      = useState(null);
  const [createOpen,      setCreateOpen]      = useState(false);
  const [deleteTarget,    setDeleteTarget]    = useState(null);
  const [ledgerTarget,    setLedgerTarget]    = useState(null);
  const [typeFilter,      setTypeFilter]      = useState('');
  const [activeTab,       setActiveTab]       = useState('accounts');
  const [openingBalOpen,  setOpeningBalOpen]  = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data.data),
  });

  // Fetch trial balance to get Dr/Cr amounts per account (best-effort — no spinner on failure)
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: tbData } = useQuery({
    queryKey: ['trial-balance-coa', todayStr],
    queryFn:  () => api.get('/reports/trial-balance', { params: { asOf: todayStr } }).then((r) => r.data.data),
    enabled:  accounts.length > 0,
    staleTime: 60_000,
  });

  // Map accountCode → { debit, credit }
  const balanceMap = useMemo(() => {
    const m = {};
    for (const row of tbData?.rows ?? []) {
      if (row.hasData) m[row.accountCode] = { debit: row.debit, credit: row.credit };
    }
    return m;
  }, [tbData]);

  const seedMut = useMutation({
    mutationFn: () => api.post('/accounts/seed-defaults'),
    onSuccess: (r) => {
      toast.success(`Seeded ${r.data.data.seeded} default accounts`);
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Seed failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/accounts/${id}`),
    onSuccess: () => {
      toast.success('Account deactivated');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const filtered = typeFilter ? accounts.filter((a) => a.account_type === typeFilter) : accounts;
  const topLevel = filtered.filter((a) => !a.parent_account_id);
  const grouped  = useMemo(() => {
    const g = {};
    TYPES.forEach((t) => { g[t] = accounts.filter((a) => a.account_type === t); });
    return g;
  }, [accounts]);

  const displayTypes = typeFilter ? [typeFilter] : TYPES;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Chart of Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{accounts.length} accounts</p>
        </div>
        {activeTab === 'accounts' && (
          <div className="flex items-center gap-2">
            {accounts.length === 0 && (
              <Button variant="secondary" size="sm" icon={<Sparkles className="h-4 w-4" />}
                loading={seedMut.isPending} onClick={() => seedMut.mutate()}>
                Seed Defaults
              </Button>
            )}
            {accounts.length > 0 && (
              <Button variant="secondary" size="sm" icon={<Layers className="h-4 w-4" />}
                onClick={() => setOpeningBalOpen(true)}>
                Opening Balances
              </Button>
            )}
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Add Account
            </Button>
          </div>
        )}
      </div>

      {/* Top-level tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {[
          { id: 'accounts',      label: 'Accounts',      icon: BookOpen },
          { id: 'trial-balance', label: 'Trial Balance', icon: Scale    },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Trial Balance */}
      {activeTab === 'trial-balance' && <TrialBalanceTab />}

      {/* Accounts (CoA) */}
      {activeTab === 'accounts' && (
        <>
          {/* Type filter tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            <button onClick={() => setTypeFilter('')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${!typeFilter ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              All ({accounts.length})
            </button>
            {TYPES.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${typeFilter === t ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {TYPE_LABELS[t]} ({grouped[t]?.length ?? 0})
              </button>
            ))}
          </div>

          {isLoading ? <PageSpinner /> : (
            <div className="space-y-4">
              {displayTypes.map((type) => {
                const typeAccounts = accounts.filter((a) => a.account_type === type);
                const roots = typeAccounts.filter((a) => !a.parent_account_id);
                if (roots.length === 0) return null;
                return (
                  <div key={type} className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    <div className={`px-4 py-2.5 flex items-center gap-2 border-b border-gray-100 ${TYPE_COLORS[type]} bg-opacity-30`}>
                      <BookOpen className="h-4 w-4" />
                      <span className="font-semibold text-sm">{TYPE_LABELS[type]}</span>
                      <span className="text-xs opacity-70">({typeAccounts.length})</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-100 bg-gray-50/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Account</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Subtype</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-blue-600">Debit (Dr)</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-green-600">Credit (Cr)</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {roots.map((acc) => (
                          <AccountRow key={acc.account_id} account={acc} depth={0}
                            allAccounts={typeAccounts}
                            balanceMap={balanceMap}
                            onEdit={setEditTarget}
                            onDelete={setDeleteTarget}
                            onViewLedger={setLedgerTarget} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {accounts.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
                  <BookOpen className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">No accounts yet</p>
                  <p className="text-gray-400 text-sm mt-1">Click "Seed Defaults" to load a standard chart of accounts, or add accounts manually.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {openingBalOpen && (
        <OpeningBalancesModal accounts={accounts} onClose={() => setOpeningBalOpen(false)} />
      )}
      {createOpen && (
        <AccountModal accounts={accounts} onClose={() => setCreateOpen(false)} />
      )}
      {editTarget && (
        <AccountModal account={editTarget} accounts={accounts} onClose={() => setEditTarget(null)} />
      )}
      {ledgerTarget && (
        <AccountLedgerModal account={ledgerTarget} onClose={() => setLedgerTarget(null)} />
      )}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Deactivate Account" size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button fullWidth loading={deleteMut.isPending}
              onClick={() => deleteMut.mutate(deleteTarget?.account_id)}
              className="!bg-red-600 hover:!bg-red-700">
              Deactivate
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">
          Deactivate <strong>{deleteTarget?.account_name}</strong>? It will no longer appear in dropdowns but historical records are preserved.
        </p>
      </Modal>
    </div>
  );
}
