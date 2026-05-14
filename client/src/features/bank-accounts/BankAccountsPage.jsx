import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, Edit2, Star, TrendingUp, TrendingDown, BookOpen, Calendar, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/utils/formatters';

const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
const sel = inp + ' bg-white';
const Field = ({ label, children, hint }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
  </div>
);

// ── Bank Account Modal ────────────────────────────────────────────────────────

function BankAccountModal({ account, accounts: coaAccounts, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!account;

  const [form, setForm] = useState({
    account_name:    account?.account_name    ?? '',
    bank_name:       account?.bank_name       ?? '',
    account_number:  account?.account_number  ?? '',
    bank_branch:     account?.bank_branch     ?? '',
    currency:        account?.currency        ?? 'KES',
    opening_balance: account?.opening_balance ?? '0',
    is_default:      account?.is_default      ?? false,
    account_id:      account?.account_id      ?? '',
    notes:           account?.notes           ?? '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit
      ? api.patch(`/bank-accounts/${account.bank_account_id}`, data)
      : api.post('/bank-accounts', data),
    onSuccess: () => {
      toast.success(isEdit ? 'Bank account updated' : 'Bank account added');
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSave = () => {
    if (!form.account_name) { toast.error('Account name is required'); return; }
    if (!form.bank_name)    { toast.error('Bank name is required');    return; }
    mutate({ ...form, account_id: form.account_id || null, opening_balance: parseFloat(form.opening_balance) || 0 });
  };

  const assetAccounts = (Array.isArray(coaAccounts) ? coaAccounts : []).filter((a) => a.account_type === 'asset' && a.is_active);

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Bank Account' : 'Add Bank Account'}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth loading={isPending} onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Add Account'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Account Name *">
              <input value={form.account_name} onChange={(e) => set('account_name', e.target.value)}
                placeholder="e.g. KCB Business Account" className={inp} />
            </Field>
          </div>
          <Field label="Bank Name *">
            <input value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)}
              placeholder="e.g. KCB Bank" className={inp} />
          </Field>
          <Field label="Account Number">
            <input value={form.account_number} onChange={(e) => set('account_number', e.target.value)}
              placeholder="1234567890" className={inp} />
          </Field>
          <Field label="Bank Branch">
            <input value={form.bank_branch} onChange={(e) => set('bank_branch', e.target.value)}
              placeholder="e.g. Westlands" className={inp} />
          </Field>
          <Field label="Currency">
            <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={sel}>
              <option value="KES">KES</option>
              <option value="USD">USD</option>
              <option value="UGX">UGX</option>
              <option value="TZS">TZS</option>
            </select>
          </Field>
          {!isEdit && (
            <div className="col-span-2">
              <Field label="Opening Balance" hint="Current balance at the time of setup">
                <input type="number" value={form.opening_balance}
                  onChange={(e) => set('opening_balance', e.target.value)} className={inp} />
              </Field>
            </div>
          )}
          <div className="col-span-2">
            <Field label="Link to Chart of Accounts" hint="Optional — links this bank account to a CoA asset account">
              <select value={form.account_id} onChange={(e) => set('account_id', e.target.value)} className={sel}>
                <option value="">Not linked</option>
                {assetAccounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>{a.account_code} — {a.account_name}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" checked={form.is_default} onChange={(e) => set('is_default', e.target.checked)}
            className="rounded border-gray-300 text-primary-600" />
          Set as default bank account
        </label>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)}
            className={inp + ' resize-none'} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Bank Account Ledger Modal ─────────────────────────────────────────────────

function toISO(d) { return d.toISOString().slice(0, 10); }
const todayISO = toISO(new Date());

function BankLedgerModal({ account, onClose }) {
  const [startDate, setStart] = useState(toISO(new Date(Date.now() - 29 * 86400000)));
  const [endDate,   setEnd]   = useState(todayISO);
  const [page, setPage]       = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['bank-ledger', account.bank_account_id, startDate, endDate, page],
    queryFn:  () => api.get(`/bank-accounts/${account.bank_account_id}/ledger`, {
      params: { startDate, endDate, page, limit: 30 },
    }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const { entries = [], total = 0, pages = 1, summary = {} } = data ?? {};

  return (
    <Modal open onClose={onClose} size="xl"
      title={
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary-600" />
            <p className="text-sm font-semibold text-gray-900">{account.account_name}</p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{account.bank_name}{account.account_number ? ` · ${account.account_number}` : ''}</p>
        </div>
      }
      footer={<Button variant="secondary" fullWidth onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        {/* Balance + summary row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-primary-50 border border-primary-200 p-3 text-center">
            <p className="text-xs text-gray-500">Current Balance</p>
            <p className="text-base font-bold text-primary-700 mt-0.5">{account.currency} {formatCurrency(account.current_balance).replace('KES', '').trim()}</p>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1"><ArrowDownLeft className="h-3 w-3 text-green-600" />Money In</p>
            <p className="text-base font-bold text-green-700 mt-0.5">{formatCurrency(summary.totalIn ?? 0)}</p>
          </div>
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1"><ArrowUpRight className="h-3 w-3 text-red-500" />Money Out</p>
            <p className="text-base font-bold text-red-600 mt-0.5">{formatCurrency(summary.totalOut ?? 0)}</p>
          </div>
        </div>

        {/* Date range */}
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

        {/* Entries table */}
        {isLoading ? <PageSpinner /> : entries.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">No transactions for this period</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-24" />   {/* Date */}
                <col className="w-24" />   {/* Type */}
                <col className="w-32" />   {/* Reference */}
                <col />                    {/* Description — takes remaining space */}
                <col className="w-28" />   {/* In */}
                <col className="w-28" />   {/* Out */}
                <col className="w-28" />   {/* Balance */}
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Reference</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-green-600">In (Cr)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-red-500">Out (Dr)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e, idx) => (
                  <tr key={`${e.id}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDate(e.entryDate)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${e.entryType === 'DEPOSIT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {e.entryType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 truncate">{e.reference}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700">
                      <p className="truncate" title={e.description}>{e.description}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {e.creditIn > 0 ? <span className="font-semibold text-green-700">{formatCurrency(e.creditIn)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {e.debitOut > 0 ? <span className="font-semibold text-red-600">{formatCurrency(e.debitOut)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono text-xs font-semibold ${e.balance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                      {formatCurrency(e.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Page {page} of {pages} · {total} transactions</span>
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BankAccountsPage() {
  const qc = useQueryClient();
  const [editTarget,   setEditTarget]   = useState(null);
  const [createOpen,   setCreateOpen]   = useState(false);
  const [ledgerTarget, setLedgerTarget] = useState(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api.get('/bank-accounts').then((r) => r.data.data),
  });

  const { data: coaAccounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data.data ?? []),
  });

  const total = accounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bank Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{accounts.length} accounts</p>
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          Add Bank Account
        </Button>
      </div>

      {/* Summary card */}
      {accounts.length > 0 && (
        <div className="rounded-xl bg-primary-500 text-white p-5">
          <p className="text-sm text-white/60">Total Cash Balance</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(total)}</p>
          <p className="text-xs text-white/40 mt-1">Across {accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {isLoading ? <PageSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div key={acc.bank_account_id}
              className={`rounded-xl border bg-white shadow-sm p-5 space-y-3 ${!acc.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
                    <Landmark className="h-5 w-5 text-primary-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{acc.account_name}</p>
                    <p className="text-xs text-gray-500">{acc.bank_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {acc.is_default && (
                    <Star className="h-4 w-4 text-amber-400 fill-amber-400" title="Default account" />
                  )}
                  <button onClick={() => setEditTarget(acc)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600 transition-colors">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                <p className="text-xs text-gray-500">Current Balance</p>
                <p className={`text-xl font-bold mt-0.5 ${parseFloat(acc.current_balance) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                  {acc.currency} {formatCurrency(acc.current_balance).replace('KES', '').trim()}
                </p>
              </div>

              <div className="text-xs text-gray-400 space-y-0.5">
                {acc.account_number && <p>Acc #: {acc.account_number}</p>}
                {acc.bank_branch    && <p>Branch: {acc.bank_branch}</p>}
                {acc.coa_account_name && <p>CoA: {acc.coa_account_name}</p>}
              </div>

              <button onClick={() => setLedgerTarget(acc)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors">
                <BookOpen className="h-3.5 w-3.5" />
                View Transactions
              </button>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="col-span-3 rounded-xl border border-dashed border-gray-200 py-16 text-center">
              <Landmark className="mx-auto h-10 w-10 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No bank accounts yet</p>
              <p className="text-gray-400 text-sm mt-1">Add a bank account to track cash positions.</p>
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <BankAccountModal accounts={coaAccounts} onClose={() => setCreateOpen(false)} />
      )}
      {editTarget && (
        <BankAccountModal account={editTarget} accounts={coaAccounts} onClose={() => setEditTarget(null)} />
      )}
      {ledgerTarget && (
        <BankLedgerModal account={ledgerTarget} onClose={() => setLedgerTarget(null)} />
      )}
    </div>
  );
}
