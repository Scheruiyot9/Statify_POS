import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, KeyRound, User, ChevronDown, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import { useAuthStore } from '@/app/store';
import api from '@/services/api';
import Button from '@/components/ui/Button';

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [form, setForm]   = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow]   = useState({ cur: false, new: false, con: false });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (form.newPassword !== form.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.patch('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword:     form.newPassword,
      });
      toast.success('Password updated successfully');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm pr-10 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary-600" />
            <h2 className="text-base font-bold text-gray-900">Change Password</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {[
            { key: 'currentPassword', label: 'Current Password',  showKey: 'cur' },
            { key: 'newPassword',     label: 'New Password',      showKey: 'new' },
            { key: 'confirm',         label: 'Confirm Password',  showKey: 'con' },
          ].map(({ key, label, showKey }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
              <div className="relative">
                <input
                  required
                  type={show[showKey] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, [showKey]: !s[showKey] }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {show[showKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}

          {form.newPassword.length > 0 && form.newPassword.length < 8 && (
            <p className="text-xs text-red-500">Password must be at least 8 characters</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth type="button" onClick={onClose}>Cancel</Button>
            <Button fullWidth type="submit" loading={loading}>Update Password</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Route → page title map ────────────────────────────────────────────────────
const ROUTE_TITLES = {
  '/app/dashboard':     'Dashboard',
  '/app/sales':         'Sales History',
  '/app/returns':       'Returns',
  '/app/shifts':        'Shifts',
  '/app/mpesa':         'M-Pesa Transactions',
  '/app/products':      'Products',
  '/app/inventory':     'Inventory',
  '/app/customers':     'Customers',
  '/app/suppliers':     'Suppliers',
  '/app/purchases':     'Purchases',
  '/app/payments':      'Payments',
  '/app/accounts':      'Chart of Accounts',
  '/app/bank-accounts': 'Bank Accounts',
  '/app/journal':       'Journal',
  '/app/reports':       'Sales Reports',
  '/app/users':         'Users & Roles',
  '/app/settings':      'Settings',
  '/app/admin':         'Admin Panel',
};

// ── App Layout ────────────────────────────────────────────────────────────────
export default function AppLayout() {
  const user               = useAuthStore((s) => s.user);
  const clearAuth          = useAuthStore((s) => s.clearAuth);
  const activeCompanyId    = useAuthStore((s) => s.activeCompanyId);
  const activeCompanyName  = useAuthStore((s) => s.activeCompanyName);
  const clearActiveCompany = useAuthStore((s) => s.clearActiveCompany);
  const navigate           = useNavigate();
  const location           = useLocation();

  const pageTitle = ROUTE_TITLES[location.pathname] ?? 'Statify POS';

  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isSuperAdmin = user?.role === 'super_admin';

  // Fetch company branding for the header avatar / logo
  const { data: myCompany } = useQuery({
    queryKey: ['my-company'],
    queryFn:  () => api.get('/companies/mine').then((r) => r.data.data),
    enabled:  !!user && !isSuperAdmin,
    staleTime: 10 * 60_000,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort — clear local state regardless
    }
    clearAuth();
    toast.success('Logged out');
    navigate('/login', { replace: true });
  };

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="relative flex items-center justify-between px-6 py-3"
          style={{ background: 'linear-gradient(90deg, #011920 0%, #01303d 50%, #024A59 100%)' }}
        >
          {/* Amber accent line at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-secondary-500/60 to-transparent" />

          {/* Left: current page title + date */}
          <div>
            <h1 className="text-base font-bold tracking-wide text-white leading-tight">{pageTitle}</h1>
            <p className="text-[11px] text-white/40 leading-tight">
              {new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {/* Right: company branding + profile dropdown */}
          <div className="flex items-center gap-3">

            {/* Company logo (tenant) or Statify logo (super-admin) */}
            {isSuperAdmin ? (
              <img src="/statify-logo-white.svg" alt="Statify" className="h-8 w-auto" />
            ) : myCompany?.company_name ? (
              <div className="flex items-center gap-2">
                {myCompany.logo_url && (
                  <img
                    src={myCompany.logo_url}
                    alt={myCompany.company_name}
                    className="h-7 w-7 rounded-md object-contain"
                  />
                )}
                <span className="text-sm font-semibold text-white/80">{myCompany.company_name}</span>
              </div>
            ) : null}

            {/* Separator */}
            <div className="h-6 w-px bg-white/20" />

            {/* Profile dropdown trigger */}
            <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 hover:border-white/15 hover:bg-white/10 transition-all"
            >
              {/* Avatar */}
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-500 text-xs font-bold text-primary-900">
                {initials || <User className="h-4 w-4" />}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-white leading-tight">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-white/50 capitalize leading-tight">
                  {user?.role?.replace(/_/g, ' ')}
                </p>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-white/50 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-gray-100 bg-white shadow-lg z-40 overflow-hidden">
                {/* User info */}
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">
                    {user?.role?.replace(/_/g, ' ')}
                  </p>
                </div>

                {/* Actions */}
                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => { setChangePwdOpen(true); setDropdownOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <KeyRound className="h-4 w-4 text-gray-400" />
                    Change Password
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </button>
                </div>
              </div>
            )}
            </div>{/* end dropdown wrapper */}
          </div>{/* end right-side flex */}
        </header>

        {/* Super-admin company context banner */}
        {isSuperAdmin && activeCompanyId && (
          <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm">
            <span className="text-amber-800">
              Filtered to: <span className="font-semibold">{activeCompanyName}</span>
            </span>
            <div className="flex items-center gap-4">
              <Link to="/app/admin" className="text-amber-700 underline hover:text-amber-900">
                Switch company
              </Link>
              <button
                onClick={clearActiveCompany}
                className="text-amber-600 hover:text-amber-900 font-medium"
              >
                ✕ Clear filter
              </button>
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Change password modal */}
      {changePwdOpen && <ChangePasswordModal onClose={() => setChangePwdOpen(false)} />}
    </div>
  );
}
