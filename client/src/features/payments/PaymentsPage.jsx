import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard, Plus, Search, AlertCircle, CheckCircle, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatCurrency } from '@/utils/formatters';

const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
const sel = inp + ' bg-white';
const Field = ({ label, children, hint }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
  </div>
);

const METHOD_LABELS = {
  bank_transfer: 'Bank Transfer',
  cash:          'Cash',
  cheque:        'Cheque',
  mpesa:         'M-Pesa',
  other:         'Other',
};

const METHOD_COLORS = {
  bank_transfer: 'bg-blue-100 text-blue-700',
  cash:          'bg-green-100 text-green-700',
  cheque:        'bg-purple-100 text-purple-700',
  mpesa:         'bg-emerald-100 text-emerald-700',
  other:         'bg-gray-100 text-gray-600',
};

function MethodBadge({ method }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${METHOD_COLORS[method] ?? 'bg-gray-100 text-gray-600'}`}>
      {METHOD_LABELS[method] ?? method}
    </span>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────

function PaymentModal({ onClose }) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    supplier_id:     '',
    branch_id:       '',
    bank_account_id: '',
    po_id:           '',
    payment_date:    new Date().toISOString().slice(0, 10),
    amount:          '',
    payment_method:  'bank_transfer',
    reference_number:'',
    notes:           '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const { data: suppliersRaw } = useQuery({
    queryKey: ['suppliers'],
    queryFn:  () => api.get('/suppliers?limit=200').then((r) => r.data.data ?? r.data),
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn:  () => api.get('/branches').then((r) => r.data.data ?? []),
  });
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn:  () => api.get('/bank-accounts').then((r) => r.data.data ?? []),
  });
  const { data: posRaw } = useQuery({
    queryKey: ['purchases-for-payment', form.supplier_id],
    queryFn:  () => api.get(`/purchases?supplierId=${form.supplier_id}&status=approved&limit=100`).then((r) => r.data.data ?? r.data),
    enabled:  !!form.supplier_id,
  });

  const suppliers = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.suppliers ?? []);
  const pos       = Array.isArray(posRaw) ? posRaw : (posRaw?.orders ?? []);

  // Show AP balance of selected supplier
  const selectedSupplier = suppliers.find((s) => s.supplier_id === form.supplier_id);

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => api.post('/supplier-payments', data),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['supplier-payments'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Failed to record payment'),
  });

  const handleSubmit = () => {
    if (!form.supplier_id)    return toast.error('Select a supplier');
    if (!form.branch_id)      return toast.error('Select a branch');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    mutate({
      ...form,
      amount:          parseFloat(form.amount),
      bank_account_id: form.bank_account_id || undefined,
      po_id:           form.po_id           || undefined,
      reference_number:form.reference_number || undefined,
      notes:           form.notes           || undefined,
    });
  };

  return (
    <Modal open onClose={onClose} title="Record Supplier Payment" size="md">
      <div className="space-y-4">

        <Field label="Supplier *">
          <select className={sel} value={form.supplier_id}
            onChange={(e) => { set('supplier_id', e.target.value); set('po_id', ''); }}>
            <option value="">— Select supplier —</option>
            {suppliers.map((s) => (
              <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
            ))}
          </select>
        </Field>

        {selectedSupplier && parseFloat(selectedSupplier.current_balance) > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm text-amber-700">
              Outstanding balance: <strong>{formatCurrency(selectedSupplier.current_balance)}</strong>
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Branch *">
            <select className={sel} value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
              <option value="">— Select branch —</option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Payment Date">
            <input type="date" className={inp} value={form.payment_date}
              onChange={(e) => set('payment_date', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (KES) *">
            <input type="number" min="0.01" step="0.01" className={inp}
              value={form.amount} onChange={(e) => set('amount', e.target.value)}
              placeholder="0.00" />
          </Field>
          <Field label="Payment Method">
            <select className={sel} value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}>
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Bank Account" hint="Optional — deducts from account balance when selected">
          <select className={sel} value={form.bank_account_id} onChange={(e) => set('bank_account_id', e.target.value)}>
            <option value="">— None —</option>
            {bankAccounts.map((ba) => (
              <option key={ba.bank_account_id} value={ba.bank_account_id}>
                {ba.account_name} ({ba.bank_name}) — {formatCurrency(ba.current_balance)}
              </option>
            ))}
          </select>
        </Field>

        {form.supplier_id && (
          <Field label="Against PO" hint="Optional — link this payment to a specific purchase order">
            <select className={sel} value={form.po_id} onChange={(e) => set('po_id', e.target.value)}>
              <option value="">— General payment —</option>
              {pos.map((po) => (
                <option key={po.po_id} value={po.po_id}>
                  {po.po_number} — {formatCurrency(po.total_amount)}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Reference / Cheque No.">
          <input type="text" className={inp} value={form.reference_number}
            onChange={(e) => set('reference_number', e.target.value)}
            placeholder="Transaction ref, cheque number, etc." />
        </Field>

        <Field label="Notes">
          <textarea rows={2} className={inp} value={form.notes}
            onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            <CheckCircle className="h-4 w-4 mr-2" />Record Payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Payment Detail Modal ──────────────────────────────────────────────────────

function PaymentDetail({ payment, onClose }) {
  const qc = useQueryClient();
  const user = JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.user;
  const canVoid = user?.role === 'company_admin' || user?.role === 'super_admin';

  const voidM = useMutation({
    mutationFn: () => api.post(`/supplier-payments/${payment.payment_id}/void`),
    onSuccess: () => {
      toast.success('Payment voided');
      qc.invalidateQueries({ queryKey: ['supplier-payments'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message ?? 'Void failed'),
  });

  const rows = [
    ['Supplier',       payment.supplier_name],
    ['Branch',         payment.branch_name],
    ['Date',           payment.payment_date?.slice(0, 10)],
    ['Amount',         formatCurrency(payment.amount)],
    ['Method',         <MethodBadge key="m" method={payment.payment_method} />],
    ['Reference',      payment.reference_number || '—'],
    ['Bank Account',   payment.bank_account_name ? `${payment.bank_account_name} (${payment.bank_name})` : '—'],
    ['PO Reference',   payment.po_number || '—'],
    ['Recorded By',    payment.created_by || '—'],
    ['Notes',          payment.notes || '—'],
  ];

  return (
    <Modal open onClose={onClose} title="Payment Details" size="sm">
      <div className="space-y-4">
        <dl className="divide-y divide-gray-100">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <dt className="text-sm text-gray-500">{label}</dt>
              <dd className="text-sm font-medium text-gray-900 text-right">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex justify-between gap-3 pt-2">
          {canVoid && (
            <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50"
              onClick={() => {
                if (window.confirm('Void this payment? The AP balance will be reversed.'))
                  voidM.mutate();
              }}
              isLoading={voidM.isPending}>
              <XCircle className="h-4 w-4 mr-1" />Void
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="ml-auto">Close</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── AP Summary Cards ──────────────────────────────────────────────────────────

function APSummary({ suppliers }) {
  const withBalance = suppliers.filter((s) => parseFloat(s.current_balance) > 0);
  const totalAP = withBalance.reduce((sum, s) => sum + parseFloat(s.current_balance), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total AP Outstanding</p>
        <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(totalAP)}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Suppliers with Balance</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{withBalance.length}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Suppliers</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{suppliers.length}</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [showModal,    setShowModal]    = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [search,       setSearch]       = useState('');
  const [supplierFilt, setSupplierFilt] = useState('');

  const { data: suppliersRaw2 } = useQuery({
    queryKey: ['suppliers'],
    queryFn:  () => api.get('/suppliers?limit=200').then((r) => r.data.data ?? r.data),
  });
  const suppliers = Array.isArray(suppliersRaw2) ? suppliersRaw2 : (suppliersRaw2?.suppliers ?? []);

  const { data: paymentsRaw, isLoading } = useQuery({
    queryKey: ['supplier-payments', supplierFilt],
    queryFn:  () => api.get(`/supplier-payments?limit=100${supplierFilt ? `&supplierId=${supplierFilt}` : ''}`).then((r) => r.data.data ?? r.data),
  });
  const payments = Array.isArray(paymentsRaw) ? paymentsRaw : (paymentsRaw?.payments ?? []);

  const filtered = search
    ? payments.filter((p) =>
        p.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
        p.reference_number?.toLowerCase().includes(search.toLowerCase())
      )
    : payments;

  const totalPaid = filtered.reduce((s, p) => s + parseFloat(p.amount), 0);

  return (
    <div className="space-y-6">
      <APSummary suppliers={suppliers} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Search supplier or reference…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-primary-500 focus:outline-none"
          value={supplierFilt} onChange={(e) => { setSupplierFilt(e.target.value); setSearch(''); }}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
          ))}
        </select>
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-1" />Record Payment
        </Button>
      </div>

      {/* Table */}
      {isLoading ? <PageSpinner /> : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 pl-4 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Supplier</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Method</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Reference</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Bank Account</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">PO</th>
                <th className="py-3 pr-4 text-right text-xs font-medium text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-400">No payments recorded</td>
                </tr>
              ) : filtered.map((p) => (
                <tr key={p.payment_id} className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedPayment(p)}>
                  <td className="py-3 pl-4 text-gray-600">{p.payment_date?.slice(0, 10)}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{p.supplier_name}</td>
                  <td className="py-3 px-4"><MethodBadge method={p.payment_method} /></td>
                  <td className="py-3 px-4 text-gray-500">{p.reference_number || '—'}</td>
                  <td className="py-3 px-4 text-gray-500">{p.bank_account_name || '—'}</td>
                  <td className="py-3 px-4 font-mono text-gray-500 text-xs">{p.po_number || '—'}</td>
                  <td className="py-3 pr-4 text-right font-semibold text-gray-900">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={6} className="py-2 pl-4 text-xs font-medium text-gray-500">
                    {filtered.length} payment{filtered.length !== 1 ? 's' : ''}
                  </td>
                  <td className="py-2 pr-4 text-right text-sm font-bold text-gray-900">
                    {formatCurrency(totalPaid)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {showModal && <PaymentModal onClose={() => setShowModal(false)} />}
      {selectedPayment && <PaymentDetail payment={selectedPayment} onClose={() => setSelectedPayment(null)} />}
    </div>
  );
}
