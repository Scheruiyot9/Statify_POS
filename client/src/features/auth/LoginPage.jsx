import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Mail, Lock, Eye, EyeOff, AlertCircle,
  BarChart3, ShoppingCart, Users, TrendingUp,
  Shield, CheckCircle2, Package, CreditCard,
  ChevronDown, Sparkles, Zap, Globe, Smartphone,
  Repeat, Cloud, Key,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuthStore } from '@/app/store';

function StatifyLogo({ size = 40, variant = 'white', className = '' }) {
  const src = variant === 'white' ? '/statify-icon-white.svg' : '/statify-icon.svg';
  return <img src={src} alt="Statify" width={size} height={size} className={className} />;
}

const FEATURES = [
  { icon: ShoppingCart, title: 'Lightning-fast checkout', desc: 'Process sales in seconds. Works offline — never miss a sale.' },
  { icon: BarChart3, title: 'Real-time analytics', desc: 'Live dashboards and inventory insights updated on every sale.' },
  { icon: Users, title: 'Multi-branch & multi-role', desc: 'One platform for every location with granular permissions.' },
  { icon: Package, title: 'Smart inventory', desc: 'Auto stock alerts, batch tracking, and purchase orders.' },
  { icon: CreditCard, title: 'Flexible payments', desc: 'Cash, M-Pesa STK Push, cards and split-tender supported.' },
  { icon: TrendingUp, title: 'Customer loyalty', desc: 'Loyalty points, customer profiles and sales returns built in.' },
  { icon: Shield, title: 'Finance & compliance', desc: 'Double-entry ledger, bank reconciliation and aging reports.' },
  { icon: Shield, title: 'Supplier Management', desc: 'Manage suppliers, track deliveries, and maintain purchase orders.' },
];

const INTEGRATIONS = [
  {
    icon: Smartphone,
    name: 'M-Pesa',
    desc: 'Prompt customers to pay directly from their phone. Instant confirmation at the till.',
    badge: 'Built-in',
  },
  {
    icon: CreditCard,
    name: 'Card Payments',
    desc: 'Accept Visa, Mastercard and other cards via integrated payment terminals.',
    badge: 'Supported',
  },
  {
    icon: Repeat,
    name: 'Bank Reconciliation',
    desc: 'Import bank statements and auto-match transactions against your ledger entries.',
    badge: 'Finance',
  },
  {
    icon: Cloud,
    name: 'Cloud Sync',
    desc: 'All data syncs in real-time across every branch and device. No manual exports.',
    badge: 'Always on',
  },
  {
    icon: Globe,
    name: 'Multi-currency',
    desc: 'Sell in KES and other currencies. Exchange rates and VAT handled automatically.',
    badge: 'Global',
  },
  {
    icon: Key,
    name: 'API Access',
    desc: 'Connect Statify to your existing tools via a clean REST API and webhook support.',
    badge: 'Enterprise',
  },
];

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Finance', href: '#finance' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'Support', href: 'mailto:support@statify.co' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const featuresRef = useRef(null);

  const { register, handleSubmit, formState: { errors } } = useForm();

  const scrollToFeatures = () =>
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });

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
      setServerErr(err?.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50"
        style={{ background: 'linear-gradient(135deg, #011920 0%, #024A59 55%, #02323c 100%)' }}
      >
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-secondary-500/60 to-transparent" />

        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-3.5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <StatifyLogo size={30} variant="white" />
            <span className="text-base font-extrabold tracking-widest text-white">STATIFY</span>
            <span className="text-base font-light text-secondary-400">POS</span>
          </div>

          {/* Nav links */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-white/55 transition-colors hover:bg-white/8 hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>

          {/* Right CTA */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="rounded-xl bg-secondary-500 px-4 py-2 text-sm font-bold text-primary-900 shadow-md shadow-secondary-500/20 transition-all hover:bg-secondary-400"
          >
            Sign in
          </button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #ecf5f7 0%, #ffffff 55%, #fff8eb 100%)' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[.04]"
          style={{ backgroundImage: 'radial-gradient(#024A59 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
        <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-primary-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-secondary-200/40 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-8 pb-16 pt-14 lg:grid-cols-[1fr_400px]">

          {/* Left */}
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-secondary-300/50 bg-secondary-50 px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-secondary-600" />
              <span className="text-xs font-bold uppercase tracking-widest text-secondary-700">
                All-in-one point of sale
              </span>
            </div>

            <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight text-primary-900 lg:text-[58px]">
              Sell smarter.
              <br />
              <span
                style={{
                  background: 'linear-gradient(120deg,#024A59 0%,#3391a7 50%,#024A59 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Grow faster.
              </span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-gray-500">
              A complete retail management platform — blazing-fast checkout, real-time analytics,
              multi-branch control, loyalty programmes, and full accounting. All in one workspace.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={scrollToFeatures}
                className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-5 py-2.5 text-sm font-semibold text-primary-700 shadow-sm transition-all hover:bg-primary-50 hover:border-primary-300"
              >
                Explore features <ChevronDown className="h-4 w-4" />
              </button>
              <a
                href="#integrations"
                className="inline-flex items-center gap-2 rounded-xl border border-secondary-200 bg-secondary-50 px-5 py-2.5 text-sm font-semibold text-secondary-700 shadow-sm transition-all hover:bg-secondary-100"
              >
                <Zap className="h-4 w-4" /> Integrations
              </a>
            </div>
          </div>

          {/* Right — sign-in card */}
          <div className="w-full">
            <div
              className="overflow-hidden rounded-3xl shadow-2xl"
              style={{ background: 'linear-gradient(160deg, #024A59 0%, #011920 100%)' }}
            >
              <div className="h-1 w-full bg-gradient-to-r from-secondary-400 via-secondary-500 to-secondary-400" />

              <div className="px-8 pb-8 pt-7">
                <div className="mb-5 flex items-center gap-2">
                  <StatifyLogo size={28} variant="white" />
                  <span className="text-sm font-extrabold tracking-widest text-white">STATIFY</span>
                  <span className="text-sm font-light text-secondary-400">POS</span>
                </div>

                <h2 className="text-xl font-bold text-white">Sign in to your workspace</h2>
                <p className="mt-1 text-sm text-white/50">Enter your credentials to continue.</p>

                {serverErr && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{serverErr}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-white/70">Email address</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-white/30">
                        <Mail className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        placeholder="you@company.com"
                        autoComplete="email"
                        autoFocus
                        className={[
                          'login-input block w-full rounded-xl border text-sm pl-10 pr-4 py-3 transition-colors',
                          'bg-white/8 text-white placeholder-white/25',
                          'focus:outline-none focus:ring-2 focus:ring-secondary-400/60 focus:border-secondary-400/60 focus:bg-white/12',
                          errors.email ? 'border-red-400/50' : 'border-white/10 hover:border-white/20',
                        ].join(' ')}
                        {...register('email', {
                          required: 'Email is required',
                          pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email' },
                        })}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-white/70">Password</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-white/30">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        type={showPwd ? 'text' : 'password'}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className={[
                          'login-input block w-full rounded-xl border text-sm pl-10 pr-11 py-3 transition-colors',
                          'bg-white/8 text-white placeholder-white/25',
                          'focus:outline-none focus:ring-2 focus:ring-secondary-400/60 focus:border-secondary-400/60 focus:bg-white/12',
                          errors.password ? 'border-red-400/50' : 'border-white/10 hover:border-white/20',
                        ].join(' ')}
                        {...register('password', {
                          required: 'Password is required',
                          minLength: { value: 6, message: 'At least 6 characters' },
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        className="absolute inset-y-0 right-3.5 flex items-center text-white/30 hover:text-white/60"
                        tabIndex={-1}
                      >
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={[
                      'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 mt-1',
                      'bg-secondary-500 text-sm font-bold text-primary-900 transition-all',
                      'hover:bg-secondary-400 focus:outline-none focus:ring-2 focus:ring-secondary-400 focus:ring-offset-2 focus:ring-offset-primary-900',
                      'disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-secondary-500/20',
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
                    ) : 'Sign in'}
                  </button>
                </form>

                <div className="mt-6 space-y-2.5 border-t border-white/10 pt-5">
                  {[
                    'Full access to all modules',
                    'Real-time sales dashboard',
                    'Finance & accounting suite',
                  ].map((p) => (
                    <div key={p} className="flex items-center gap-2.5 text-xs text-white/45">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-secondary-400" />
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard screenshot strip */}
        <div className="mx-auto max-w-7xl px-8">
          <div className="overflow-hidden rounded-t-2xl border border-primary-200/40 shadow-2xl shadow-primary-900/20">
            <img
              src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1400&q=85&auto=format&fit=crop"
              alt="Analytics dashboard"
              className="block w-full object-cover object-center"
              style={{ maxHeight: 280 }}
            />
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" ref={featuresRef} className="bg-gray-50 pb-16 pt-14">
        <div className="mx-auto max-w-7xl px-8">
          <div className="mb-10 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-secondary-600">Everything you need</p>
            <h2 className="text-3xl font-extrabold text-gray-900">One platform. Every retail need.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500">
              From the till to the balance sheet, Statify covers every corner of retail so you can
              stop juggling disconnected tools.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-100">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <h3 className="mb-1.5 text-sm font-bold text-gray-900">{title}</h3>
                <p className="text-xs leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Finance ─────────────────────────────────────────────────────────── */}
      <section id="finance" className="bg-primary-800 py-16">
        <div className="mx-auto max-w-7xl px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-secondary-400">Built-in accounting</p>
              <h2 className="text-3xl font-extrabold leading-tight text-white">
                Finance that keeps up<br />with your business.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">
                Most POS systems hand you off to a third-party accounting tool. Statify has a full
                double-entry ledger, purchase management, supplier payments and financial reports —
                no integrations required.
              </p>
              <ul className="mt-7 space-y-2.5">
                {[
                  'No per-branch licensing fees',
                  'Offline-capable POS terminals',
                  'M-Pesa STK Push built in',
                  'Double-entry accounting included',
                  'Role-based access control',
                ].map((c) => (
                  <li key={c} className="flex items-center gap-3 text-sm text-white/70">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-secondary-400" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/40">
              <img
                src="https://images.unsplash.com/photo-1707157284454-553ef0a4ed0d?w=1200&q=85&auto=format&fit=crop"
                alt="Financial reporting and analytics"
                className="block w-full object-cover object-center"
                style={{ maxHeight: 380 }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations ────────────────────────────────────────────────────── */}
      <section id="integrations" className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-8">
          <div className="mb-10 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-secondary-600">Payments & connectivity</p>
            <h2 className="text-3xl font-extrabold text-gray-900">Connects to how you work.</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-gray-500">
              From mobile money to bank reconciliation, Statify plugs into the tools and
              payment methods your customers already use.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.map(({ icon: Icon, name, desc, badge }) => (
              <div
                key={name}
                className="group flex gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-primary-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-100">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900">{name}</h3>
                    <span className="rounded-full bg-secondary-50 px-2 py-0.5 text-[10px] font-bold text-secondary-700">
                      {badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer
        className="py-7"
        style={{ background: 'linear-gradient(135deg, #011920 0%, #024A59 55%, #02323c 100%)' }}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <StatifyLogo size={24} variant="white" />
            <span className="text-sm font-extrabold tracking-widest text-white/75">STATIFY</span>
            <span className="text-sm font-light text-secondary-400">POS</span>
          </div>
          <p className="text-xs text-white/25">© {new Date().getFullYear()} Statify · Multi-Tenant Point of Sale Platform</p>
          <div className="flex items-center gap-5">
            {['Privacy', 'Terms', 'Support'].map((l) => (
              <a key={l} href="#" className="text-xs text-white/25 transition-colors hover:text-white/60">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
