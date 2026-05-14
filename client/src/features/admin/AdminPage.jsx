import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Users, GitBranch, Plus, Search,
  CheckCircle, Clock, AlertTriangle, XCircle, CreditCard,
  Monitor, ShoppingCart, Package, BarChart2, UserCheck,
  Layers, ArrowRight, RefreshCw, Pencil, Trash2, DollarSign,
  Power,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuthStore } from '@/app/store';
import { formatDate, formatCurrency } from '@/utils/formatters';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ImageUpload from '@/components/ui/ImageUpload';
import { PageSpinner } from '@/components/ui/Spinner';

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Pass explicit company context for super-admin → tenant-scoped calls */
const withCo = (id) => (id ? { headers: { 'X-Company-ID': id } } : {});

const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none';
const sel = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none bg-white';

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}{required && ' *'}
      </label>
      {children}
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const STATUS_STYLE = {
  trial: 'bg-blue-100 text-blue-700', active: 'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-700', cancelled: 'bg-gray-100 text-gray-500',
  open: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-500',
  void: 'bg-red-100 text-red-600',
};
const STATUS_ICON = {
  trial: <Clock className="h-3 w-3" />, active: <CheckCircle className="h-3 w-3" />,
  suspended: <AlertTriangle className="h-3 w-3" />, cancelled: <XCircle className="h-3 w-3" />,
  open: <CheckCircle className="h-3 w-3" />, closed: <XCircle className="h-3 w-3" />,
  void: <XCircle className="h-3 w-3" />,
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_ICON[status]}{status}
    </span>
  );
}

function Pagination({ page, pages, total, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
      <p className="text-xs text-gray-500">Page {page} of {pages} ({total} total)</p>
      <div className="flex gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="rounded-md border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">Prev</button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="rounded-md border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">Next</button>
      </div>
    </div>
  );
}

function CompanyFilter({ companies, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none min-w-44 bg-white">
      <option value="">All Companies</option>
      {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>)}
    </select>
  );
}

function RowActions({ onEdit, onDelete, deleting }) {
  return (
    <div className="flex items-center gap-1 justify-end">
      {onEdit && (
        <button onClick={onEdit}
          className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} disabled={deleting}
          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Platform Stats ────────────────────────────────────────────────────────────

function PlatformStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: () => api.get('/platform/stats').then((r) => r.data.data),
    refetchInterval: 60_000,
  });
  const stats = [
    { label: 'Companies',    value: data?.total_companies ?? '—', sub: `${data?.active_companies ?? 0} active`,    color: 'bg-primary-50 text-primary-700' },
    { label: 'Trial',        value: data?.trial_companies ?? '—', sub: `${data?.suspended_companies ?? 0} suspended`, color: 'bg-blue-50 text-blue-700' },
    { label: 'Users',        value: data?.total_users     ?? '—', sub: 'across all tenants',  color: 'bg-purple-50 text-purple-700' },
    { label: 'Branches',     value: data?.total_branches  ?? '—', sub: 'active branches',     color: 'bg-indigo-50 text-indigo-700' },
    { label: 'Products',     value: data?.total_products  ?? '—', sub: 'catalogue entries',   color: 'bg-teal-50 text-teal-700' },
    { label: 'Customers',    value: data?.total_customers ?? '—', sub: 'registered',          color: 'bg-orange-50 text-orange-700' },
    { label: 'Open Sessions',value: data?.open_sessions   ?? '—', sub: 'POS sessions live',   color: 'bg-green-50 text-green-700' },
    { label: "Today's Sales",value: data?.today_sales != null ? formatCurrency(data.today_sales) : '—', sub: 'gross revenue', color: 'bg-amber-50 text-amber-700' },
  ];
  if (isLoading) return <div className="grid grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-xl bg-gray-100 h-20 animate-pulse" />)}</div>;
  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map(({ label, value, sub, color }) => (
        <div key={label} className={`rounded-xl p-4 ${color}`}>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Create Company Modal ──────────────────────────────────────────────────────

function CreateCompanyModal({ plans, onClose }) {
  const qc = useQueryClient();
  const [form, setFormState] = useState({
    company_name: '', domain: '', timezone: 'Africa/Nairobi', currency: 'KES',
    subscription_plan_id: '', branch_name: 'Main Branch',
    admin_first_name: '', admin_last_name: '', admin_email: '', admin_password: 'Admin@123',
    logo_url: null,
  });
  const set = (k, v) => setFormState((f) => ({ ...f, [k]: v }));

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => api.post('/companies', data),
    onSuccess: (res) => {
      const { company, admin_user } = res.data.data;
      toast.success(`${company.company_name} created! Admin: ${admin_user.email}`);
      qc.invalidateQueries({ queryKey: ['admin-companies'] });
      qc.invalidateQueries({ queryKey: ['platform-stats'] });
      qc.invalidateQueries({ queryKey: ['platform-companies-list'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Create failed'),
  });

  const handleSubmit = () => {
    if (!form.company_name) { toast.error('Company name is required'); return; }
    if (!form.admin_email)  { toast.error('Admin email is required');  return; }
    const payload = { ...form };
    if (!payload.subscription_plan_id) delete payload.subscription_plan_id;
    mutate(payload);
  };

  return (
    <Modal open onClose={onClose} title="Onboard New Company" size="lg"
      footer={<div className="flex gap-3"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth loading={isPending} onClick={handleSubmit}>Create Company</Button></div>}
    >
      <div className="space-y-5">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Company Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex items-start gap-4">
              <ImageUpload value={form.logo_url} onChange={(v) => set('logo_url', v)} label="Company Logo" size="md" />
              <div className="flex-1"><Field label="Company Name" required><input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} className={inp} /></Field></div>
            </div>
            <Field label="Domain"><input value={form.domain} onChange={(e) => set('domain', e.target.value)} placeholder="company.example.com" className={inp} /></Field>
            <Field label="Subscription Plan">
              <select value={form.subscription_plan_id} onChange={(e) => set('subscription_plan_id', e.target.value)} className={sel}>
                <option value="">No plan (trial)</option>
                {plans.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.plan_name} — {formatCurrency(p.price)}/mo</option>)}
              </select>
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={sel}>
                <option value="KES">KES — Kenyan Shilling</option>
                <option value="USD">USD — US Dollar</option>
                <option value="UGX">UGX — Ugandan Shilling</option>
                <option value="TZS">TZS — Tanzanian Shilling</option>
              </select>
            </Field>
            <Field label="HQ Branch Name"><input value={form.branch_name} onChange={(e) => set('branch_name', e.target.value)} className={inp} /></Field>
          </div>
        </div>
        <div className="border-t border-gray-100" />
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Admin User</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name"><input value={form.admin_first_name} onChange={(e) => set('admin_first_name', e.target.value)} className={inp} /></Field>
            <Field label="Last Name"><input value={form.admin_last_name} onChange={(e) => set('admin_last_name', e.target.value)} className={inp} /></Field>
            <div className="col-span-2"><Field label="Admin Email" required><input type="email" value={form.admin_email} onChange={(e) => set('admin_email', e.target.value)} className={inp} /></Field></div>
            <div className="col-span-2">
              <Field label="Temporary Password" hint="Default: Admin@123 — user must change on first login">
                <input type="password" value={form.admin_password} onChange={(e) => set('admin_password', e.target.value)} className={inp} />
              </Field>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Company Edit Modal ─────────────────────────────────────────────────────────

function CompanyEditModal({ company, plans, onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setActiveCompany = useAuthStore((s) => s.setActiveCompany);

  const [form, setFormState] = useState({
    company_name: company.company_name ?? '',
    domain: company.domain ?? '',
    timezone: company.timezone ?? 'Africa/Nairobi',
    currency: company.currency ?? 'KES',
    subscription_plan_id: company.subscription_plan_id ?? '',
    logo_url: company.logo_url ?? null,
  });
  const [status, setStatus] = useState(company.subscription_status);
  const set = (k, v) => setFormState((f) => ({ ...f, [k]: v }));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-companies'] });
    qc.invalidateQueries({ queryKey: ['platform-stats'] });
    qc.invalidateQueries({ queryKey: ['platform-companies-list'] });
    qc.invalidateQueries({ queryKey: ['my-company'] });
  };

  const updateMut = useMutation({
    mutationFn: (data) => api.patch(`/companies/${company.company_id}`, data),
    onSuccess: () => { toast.success('Company updated'); invalidate(); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Update failed'),
  });

  const statusMut = useMutation({
    mutationFn: (s) => api.patch(`/companies/${company.company_id}/status`, { status: s }),
    onSuccess: () => { toast.success('Status updated'); invalidate(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Update failed'),
  });

  const handleSave = () => {
    if (!form.company_name) { toast.error('Company name is required'); return; }
    updateMut.mutate({ ...form, subscription_plan_id: form.subscription_plan_id || null });
  };

  const handleManage = () => {
    setActiveCompany(company.company_id, company.company_name);
    toast.success(`Now managing: ${company.company_name}`);
    navigate('/app/dashboard');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Edit — ${company.company_name}`} size="lg"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button variant="outline" fullWidth icon={<ArrowRight className="h-4 w-4" />} onClick={handleManage}>Manage</Button>
          <Button fullWidth loading={updateMut.isPending} onClick={handleSave}>Save Changes</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <ImageUpload value={form.logo_url} onChange={(v) => set('logo_url', v)} label="Logo" size="md" />
          <div className="flex-1"><Field label="Company Name" required><input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} className={inp} /></Field></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Domain / Website"><input value={form.domain} onChange={(e) => set('domain', e.target.value)} placeholder="company.example.com" className={inp} /></Field>
          <Field label="Subscription Plan">
            <select value={form.subscription_plan_id} onChange={(e) => set('subscription_plan_id', e.target.value)} className={sel}>
              <option value="">No plan (trial)</option>
              {plans.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.plan_name} — {formatCurrency(p.price)}/mo</option>)}
            </select>
          </Field>
          <Field label="Currency">
            <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={sel}>
              <option value="KES">KES — Kenyan Shilling</option>
              <option value="USD">USD — US Dollar</option>
              <option value="UGX">UGX — Ugandan Shilling</option>
              <option value="TZS">TZS — Tanzanian Shilling</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className={sel}>
              <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
              <option value="Africa/Kampala">Africa/Kampala (EAT)</option>
              <option value="Africa/Dar_es_Salaam">Africa/Dar_es_Salaam (EAT)</option>
              <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
        </div>
        {/* Subscription Status */}
        <div className="rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Subscription Status</p>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none bg-white">
              {['trial','active','suspended','cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {status !== company.subscription_status && (
              <Button size="xs" loading={statusMut.isPending} onClick={() => statusMut.mutate(status)}>Apply Status</Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[{ label: 'Branches', value: company.branch_count }, { label: 'Users', value: company.user_count }, { label: 'Created', value: formatDate(company.created_at) }].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-lg font-bold text-gray-800">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Plans Panel ───────────────────────────────────────────────────────────────

function PlanModal({ plan, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!plan;
  const [form, setFormState] = useState({
    plan_name:     plan?.plan_name     ?? '',
    price:         plan?.price         ?? '',
    annual_price:  plan?.annual_price  ?? '',
    max_users:     plan?.max_users     ?? 5,
    max_branches:  plan?.max_branches  ?? 1,
    trial_days:    plan?.trial_days    ?? 14,
    has_finance:   plan?.has_finance   ?? false,
    has_api_access:plan?.has_api_access ?? false,
    sort_order:    plan?.sort_order    ?? 0,
    is_active:     plan?.is_active     ?? true,
  });
  const set = (k, v) => setFormState((f) => ({ ...f, [k]: v }));

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit
      ? api.patch(`/platform/plans/${plan.plan_id}`, data)
      : api.post('/platform/plans', data),
    onSuccess: () => {
      toast.success(isEdit ? 'Plan updated' : 'Plan created');
      qc.invalidateQueries({ queryKey: ['subscription-plans'] });
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSubmit = () => {
    if (!form.plan_name) { toast.error('Plan name is required'); return; }
    if (form.price === '') { toast.error('Price is required'); return; }
    mutate({
      ...form,
      price:        parseFloat(form.price),
      annual_price: form.annual_price !== '' ? parseFloat(form.annual_price) : null,
      max_users:    parseInt(form.max_users),
      max_branches: parseInt(form.max_branches),
      trial_days:   parseInt(form.trial_days),
      sort_order:   parseInt(form.sort_order),
    });
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit Plan — ${plan.plan_name}` : 'New Subscription Plan'} size="md"
      footer={<div className="flex gap-3"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth loading={isPending} onClick={handleSubmit}>{isEdit ? 'Save Changes' : 'Create Plan'}</Button></div>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Plan Name" required>
              <input value={form.plan_name} onChange={(e) => set('plan_name', e.target.value)} className={inp} placeholder="e.g. Growth" />
            </Field>
          </div>
          <Field label="Monthly Price (KES)" required>
            <input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} className={inp} placeholder="2999" />
          </Field>
          <Field label="Annual Price (KES)" hint="Leave blank to not offer annual billing">
            <input type="number" value={form.annual_price} onChange={(e) => set('annual_price', e.target.value)} className={inp} placeholder="29990" />
          </Field>
          <Field label="Max Users" hint="-1 = unlimited">
            <input type="number" value={form.max_users} onChange={(e) => set('max_users', e.target.value)} className={inp} />
          </Field>
          <Field label="Max Branches" hint="-1 = unlimited">
            <input type="number" value={form.max_branches} onChange={(e) => set('max_branches', e.target.value)} className={inp} />
          </Field>
          <Field label="Trial Days">
            <input type="number" value={form.trial_days} onChange={(e) => set('trial_days', e.target.value)} className={inp} />
          </Field>
          <Field label="Display Order">
            <input type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} className={inp} />
          </Field>
        </div>

        <div className="rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Feature Flags</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.has_finance} onChange={(e) => set('has_finance', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Finance Module</p>
              <p className="text-xs text-gray-500">Suppliers, Purchase Orders, AP Payments, CoA, Bank Accounts, Aging & Financial Reports</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.has_api_access} onChange={(e) => set('has_api_access', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">API Access</p>
              <p className="text-xs text-gray-500">REST API access for integrations and custom development</p>
            </div>
          </label>
        </div>

        {isEdit && (
          <Field label="Status">
            <select value={form.is_active ? 'true' : 'false'} onChange={(e) => set('is_active', e.target.value === 'true')} className={sel}>
              <option value="true">Active</option>
              <option value="false">Inactive (hidden from new signups)</option>
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function PlansPanel() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected,   setSelected]   = useState(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => api.get('/platform/plans').then((r) => r.data.data),
  });

  const deactivateMut = useMutation({
    mutationFn: (id) => api.delete(`/platform/plans/${id}`),
    onSuccess: () => { toast.success('Plan deactivated'); qc.invalidateQueries({ queryKey: ['platform-plans'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const FEAT = (val) => val
    ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><CheckCircle className="h-3 w-3" /> Yes</span>
    : <span className="text-xs text-gray-300">—</span>;

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{plans.length} plan{plans.length !== 1 ? 's' : ''} configured</p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>New Plan</Button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Plan','Monthly','Annual','Users','Branches','Trial','Finance','API','Order','Status',''].map((h) => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {plans.map((p) => (
              <tr key={p.plan_id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 font-semibold text-gray-900">{p.plan_name}</td>
                <td className="px-3 py-3 text-gray-700">{formatCurrency(p.price)}<span className="text-xs text-gray-400">/mo</span></td>
                <td className="px-3 py-3 text-gray-500">{p.annual_price ? formatCurrency(p.annual_price) : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-3 text-center text-gray-600">{p.max_users === -1 ? '∞' : p.max_users}</td>
                <td className="px-3 py-3 text-center text-gray-600">{p.max_branches === -1 ? '∞' : p.max_branches}</td>
                <td className="px-3 py-3 text-center text-gray-600">{p.trial_days}d</td>
                <td className="px-3 py-3 text-center">{FEAT(p.has_finance)}</td>
                <td className="px-3 py-3 text-center">{FEAT(p.has_api_access)}</td>
                <td className="px-3 py-3 text-center text-gray-400 text-xs">{p.sort_order}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={p.is_active ? 'active' : 'cancelled'} />
                </td>
                <td className="px-3 py-3">
                  <RowActions
                    onEdit={() => setSelected(p)}
                    onDelete={() => { if (window.confirm(`Deactivate "${p.plan_name}"?`)) deactivateMut.mutate(p.plan_id); }}
                    deleting={deactivateMut.isPending}
                  />
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr><td colSpan={11} className="py-12 text-center text-gray-400 text-sm">No plans configured</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && <PlanModal onClose={() => setCreateOpen(false)} />}
      {selected   && <PlanModal plan={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Companies Panel ───────────────────────────────────────────────────────────

function CompaniesPanel({ plans }) {
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]               = useState(1);
  const [createOpen, setCreateOpen]   = useState(false);
  const [selected, setSelected]       = useState(null);

  const filters = { search, status: statusFilter, page, limit: 20 };
  const { data, isLoading } = useQuery({
    queryKey: ['admin-companies', filters],
    queryFn: () => api.get('/companies', { params: filters }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const companies = data?.companies ?? [];
  const total     = data?.total     ?? 0;
  const pages     = data?.pages     ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search company or domain…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none bg-white">
          <option value="">All Statuses</option>
          {['trial','active','suspended','cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>New Company</Button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Company','Plan','Branches','Users','Status','Created',''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companies.map((c) => (
                  <tr key={c.company_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {c.logo_url
                          ? <img src={c.logo_url} alt={c.company_name} className="h-8 w-8 flex-shrink-0 rounded-lg object-cover border border-gray-100" />
                          : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 font-bold text-sm flex-shrink-0">{c.company_name[0].toUpperCase()}</div>
                        }
                        <div>
                          <p className="font-medium text-gray-900">{c.company_name}</p>
                          {c.domain && <p className="text-xs text-gray-400">{c.domain}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.plan_name ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-700">
                        <GitBranch className="h-3 w-3 text-gray-400" />{c.branch_count}
                        {c.max_branches && <span className="text-gray-400 text-xs">/{c.max_branches}</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-700">
                        <Users className="h-3 w-3 text-gray-400" />{c.user_count}
                        {c.max_users && <span className="text-gray-400 text-xs">/{c.max_users}</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.subscription_status} /></td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelected(c)}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600 transition-colors" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {companies.length === 0 && (
                  <tr><td colSpan={7} className="py-14 text-center text-gray-400">
                    <Building2 className="mx-auto mb-2 h-8 w-8 opacity-25" />No companies found
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>

      {createOpen && <CreateCompanyModal plans={plans} onClose={() => setCreateOpen(false)} />}
      {selected   && <CompanyEditModal  company={selected} plans={plans} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── User Modal (Create / Edit) ────────────────────────────────────────────────

function UserModal({ companyId, user, onClose }) {
  const qc     = useQueryClient();
  const isEdit = !!user;

  const [form, setFormState] = useState({
    first_name: user?.first_name ?? '',
    last_name:  user?.last_name  ?? '',
    email:      user?.email      ?? '',
    phone:      user?.phone      ?? '',
    role_id:    user?.role_id    ?? '',
    branch_id:  user?.branch_id  ?? '',
    is_active:  user?.is_active  ?? true,
  });
  const set = (k, v) => setFormState((f) => ({ ...f, [k]: v }));

  const { data: roles    = [] } = useQuery({ queryKey: ['co-roles',    companyId], queryFn: () => api.get('/users/roles',  withCo(companyId)).then((r) => r.data.data), enabled: !!companyId });
  const { data: branches = [] } = useQuery({ queryKey: ['co-branches', companyId], queryFn: () => api.get('/branches',     withCo(companyId)).then((r) => r.data.data), enabled: !!companyId });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['platform-users'] });
    qc.invalidateQueries({ queryKey: ['platform-stats'] });
  };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/users/${user.user_id}`, data, withCo(companyId))
      : api.post('/users', data, withCo(companyId)),
    onSuccess: (res) => {
      const u = res.data.data;
      if (!isEdit && u.temp_password) toast.success(`Created! Temp password: ${u.temp_password}`, { duration: 10000 });
      else toast.success(isEdit ? 'User updated' : 'User created');
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSubmit = () => {
    if (!form.first_name)       { toast.error('First name is required'); return; }
    if (!isEdit && !form.email) { toast.error('Email is required');      return; }
    mutate(form);
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit User — ${user.first_name} ${user.last_name}` : 'Create User'}
      footer={<div className="flex gap-3"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth loading={isPending} onClick={handleSubmit}>{isEdit ? 'Save Changes' : 'Create User'}</Button></div>}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name" required><input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={inp} /></Field>
        <Field label="Last Name"><input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={inp} /></Field>
        {!isEdit && <div className="col-span-2"><Field label="Email" required><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inp} /></Field></div>}
        <Field label="Phone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254…" className={inp} /></Field>
        <Field label="Role">
          <select value={form.role_id} onChange={(e) => set('role_id', e.target.value)} className={sel}>
            <option value="">No role</option>
            {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_name.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <Field label="Default Branch">
          <select value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)} className={sel}>
            <option value="">No branch</option>
            {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
          </select>
        </Field>
        {isEdit && (
          <Field label="Status">
            <select value={form.is_active ? 'true' : 'false'} onChange={(e) => set('is_active', e.target.value === 'true')} className={sel}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>
        )}
      </div>
      {!isEdit && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">A secure temporary password will be auto-generated and shown after creation.</p>}
    </Modal>
  );
}

// ── Users Panel ───────────────────────────────────────────────────────────────

function UsersPanel({ companies }) {
  const qc = useQueryClient();
  const [search,    setSearch]      = useState('');
  const [companyId, setCompanyId]   = useState('');
  const [page,      setPage]        = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-users', { search, companyId, page }],
    queryFn: () => api.get('/platform/users', { params: { search, companyId, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.users ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`, withCo(companyId)),
    onSuccess: () => { toast.success('User deleted'); qc.invalidateQueries({ queryKey: ['platform-users'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const handleDelete = (u) => {
    if (!window.confirm(`Delete user "${u.first_name} ${u.last_name}"? This cannot be undone.`)) return;
    deleteMut.mutate(u.user_id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or email…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none" />
        </div>
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
        {companyId && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add User</Button>}
      </div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Name','Email','Role','Company','Branch','Created',''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((u) => (
                  <tr key={u.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.first_name} {u.last_name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">{u.role_name?.replace(/_/g, ' ') ?? '—'}</span></td>
                    <td className="px-4 py-3 text-gray-600">{u.company_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.branch_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3">{companyId && <RowActions onEdit={() => setEditTarget(u)} onDelete={() => handleDelete(u)} deleting={deleteMut.isPending} />}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-14 text-center text-gray-400"><Users className="mx-auto mb-2 h-8 w-8 opacity-25" />No users found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
      {createOpen && <UserModal companyId={companyId} onClose={() => setCreateOpen(false)} />}
      {editTarget  && <UserModal companyId={companyId} user={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

// ── Branch Modal (Create / Edit) ──────────────────────────────────────────────

function BranchModal({ companyId, branch, onClose }) {
  const qc     = useQueryClient();
  const isEdit = !!branch;
  const [form, setFormState] = useState({
    branch_name: branch?.branch_name ?? '',
    branch_code: branch?.branch_code ?? '',
    address:     branch?.address     ?? '',
    phone:       branch?.phone       ?? '',
  });
  const set = (k, v) => setFormState((f) => ({ ...f, [k]: v }));

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['platform-branches'] }); qc.invalidateQueries({ queryKey: ['co-branches', companyId] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit ? api.put(`/branches/${branch.branch_id}`, data, withCo(companyId)) : api.post('/branches', data, withCo(companyId)),
    onSuccess: () => { toast.success(isEdit ? 'Branch updated' : 'Branch created'); invalidate(); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSubmit = () => {
    if (!form.branch_name)           { toast.error('Branch name is required'); return; }
    if (!isEdit && !form.branch_code){ toast.error('Branch code is required'); return; }
    mutate(form);
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit Branch — ${branch.branch_name}` : 'Create Branch'}
      footer={<div className="flex gap-3"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth loading={isPending} onClick={handleSubmit}>{isEdit ? 'Save Changes' : 'Create Branch'}</Button></div>}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Branch Name" required><input value={form.branch_name} onChange={(e) => set('branch_name', e.target.value)} className={inp} /></Field>
        <Field label="Branch Code" required={!isEdit} hint={isEdit ? 'Code cannot be changed' : 'e.g. NBO-01'}>
          <input value={form.branch_code} onChange={(e) => set('branch_code', e.target.value.toUpperCase())} disabled={isEdit} className={`${inp} ${isEdit ? 'bg-gray-50 text-gray-400' : ''}`} />
        </Field>
        <div className="col-span-2"><Field label="Address"><textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Street, City, Country" /></Field></div>
        <Field label="Phone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254…" className={inp} /></Field>
      </div>
    </Modal>
  );
}

// ── Branches Panel ────────────────────────────────────────────────────────────

function BranchesPanel({ companies }) {
  const qc = useQueryClient();
  const [search, setSearch]         = useState('');
  const [companyId, setCompanyId]   = useState('');
  const [page, setPage]             = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-branches', { search, companyId, page }],
    queryFn: () => api.get('/platform/branches', { params: { search, companyId, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.branches ?? [];
  const total = data?.total    ?? 0;
  const pages = data?.pages    ?? 1;

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/branches/${id}`, withCo(companyId)),
    onSuccess: () => { toast.success('Branch deleted'); qc.invalidateQueries({ queryKey: ['platform-branches'] }); qc.invalidateQueries({ queryKey: ['co-branches', companyId] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const handleDelete = (b) => {
    if (b.is_headquarters) { toast.error('Cannot delete the headquarters branch'); return; }
    if (!window.confirm(`Delete branch "${b.branch_name}"?`)) return;
    deleteMut.mutate(b.branch_id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search branch name or code…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none" />
        </div>
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
        {companyId && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add Branch</Button>}
      </div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Branch','Code','Company','HQ','Status','Created',''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((b) => (
                  <tr key={b.branch_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{b.branch_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.branch_code}</td>
                    <td className="px-4 py-3 text-gray-600">{b.company_name}</td>
                    <td className="px-4 py-3">{b.is_headquarters ? <CheckCircle className="h-4 w-4 text-green-500" /> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">{b.is_active ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Inactive</span>}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(b.created_at)}</td>
                    <td className="px-4 py-3">{companyId && <RowActions onEdit={() => setEditTarget(b)} onDelete={b.is_headquarters ? undefined : () => handleDelete(b)} deleting={deleteMut.isPending} />}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-14 text-center text-gray-400"><GitBranch className="mx-auto mb-2 h-8 w-8 opacity-25" />No branches found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
      {createOpen && <BranchModal companyId={companyId} onClose={() => setCreateOpen(false)} />}
      {editTarget  && <BranchModal companyId={companyId} branch={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

// ── Terminal Modal (Create / Edit) ────────────────────────────────────────────

function TerminalModal({ companyId, terminal, onClose }) {
  const qc     = useQueryClient();
  const isEdit = !!terminal;
  const [form, setFormState] = useState({
    branchId:     terminal?.branch_id     ?? '',
    terminalName: terminal?.terminal_name ?? '',
    terminalCode: terminal?.terminal_code ?? '',
    description:  terminal?.description   ?? '',
    isActive:     terminal?.is_active     ?? true,
  });
  const set = (k, v) => setFormState((f) => ({ ...f, [k]: v }));

  const { data: branches = [] } = useQuery({ queryKey: ['co-branches', companyId], queryFn: () => api.get('/branches', withCo(companyId)).then((r) => r.data.data), enabled: !!companyId });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['platform-terminals'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit ? api.patch(`/pos/terminals/${terminal.terminal_id}`, data, withCo(companyId)) : api.post('/pos/terminals', data, withCo(companyId)),
    onSuccess: () => { toast.success(isEdit ? 'Terminal updated' : 'Terminal created'); invalidate(); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSubmit = () => {
    if (!form.terminalName)             { toast.error('Terminal name is required'); return; }
    if (!isEdit && !form.branchId)      { toast.error('Branch is required');       return; }
    if (!isEdit && !form.terminalCode)  { toast.error('Terminal code is required'); return; }
    mutate(form);
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit Terminal — ${terminal.terminal_name}` : 'Create Terminal'}
      footer={<div className="flex gap-3"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth loading={isPending} onClick={handleSubmit}>{isEdit ? 'Save Changes' : 'Create Terminal'}</Button></div>}
    >
      <div className="grid grid-cols-2 gap-3">
        {!isEdit && <div className="col-span-2"><Field label="Branch" required><select value={form.branchId} onChange={(e) => set('branchId', e.target.value)} className={sel}><option value="">Select branch…</option>{branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></Field></div>}
        <Field label="Terminal Name" required><input value={form.terminalName} onChange={(e) => set('terminalName', e.target.value)} placeholder="e.g. Main Till" className={inp} /></Field>
        <Field label="Terminal Code" required={!isEdit} hint={isEdit ? 'Code cannot be changed' : 'e.g. TILL-01'}>
          <input value={form.terminalCode} onChange={(e) => set('terminalCode', e.target.value.toUpperCase())} disabled={isEdit} className={`${inp} ${isEdit ? 'bg-gray-50 text-gray-400' : ''}`} />
        </Field>
        <div className="col-span-2"><Field label="Description"><input value={form.description} onChange={(e) => set('description', e.target.value)} className={inp} /></Field></div>
        {isEdit && <Field label="Status"><select value={form.isActive ? 'true' : 'false'} onChange={(e) => set('isActive', e.target.value === 'true')} className={sel}><option value="true">Active</option><option value="false">Inactive</option></select></Field>}
      </div>
    </Modal>
  );
}

// ── Terminals Panel ───────────────────────────────────────────────────────────

function TerminalsPanel({ companies }) {
  const qc = useQueryClient();
  const [companyId, setCompanyId]   = useState('');
  const [page, setPage]             = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-terminals', { companyId, page }],
    queryFn: () => api.get('/platform/terminals', { params: { companyId, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.terminals ?? [];
  const total = data?.total     ?? 0;
  const pages = data?.pages     ?? 1;

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/pos/terminals/${id}`, withCo(companyId)),
    onSuccess: () => { toast.success('Terminal deactivated'); qc.invalidateQueries({ queryKey: ['platform-terminals'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const handleDelete = (t) => {
    if (parseInt(t.open_sessions) > 0) { toast.error('Close the open session first'); return; }
    if (!window.confirm(`Deactivate terminal "${t.terminal_name}"?`)) return;
    deleteMut.mutate(t.terminal_id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
        {companyId && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add Terminal</Button>}
      </div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Terminal','Branch','Company','Open Sessions','Status','Created',''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((t) => (
                  <tr key={t.terminal_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.terminal_name}</td>
                    <td className="px-4 py-3 text-gray-600">{t.branch_name}</td>
                    <td className="px-4 py-3 text-gray-600">{t.company_name}</td>
                    <td className="px-4 py-3">{parseInt(t.open_sessions) > 0 ? <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">{t.open_sessions} open</span> : <span className="text-gray-400 text-xs">—</span>}</td>
                    <td className="px-4 py-3">{t.is_active ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Inactive</span>}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-3">{companyId && <RowActions onEdit={() => setEditTarget(t)} onDelete={() => handleDelete(t)} deleting={deleteMut.isPending} />}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-14 text-center text-gray-400"><Monitor className="mx-auto mb-2 h-8 w-8 opacity-25" />No terminals found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
      {createOpen && <TerminalModal companyId={companyId} onClose={() => setCreateOpen(false)} />}
      {editTarget  && <TerminalModal companyId={companyId} terminal={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

// ── Sessions Panel ────────────────────────────────────────────────────────────

function SessionsPanel({ companies }) {
  const qc = useQueryClient();
  const [companyId,    setCompanyId]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page,         setPage]         = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-sessions', { companyId, statusFilter, page }],
    queryFn: () => api.get('/platform/sessions', { params: { companyId, status: statusFilter, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.sessions ?? [];
  const total = data?.total    ?? 0;
  const pages = data?.pages    ?? 1;

  const forceCloseMut = useMutation({
    mutationFn: (id) => api.patch(`/pos/sessions/${id}/force-close`, {}, withCo(companyId)),
    onSuccess: () => { toast.success('Session force-closed'); qc.invalidateQueries({ queryKey: ['platform-sessions'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Force-close failed'),
  });

  const handleForceClose = (s) => {
    if (!window.confirm(`Force-close the session on terminal "${s.terminal_name}"? Use only if the cashier cannot close it themselves.`)) return;
    forceCloseMut.mutate(s.session_id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none bg-white">
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Terminal','Branch','Company','Cashier','Opened','Closed','Status',''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((s) => (
                  <tr key={s.session_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.terminal_name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.branch_name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.company_name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.cashier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(s.session_start)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{s.session_end ? formatDate(s.session_end) : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3">
                      {s.status === 'open' && companyId && (
                        <button onClick={() => handleForceClose(s)} disabled={forceCloseMut.isPending}
                          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40">
                          <Power className="h-3 w-3" /> Force Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={8} className="py-14 text-center text-gray-400"><Layers className="mx-auto mb-2 h-8 w-8 opacity-25" />No sessions found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
    </div>
  );
}

// ── Customer Modal (Create / Edit) ────────────────────────────────────────────

function CustomerModal({ companyId, customer, onClose }) {
  const qc     = useQueryClient();
  const isEdit = !!customer;
  const [form, setFormState] = useState({
    customer_name:     customer?.customer_name     ?? '',
    phone:             customer?.phone             ?? '',
    email:             customer?.email             ?? '',
    customer_group_id: customer?.customer_group_id ?? '',
  });
  const set = (k, v) => setFormState((f) => ({ ...f, [k]: v }));

  const { data: groups = [] } = useQuery({ queryKey: ['co-groups', companyId], queryFn: () => api.get('/customers/groups', withCo(companyId)).then((r) => r.data.data), enabled: !!companyId });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['platform-customers'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit ? api.put(`/customers/${customer.customer_id}`, data, withCo(companyId)) : api.post('/customers', data, withCo(companyId)),
    onSuccess: () => { toast.success(isEdit ? 'Customer updated' : 'Customer created'); invalidate(); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSubmit = () => {
    if (!form.customer_name) { toast.error('Customer name is required'); return; }
    mutate({ ...form, customer_group_id: form.customer_group_id || null });
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit Customer — ${customer.customer_name}` : 'Create Customer'}
      footer={<div className="flex gap-3"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth loading={isPending} onClick={handleSubmit}>{isEdit ? 'Save Changes' : 'Create Customer'}</Button></div>}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Customer Name" required><input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} className={inp} /></Field></div>
        <Field label="Phone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254…" className={inp} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inp} /></Field>
        <div className="col-span-2">
          <Field label="Customer Group">
            <select value={form.customer_group_id} onChange={(e) => set('customer_group_id', e.target.value)} className={sel}>
              <option value="">No group</option>
              {groups.map((g) => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ── Customers Panel ───────────────────────────────────────────────────────────

function CustomersPanel({ companies }) {
  const qc = useQueryClient();
  const [search,    setSearch]      = useState('');
  const [companyId, setCompanyId]   = useState('');
  const [page,      setPage]        = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-customers', { search, companyId, page }],
    queryFn: () => api.get('/platform/customers', { params: { search, companyId, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.customers ?? [];
  const total = data?.total     ?? 0;
  const pages = data?.pages     ?? 1;

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/customers/${id}`, withCo(companyId)),
    onSuccess: () => { toast.success('Customer deleted'); qc.invalidateQueries({ queryKey: ['platform-customers'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const handleDelete = (c) => {
    if (!window.confirm(`Delete customer "${c.customer_name}"?`)) return;
    deleteMut.mutate(c.customer_id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or phone…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none" />
        </div>
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
        {companyId && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add Customer</Button>}
      </div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Customer','Phone','Email','Group','Company','Created',''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((c) => (
                  <tr key={c.customer_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.customer_name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.group_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.company_name}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3">{companyId && <RowActions onEdit={() => setEditTarget(c)} onDelete={() => handleDelete(c)} deleting={deleteMut.isPending} />}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-14 text-center text-gray-400"><UserCheck className="mx-auto mb-2 h-8 w-8 opacity-25" />No customers found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
      {createOpen && <CustomerModal companyId={companyId} onClose={() => setCreateOpen(false)} />}
      {editTarget  && <CustomerModal companyId={companyId} customer={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

// ── Product Modal (Create / Edit) ─────────────────────────────────────────────

function ProductModal({ companyId, product, onClose }) {
  const qc     = useQueryClient();
  const isEdit = !!product;
  const [form, setFormState] = useState({
    product_name:    product?.product_name    ?? '',
    sku:             product?.sku             ?? '',
    barcode:         product?.barcode         ?? '',
    category_id:     product?.category_id     ?? '',
    base_price:      product?.base_price      ?? '',
    cost_price:      product?.cost_price      ?? '',
    unit_of_measure: product?.unit_of_measure ?? 'Unit',
    is_active:       product?.is_active       ?? true,
  });
  const set = (k, v) => setFormState((f) => ({ ...f, [k]: v }));

  const { data: categories = [] } = useQuery({ queryKey: ['co-categories', companyId], queryFn: () => api.get('/products/categories', withCo(companyId)).then((r) => r.data.data), enabled: !!companyId });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['platform-products'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit ? api.put(`/products/${product.product_id}`, data, withCo(companyId)) : api.post('/products', data, withCo(companyId)),
    onSuccess: () => { toast.success(isEdit ? 'Product updated' : 'Product created'); invalidate(); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSubmit = () => {
    if (!form.product_name)        { toast.error('Product name is required'); return; }
    if (!form.base_price)          { toast.error('Base price is required');   return; }
    if (!isEdit && !form.sku)      { toast.error('SKU is required');          return; }
    mutate({ ...form, base_price: parseFloat(form.base_price) || 0, cost_price: parseFloat(form.cost_price) || 0, category_id: form.category_id || null });
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit Product — ${product.product_name}` : 'Create Product'} size="lg"
      footer={<div className="flex gap-3"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth loading={isPending} onClick={handleSubmit}>{isEdit ? 'Save Changes' : 'Create Product'}</Button></div>}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Product Name" required><input value={form.product_name} onChange={(e) => set('product_name', e.target.value)} className={inp} /></Field></div>
        <Field label="SKU" required={!isEdit} hint={isEdit ? 'SKU cannot be changed' : undefined}>
          <input value={form.sku} onChange={(e) => set('sku', e.target.value)} disabled={isEdit} className={`${inp} ${isEdit ? 'bg-gray-50 text-gray-400' : ''}`} />
        </Field>
        <Field label="Barcode"><input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} className={inp} /></Field>
        <Field label="Category">
          <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)} className={sel}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
          </select>
        </Field>
        <Field label="Unit of Measure">
          <select value={form.unit_of_measure} onChange={(e) => set('unit_of_measure', e.target.value)} className={sel}>
            {['Unit','Kg','g','L','ml','Box','Pack','Dozen','Pair','m'].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Base Price (selling)" required><input type="number" step="0.01" min="0" value={form.base_price} onChange={(e) => set('base_price', e.target.value)} className={inp} /></Field>
        <Field label="Cost Price"><input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => set('cost_price', e.target.value)} className={inp} /></Field>
        {isEdit && <Field label="Status"><select value={form.is_active ? 'true' : 'false'} onChange={(e) => set('is_active', e.target.value === 'true')} className={sel}><option value="true">Active</option><option value="false">Inactive</option></select></Field>}
      </div>
    </Modal>
  );
}

// ── Products Panel ────────────────────────────────────────────────────────────

function ProductsPanel({ companies }) {
  const qc = useQueryClient();
  const [search,    setSearch]      = useState('');
  const [companyId, setCompanyId]   = useState('');
  const [page,      setPage]        = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-products', { search, companyId, page }],
    queryFn: () => api.get('/platform/products', { params: { search, companyId, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.products ?? [];
  const total = data?.total    ?? 0;
  const pages = data?.pages    ?? 1;

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/products/${id}`, withCo(companyId)),
    onSuccess: () => { toast.success('Product deleted'); qc.invalidateQueries({ queryKey: ['platform-products'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const handleDelete = (p) => {
    if (!window.confirm(`Delete product "${p.product_name}"? This cannot be undone.`)) return;
    deleteMut.mutate(p.product_id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search product or SKU…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none" />
        </div>
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
        {companyId && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add Product</Button>}
      </div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Product','SKU','Category','Company','Base Price','Status',''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((p) => (
                  <tr key={p.product_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.product_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.category_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.company_name}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{formatCurrency(p.base_price)}</td>
                    <td className="px-4 py-3">{p.is_active ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Inactive</span>}</td>
                    <td className="px-4 py-3">{companyId && <RowActions onEdit={() => setEditTarget(p)} onDelete={() => handleDelete(p)} deleting={deleteMut.isPending} />}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-14 text-center text-gray-400"><Package className="mx-auto mb-2 h-8 w-8 opacity-25" />No products found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
      {createOpen && <ProductModal companyId={companyId} onClose={() => setCreateOpen(false)} />}
      {editTarget  && <ProductModal companyId={companyId} product={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

// ── Branch Pricing Modal ──────────────────────────────────────────────────────

function BranchPricingModal({ companyId, product, onClose }) {
  const qc = useQueryClient();
  const { data: pricing = [], isLoading } = useQuery({
    queryKey: ['branch-pricing', companyId, product.product_id],
    queryFn: () => api.get(`/products/${product.product_id}/branch-pricing`, withCo(companyId)).then((r) => r.data.data),
    enabled: !!companyId && !!product.product_id,
  });

  const [edits, setEdits] = useState({});
  const setEdit = (branchId, field, value) =>
    setEdits((prev) => ({ ...prev, [branchId]: { ...prev[branchId], [field]: value } }));

  const saveMut = useMutation({
    mutationFn: ({ branchId, selling_price, special_price }) =>
      api.put(`/products/${product.product_id}/branch-pricing`, { branchId, selling_price, special_price }, withCo(companyId)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branch-pricing', companyId, product.product_id] }); toast.success('Pricing saved'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSave = (row) => {
    const edit = edits[row.branch_id] ?? {};
    const selling_price = edit.selling_price !== undefined ? (edit.selling_price === '' ? null : parseFloat(edit.selling_price)) : row.selling_price;
    const special_price = edit.special_price !== undefined ? (edit.special_price === '' ? null : parseFloat(edit.special_price)) : row.special_price;
    saveMut.mutate({ branchId: row.branch_id, selling_price, special_price });
  };

  const handleReset = (row) => saveMut.mutate({ branchId: row.branch_id, selling_price: null, special_price: null });

  return (
    <Modal open onClose={onClose} title={`Branch Pricing — ${product.product_name}`} size="lg"
      footer={<Button fullWidth onClick={onClose}>Done</Button>}
    >
      <p className="mb-3 text-xs text-gray-500">
        Base price: <span className="font-semibold text-gray-800">{formatCurrency(product.base_price)}</span>
        {' '}— Leave selling price blank to use base price at that branch.
      </p>
      {isLoading ? <PageSpinner /> : (
        <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
          {pricing.map((row) => {
            const edit = edits[row.branch_id] ?? {};
            const sp  = edit.selling_price !== undefined ? edit.selling_price : (row.selling_price ?? '');
            const spp = edit.special_price !== undefined ? edit.special_price : (row.special_price ?? '');
            const dirty = edit.selling_price !== undefined || edit.special_price !== undefined;
            return (
              <div key={row.branch_id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50">
                <div className="w-36 flex-shrink-0">
                  <p className="text-sm font-medium text-gray-800">{row.branch_name}</p>
                  {!row.selling_price && <p className="text-xs text-gray-400">Using base price</p>}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-0.5 block">Selling Price</label>
                    <input type="number" step="0.01" min="0" value={sp} onChange={(e) => setEdit(row.branch_id, 'selling_price', e.target.value)}
                      placeholder={String(row.base_price)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-0.5 block">Promo / Special Price</label>
                    <input type="number" step="0.01" min="0" value={spp} onChange={(e) => setEdit(row.branch_id, 'special_price', e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {dirty && <Button size="xs" loading={saveMut.isPending} onClick={() => handleSave(row)}>Save</Button>}
                  {row.selling_price && (
                    <button onClick={() => handleReset(row)} className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors" title="Reset to base price">Reset</button>
                  )}
                </div>
              </div>
            );
          })}
          {pricing.length === 0 && <div className="py-10 text-center text-gray-400 text-sm">No branches found for this company.</div>}
        </div>
      )}
    </Modal>
  );
}

// ── Pricing Panel ─────────────────────────────────────────────────────────────

function PricingPanel({ companies }) {
  const [search,       setSearch]       = useState('');
  const [companyId,    setCompanyId]    = useState('');
  const [page,         setPage]         = useState(1);
  const [pricingTarget, setPricingTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-products', { search, companyId, page }],
    queryFn: () => api.get('/platform/products', { params: { search, companyId, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
    enabled: !!companyId,
  });
  const rows  = data?.products ?? [];
  const total = data?.total    ?? 0;
  const pages = data?.pages    ?? 1;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Select a company to manage branch-level pricing overrides. Per-branch pricing overrides the product's base price at that specific location.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search product or SKU…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none" />
        </div>
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
      </div>

      {!companyId ? (
        <div className="rounded-xl border border-gray-100 bg-white p-14 text-center text-gray-400">
          <DollarSign className="mx-auto mb-2 h-8 w-8 opacity-25" />
          <p className="text-sm">Select a company above to view and edit branch pricing</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {isLoading ? <PageSpinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Product','SKU','Category','Base Price','Status',''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((p) => (
                    <tr key={p.product_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.product_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.category_name ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{formatCurrency(p.base_price)}</td>
                      <td className="px-4 py-3">{p.is_active ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Inactive</span>}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setPricingTarget(p)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-colors">
                          <DollarSign className="h-3 w-3" /> Manage Pricing
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={6} className="py-14 text-center text-gray-400"><Package className="mx-auto mb-2 h-8 w-8 opacity-25" />No products found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pages={pages} total={total} onPage={setPage} />
        </div>
      )}
      {pricingTarget && <BranchPricingModal companyId={companyId} product={pricingTarget} onClose={() => setPricingTarget(null)} />}
    </div>
  );
}

// ── Inventory Panel ───────────────────────────────────────────────────────────

function InventoryPanel({ companies }) {
  const [companyId,    setCompanyId]    = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page,         setPage]         = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['platform-inventory', { companyId, lowStockOnly, page }],
    queryFn: () => api.get('/platform/inventory', { params: { companyId, lowStockOnly, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.inventory ?? [];
  const total = data?.total     ?? 0;
  const pages = data?.pages     ?? 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => { setLowStockOnly(e.target.checked); setPage(1); }} className="rounded border-gray-300 text-primary-600" /> Low stock only
        </label>
      </div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Product','Branch','Company','Qty','Reorder Level','Alert'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((i) => {
                  const isLow = i.quantity_available <= i.reorder_level;
                  return (
                    <tr key={`${i.product_id}-${i.branch_id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{i.product_name}</td>
                      <td className="px-4 py-3 text-gray-600">{i.branch_name}</td>
                      <td className="px-4 py-3 text-gray-600">{i.company_name}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{i.quantity_available}</td>
                      <td className="px-4 py-3 text-gray-500">{i.reorder_level}</td>
                      <td className="px-4 py-3">{isLow ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-600 px-2 py-0.5 text-xs font-medium"><AlertTriangle className="h-3 w-3" /> Low</span> : <span className="text-gray-300 text-xs">OK</span>}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={6} className="py-14 text-center text-gray-400"><BarChart2 className="mx-auto mb-2 h-8 w-8 opacity-25" />No inventory data found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
    </div>
  );
}

// ── Sales Panel ───────────────────────────────────────────────────────────────

function SalesPanel({ companies }) {
  const [companyId, setCompanyId] = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [page,      setPage]      = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['platform-sales', { companyId, dateFrom, dateTo, page }],
    queryFn: () => api.get('/platform/sales', { params: { companyId, dateFrom, dateTo, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.sales ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} />
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
        <input type="date" value={dateTo}   onChange={(e) => { setDateTo(e.target.value);   setPage(1); }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
      </div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Receipt','Company','Branch','Cashier','Total','Date','Status'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((s) => (
                  <tr key={s.transaction_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.transaction_number}</td>
                    <td className="px-4 py-3 text-gray-600">{s.company_name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.branch_name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.cashier_name ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(s.total_amount)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(s.transaction_date)}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="py-14 text-center text-gray-400"><ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-25" />No sales found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
    </div>
  );
}

// ── Payment Methods Panel ─────────────────────────────────────────────────────

function PaymentsPanel({ companies }) {
  const [companyId, setCompanyId] = useState('');
  const [page,      setPage]      = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['platform-payments', { companyId, page }],
    queryFn: () => api.get('/platform/payment-methods', { params: { companyId, page, limit: 25 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });
  const rows  = data?.paymentMethods ?? [];
  const total = data?.total          ?? 0;
  const pages = data?.pages          ?? 1;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><CompanyFilter companies={companies} value={companyId} onChange={(v) => { setCompanyId(v); setPage(1); }} /></div>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Method','Company','Requires Ref','Status'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((p) => (
                  <tr key={p.payment_method_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.method_name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.company_name}</td>
                    <td className="px-4 py-3">{p.requires_reference ? <CheckCircle className="h-4 w-4 text-green-500" /> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">{p.is_active ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Inactive</span>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4} className="py-14 text-center text-gray-400"><CreditCard className="mx-auto mb-2 h-8 w-8 opacity-25" />No payment methods found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'companies', label: 'Companies',  Icon: Building2    },
  { id: 'plans',     label: 'Plans',      Icon: CreditCard   },
  { id: 'users',     label: 'Users',      Icon: Users        },
  { id: 'branches',  label: 'Branches',   Icon: GitBranch    },
  { id: 'terminals', label: 'Terminals',  Icon: Monitor      },
  { id: 'sessions',  label: 'Sessions',   Icon: Layers       },
  { id: 'pricing',   label: 'Pricing',    Icon: DollarSign   },
  { id: 'sales',     label: 'Sales',      Icon: ShoppingCart },
  { id: 'products',  label: 'Products',   Icon: Package      },
  { id: 'inventory', label: 'Inventory',  Icon: BarChart2    },
  { id: 'customers', label: 'Customers',  Icon: UserCheck    },
  { id: 'payments',  label: 'Payments',   Icon: CreditCard   },
];

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    return TABS.some((tab) => tab.id === t) ? t : 'companies';
  });
  const qc = useQueryClient();

  const switchTab = (id) => {
    setActiveTab(id);
    setSearchParams({ tab: id }, { replace: true });
  };

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.some((tab) => tab.id === t) && t !== activeTab) {
      setActiveTab(t);
    }
  }, [searchParams]);

  const { data: plans = [] } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api.get('/companies/plans').then((r) => r.data.data),
  });

  const { data: companiesForFilter = [] } = useQuery({
    queryKey: ['platform-companies-list'],
    queryFn: () => api.get('/platform/companies', { params: { limit: 200 } })
      .then((r) => r.data.data?.companies ?? r.data.data?.rows ?? []),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Platform Admin</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all tenants, subscriptions, and platform data</p>
        </div>
        {activeTab === 'companies' && (
          <button onClick={() => qc.invalidateQueries({ queryKey: ['platform-stats'] })}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh stats
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-gray-200 gap-0">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => switchTab(id)}
            className={[
              'flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
              activeTab === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'companies' && <><PlatformStats /><CompaniesPanel plans={plans} /></>}
      {activeTab === 'plans'     && <PlansPanel />}
      {activeTab === 'users'     && <UsersPanel companies={companiesForFilter} />}
      {activeTab === 'branches'  && <BranchesPanel companies={companiesForFilter} />}
      {activeTab === 'terminals' && <TerminalsPanel companies={companiesForFilter} />}
      {activeTab === 'sessions'  && <SessionsPanel companies={companiesForFilter} />}
      {activeTab === 'pricing'   && <PricingPanel companies={companiesForFilter} />}
      {activeTab === 'sales'     && <SalesPanel companies={companiesForFilter} />}
      {activeTab === 'products'  && <ProductsPanel companies={companiesForFilter} />}
      {activeTab === 'inventory' && <InventoryPanel companies={companiesForFilter} />}
      {activeTab === 'customers' && <CustomersPanel companies={companiesForFilter} />}
      {activeTab === 'payments'  && <PaymentsPanel companies={companiesForFilter} />}
    </div>
  );
}
