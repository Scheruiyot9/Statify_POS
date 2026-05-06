import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mail, Lock, Eye, EyeOff, AlertCircle, BarChart3, ShoppingCart, Users, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuthStore } from '@/app/store';
import Button from '@/components/ui/Button';

// ── Brand logo mark ───────────────────────────────────────────────────────────
function StatifyLogo({ size = 48, className = '' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}
    >
      <rect width="48" height="48" rx="14" fill="#FFA916" />
      {/* Bar chart bars */}
      <rect x="9"  y="28" width="6" height="11" rx="2" fill="#011920" />
      <rect x="18" y="20" width="6" height="19" rx="2" fill="#011920" />
      <rect x="27" y="14" width="6" height="25" rx="2" fill="#011920" />
      {/* Trend line */}
      <polyline
        points="12,26 21,18 30,12 39,9"
        stroke="#011920" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        fill="none"
      />
      <circle cx="39" cy="9" r="3" fill="#011920" />
    </svg>
  );
}

// ── Feature pill used in the left panel ──────────────────────────────────────
function FeaturePill({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/10 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary-400/20">
        <Icon className="h-4 w-4 text-secondary-300" />
      </div>
      <span className="text-sm font-medium text-white/90">{label}</span>
    </div>
  );
}

// ── Decorative floating card ──────────────────────────────────────────────────
function FloatingCard({ className = '' }) {
  return (
    <div className={`absolute rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl ${className}`}>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-secondary-400" />
          <div className="h-2 w-16 rounded-full bg-white/30" />
        </div>
        <div className="space-y-1.5">
          <div className="h-2 w-24 rounded-full bg-white/20" />
          <div className="h-2 w-16 rounded-full bg-white/20" />
        </div>
        <div className="mt-3 flex items-end gap-1">
          {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
            <div
              key={i}
              className="w-3 rounded-sm bg-secondary-400/70"
              style={{ height: `${h * 0.4}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate    = useNavigate();
  const setAuth     = useAuthStore((s) => s.setAuth);
  const [loading,   setLoading]   = useState(false);
  const [showPwd,   setShowPwd]   = useState(false);
  const [serverErr, setServerErr] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    setServerErr('');
    try {
      const res = await api.post('/auth/login', data);
      const { user, accessToken } = res.data.data;
      setAuth(user, accessToken);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || 'Login failed. Please try again.';
      setServerErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">

      {/* ── Left panel (hidden on mobile) ─────────────────────────────────── */}
      <div className="relative hidden lg:flex lg:w-[52%] flex-col justify-between overflow-hidden bg-primary-900 p-12">

        {/* Background gradient blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary-700/50 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-secondary-500/20 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-600/40 blur-2xl" />
        </div>

        {/* Decorative floating cards */}
        <FloatingCard className="right-8 top-32 w-44" />
        <FloatingCard className="right-20 bottom-40 w-36" />

        {/* Grid dots overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Top — logo */}
        <div className="relative flex items-center gap-3">
          <StatifyLogo size={44} />
          <div>
            <span className="text-xl font-bold text-white">Statify</span>
            <span className="ml-1 text-xl font-light text-secondary-400">POS</span>
          </div>
        </div>

        {/* Centre — headline */}
        <div className="relative">
          <h2 className="text-4xl font-bold leading-snug text-white">
            Sell smarter.<br />
            <span className="text-secondary-400">Grow faster.</span>
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-white/60">
            A complete point-of-sale platform built for modern multi-branch businesses.
            Real-time inventory, loyalty, reports and more — all in one place.
          </p>

          <div className="mt-8 flex flex-col gap-2.5">
            <FeaturePill icon={ShoppingCart}  label="Fast, offline-capable checkout" />
            <FeaturePill icon={BarChart3}     label="Live sales & inventory reports" />
            <FeaturePill icon={Users}         label="Multi-branch, multi-role access" />
            <FeaturePill icon={TrendingUp}    label="Customer loyalty & returns" />
          </div>
        </div>

        {/* Bottom — tagline */}
        <p className="relative text-xs text-white/30">
          © {new Date().getFullYear()} Statify · Multi-Tenant Point of Sale
        </p>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">

        {/* Mobile logo (shown only below lg) */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <StatifyLogo size={40} />
          <div>
            <span className="text-xl font-bold text-primary-900">Statify</span>
            <span className="ml-1 text-xl font-light text-secondary-500">POS</span>
          </div>
        </div>

        <div className="w-full max-w-md">

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              Enter your credentials to access your workspace.
            </p>
          </div>

          {/* Server error */}
          {serverErr && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverErr}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Email address</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gray-400">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  className={[
                    'block w-full rounded-xl border bg-white text-sm pl-10 pr-4 py-3 transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                    errors.email
                      ? 'border-red-400 bg-red-50 focus:ring-red-400'
                      : 'border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                  {...register('email', {
                    required: 'Email is required',
                    pattern:  { value: /\S+@\S+\.\S+/, message: 'Enter a valid email' },
                  })}
                />
              </div>
              {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Password</label>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gray-400">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={[
                    'block w-full rounded-xl border bg-white text-sm pl-10 pr-11 py-3 transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                    errors.password
                      ? 'border-red-400 bg-red-50 focus:ring-red-400'
                      : 'border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                  {...register('password', {
                    required:  'Password is required',
                    minLength: { value: 6, message: 'At least 6 characters' },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute inset-y-0 right-3.5 flex items-center text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className={[
                'relative flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3',
                'bg-primary-900 text-sm font-semibold text-white transition-all',
                'hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'shadow-md shadow-primary-900/30',
              ].join(' ')}
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="mt-10 text-xs text-gray-400 lg:hidden">
          © {new Date().getFullYear()} Statify POS
        </p>
      </div>
    </div>
  );
}
