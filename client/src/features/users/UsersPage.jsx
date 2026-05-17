import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, UserCheck, UserX, KeyRound, Search, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import Button      from '@/components/ui/Button';
import Modal       from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { usePermission } from '@/hooks/usePermission';

// ── Helpers ───────────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  company_admin:    'bg-purple-100 text-purple-700',
  branch_manager:   'bg-blue-100 text-blue-700',
  cashier:          'bg-green-100 text-green-700',
  inventory_manager:'bg-orange-100 text-orange-700',
  accountant:       'bg-teal-100 text-teal-700',
  sales_staff:      'bg-yellow-100 text-yellow-700',
};

function RoleBadge({ role }) {
  const cls = ROLE_COLORS[role] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {role?.replace(/_/g, ' ')}
    </span>
  );
}

// ── User Form Modal ───────────────────────────────────────────────────────────
function UserForm({ user, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!user;

  const [form, setForm] = useState({
    first_name: user?.first_name ?? '',
    last_name:  user?.last_name  ?? '',
    email:      user?.email      ?? '',
    phone:      user?.phone      ?? '',
    role_id:    user?.role_id    ?? '',
    branch_id:  user?.branch_id  ?? '',
    is_active:  user?.is_active  ?? true,
    password:   '',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none';

  const { data: roles    = [] } = useQuery({ queryKey: ['roles'],    queryFn: () => api.get('/users/roles').then((r) => r.data.data) });
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/branches').then((r) => r.data.data) });

  const { mutate, isPending } = useMutation({
    mutationFn: (data) =>
      isEdit
        ? api.put(`/users/${user.user_id}`, data)
        : api.post('/users', data),
    onSuccess: (res) => {
      if (!isEdit && res.data.data?.temp_password) {
        toast.success(
          `User created. Temporary password: ${res.data.data.temp_password}`,
          { duration: 12000 }
        );
      } else {
        toast.success(isEdit ? 'User updated' : 'User created');
      }
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const handleSubmit = () => {
    if (!form.first_name.trim())           { toast.error('First name is required'); return; }
    if (!isEdit && !form.email.trim())     { toast.error('Email is required'); return; }
    if (!form.role_id)                     { toast.error('Role is required'); return; }

    const payload = { ...form };
    if (isEdit)          delete payload.email;    // email cannot be changed
    if (!payload.password) delete payload.password; // omit if blank (create only)
    mutate(payload);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit: ${user.first_name} ${user.last_name}` : 'New User'}
      size="sm"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth loading={isPending} onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">First Name *</label>
            <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Last Name</label>
            <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Email — create only */}
        {!isEdit && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Email *</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
          </div>
        )}

        {/* Phone */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Phone</label>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
        </div>

        {/* Role — always shown */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Role *</label>
          <select value={form.role_id} onChange={(e) => set('role_id', e.target.value)} className={inputCls}>
            <option value="">Select role…</option>
            {roles.map((r) => (
              <option key={r.role_id} value={r.role_id}>{r.role_name.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {/* Branch — always shown */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Primary Branch</label>
          <select value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)} className={inputCls}>
            <option value="">— No branch —</option>
            {branches.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
            ))}
          </select>
        </div>

        {/* Status — edit only */}
        {isEdit && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
              {[{ label: 'Active', value: true }, { label: 'Inactive', value: false }].map(({ label, value }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => set('is_active', value)}
                  className={`flex-1 py-2 transition-colors ${
                    form.is_active === value
                      ? value ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Temporary password — create only */}
        {!isEdit && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Temporary Password</label>
            <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)}
              placeholder="Leave blank to auto-generate"
              className={inputCls} />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const [pwd, setPwd] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/users/${user.user_id}/reset-password`, { newPassword: pwd }),
    onSuccess:  () => { toast.success('Password reset'); onClose(); },
    onError:    (err) => toast.error(err.response?.data?.message || 'Reset failed'),
  });

  return (
    <Modal
      open onClose={onClose} title="Reset Password" size="sm"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth loading={isPending} onClick={() => mutate()} disabled={pwd.length < 8}>Reset</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">Set a new password for <span className="font-semibold">{user.first_name} {user.last_name}</span>.</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">New Password (min 8 characters)</label>
          <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
        </div>
      </div>
    </Modal>
  );
}

// ── Roles & Permissions Tab ───────────────────────────────────────────────────

const MODULE_ORDER = [
  'sales', 'pos', 'returns', 'inventory', 'products', 'customers',
  'reports', 'users', 'settings', 'finance', 'shifts', 'mpesa',
];

function RolesTab() {
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles-with-permissions'],
    queryFn:  () => api.get('/users/roles/permissions').then((r) => r.data.data),
  });

  if (isLoading) return <PageSpinner />;

  if (!roles.length) return (
    <div className="rounded-xl border border-gray-100 bg-white p-12 text-center text-gray-400 shadow-sm">
      <ShieldCheck className="mx-auto mb-2 h-8 w-8 opacity-30" />
      No roles found.
    </div>
  );

  // Collect all unique modules across all roles
  const allModules = [];
  const seenMods = new Set();
  for (const mod of MODULE_ORDER) {
    for (const role of roles) {
      if (role.permissions.some((p) => p.module_name === mod) && !seenMods.has(mod)) {
        seenMods.add(mod);
        allModules.push(mod);
      }
    }
  }
  // Add any remaining modules not in MODULE_ORDER
  for (const role of roles) {
    for (const p of role.permissions) {
      if (!seenMods.has(p.module_name)) {
        seenMods.add(p.module_name);
        allModules.push(p.module_name);
      }
    }
  }

  // Build a nested map: module -> permission_name -> roleId -> { code, flags }
  const matrix = {}; // { [module]: { [permission_code]: { permission_name, [roleId]: flags } } }
  for (const role of roles) {
    for (const p of role.permissions) {
      if (!matrix[p.module_name]) matrix[p.module_name] = {};
      if (!matrix[p.module_name][p.permission_code]) {
        matrix[p.module_name][p.permission_code] = { permission_name: p.permission_name };
      }
      matrix[p.module_name][p.permission_code][role.role_id] = {
        can_read: p.can_read, can_create: p.can_create,
        can_update: p.can_update, can_delete: p.can_delete, can_export: p.can_export,
      };
    }
  }

  const flagLabel = { can_read: 'R', can_create: 'C', can_update: 'U', can_delete: 'D', can_export: 'X' };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Roles & Permissions</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Read-only view of what each role can do. <span className="font-mono text-xs">R</span>=Read&nbsp;
          <span className="font-mono text-xs">C</span>=Create&nbsp;
          <span className="font-mono text-xs">U</span>=Update&nbsp;
          <span className="font-mono text-xs">D</span>=Delete&nbsp;
          <span className="font-mono text-xs">X</span>=Export
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600 min-w-[200px]">Permission</th>
              {roles.map((r) => (
                <th key={r.role_id} className="px-3 py-3 text-center font-medium text-gray-600 min-w-[90px]">
                  <span className="capitalize">{r.role_name.replace(/_/g, ' ')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allModules.map((mod) => {
              const permCodes = Object.keys(matrix[mod] ?? {});
              if (!permCodes.length) return null;
              return (
                <>
                  {/* Module header row */}
                  <tr key={`mod-${mod}`} className="bg-primary-50/60 border-t border-b border-gray-100">
                    <td colSpan={roles.length + 1} className="px-4 py-1.5">
                      <span className="text-xs font-bold uppercase tracking-widest text-primary-600">
                        {mod}
                      </span>
                    </td>
                  </tr>
                  {permCodes.map((code) => {
                    const row = matrix[mod][code];
                    return (
                      <tr key={code} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 text-gray-700">
                          {row.permission_name}
                          <span className="ml-1.5 font-mono text-gray-400">({code})</span>
                        </td>
                        {roles.map((r) => {
                          const flags = row[r.role_id];
                          if (!flags) {
                            return (
                              <td key={r.role_id} className="px-3 py-2 text-center text-gray-200">—</td>
                            );
                          }
                          const active = Object.entries(flagLabel)
                            .filter(([k]) => flags[k])
                            .map(([, v]) => v);
                          return (
                            <td key={r.role_id} className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                {active.map((lbl) => (
                                  <span key={lbl} className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary-100 font-bold text-primary-700">
                                    {lbl}
                                  </span>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function UsersListTab({ canManageUsers }) {
  const qc = useQueryClient();
  const [search,    setSearch]    = useState('');
  const [formUser,  setFormUser]  = useState(null);  // null=closed, false=new, obj=edit
  const [resetUser, setResetUser] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn:  () => api.get('/users', { params: { search, limit: 50 } }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ userId, is_active }) => api.put(`/users/${userId}`, { is_active }),
    onSuccess:  () => { toast.success('User updated'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError:    (err) => toast.error(err.response?.data?.message || 'Update failed'),
  });

  const users = data?.users ?? [];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        {canManageUsers && (
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setFormUser(false)}>
            New User
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Branch</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Last Login</th>
                  {canManageUsers && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.length === 0 ? (
                  <tr><td colSpan={canManageUsers ? 7 : 6} className="py-12 text-center text-sm text-gray-400">No users found</td></tr>
                ) : users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.first_name} {u.last_name}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3"><RoleBadge role={u.role_name} /></td>
                    <td className="px-4 py-3 text-gray-500">{u.branch_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}
                    </td>
                    {canManageUsers && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button title="Edit" onClick={() => setFormUser(u)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button title="Reset password" onClick={() => setResetUser(u)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors">
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title={u.is_active ? 'Deactivate' : 'Activate'}
                            onClick={() => toggleActive({ userId: u.user_id, is_active: !u.is_active })}
                            className={`rounded p-1.5 transition-colors ${u.is_active
                              ? 'text-gray-400 hover:bg-gray-100 hover:text-red-600'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-green-600'}`}>
                            {u.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {canManageUsers && formUser !== null && (
        <UserForm user={formUser || null} onClose={() => setFormUser(null)} />
      )}
      {canManageUsers && resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  );
}

export default function UsersPage() {
  const { hasCapability } = usePermission();
  const canManageUsers = hasCapability('users.manage');
  const [activeTab, setActiveTab] = useState('users');

  const TABS = [
    { id: 'users', label: 'Users', Icon: UserCheck },
    { id: 'roles', label: 'Roles & Permissions', Icon: ShieldCheck },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-500 mt-0.5">Manage team members and view role permissions</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={[
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UsersListTab canManageUsers={canManageUsers} />}
      {activeTab === 'roles' && <RolesTab />}
    </div>
  );
}
