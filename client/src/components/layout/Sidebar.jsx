import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Warehouse, Users, Receipt,
  BarChart2, Settings, ShieldCheck, Monitor, UserCog, Clock,
  RotateCcw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Smartphone, Building2, GitBranch, Layers, ShoppingCart,
  CreditCard, BookOpen, Landmark, Truck, Lock, Star, ScrollText,
} from 'lucide-react';
import { useAuthStore } from '@/app/store';
import { usePermission } from '@/hooks/usePermission';

const MIN_WIDTH = 64;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 224;   // w-56
const COLLAPSED_THRESHOLD = 72; // <= this → icon-only mode

// ── NavItem ───────────────────────────────────────────────────────────────────

// Active:  solid white-tinted bg + gold left-border accent
// Hover:   clearly visible white tint (14%)
// Regular: full-brightness white text at 80% opacity
const navBase = 'flex items-center rounded-lg text-sm font-medium transition-all duration-150';
const navActive = 'bg-white/[.18] text-white font-semibold border-l-2 border-secondary-400';
const navHover = 'text-white/80 hover:bg-white/[.14] hover:text-white border-l-2 border-transparent';
const navLocked = 'text-white/35 cursor-not-allowed border-l-2 border-transparent';

function NavItem({ to, label, Icon, collapsed, locked, isAdmin, search }) {
  const navigate = useNavigate();

  if (isAdmin) {
    const target = `/app/admin${search ? `?tab=${search}` : ''}`;
    const location = useLocation();
    const isActive = location.pathname === '/app/admin' &&
      (search ? location.search === `?tab=${search}` : !location.search);

    return (
      <button
        onClick={() => navigate(target)}
        title={collapsed ? label : undefined}
        className={[
          navBase,
          collapsed ? 'justify-center p-2 border-none' : 'gap-3 pl-2 pr-3 py-2',
          isActive ? navActive : navHover,
        ].join(' ')}
      >
        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-secondary-400' : ''}`} />
        {!collapsed && <span className="flex-1 text-left">{label}</span>}
        {!collapsed && locked && <Lock className="h-3 w-3 text-secondary-400/70 flex-shrink-0" />}
      </button>
    );
  }

  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) => [
        navBase,
        collapsed ? 'justify-center p-2 border-none' : 'gap-3 pl-2 pr-3 py-2',
        isActive ? navActive : locked ? navLocked : navHover,
      ].join(' ')}
      onClick={locked ? (e) => e.preventDefault() : undefined}
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-secondary-400' : ''}`} />
          {!collapsed && <span className="flex-1">{label}</span>}
          {!collapsed && locked && <Lock className="h-3 w-3 text-secondary-400/70 flex-shrink-0" />}
        </>
      )}
    </NavLink>
  );
}

// ── NavGroup ──────────────────────────────────────────────────────────────────

function NavGroup({ id, label, collapsed, defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(`sidebar-group-${id}`);
    return stored !== null ? stored === 'true' : defaultOpen;
  });

  const toggle = () => {
    setOpen((v) => {
      localStorage.setItem(`sidebar-group-${id}`, String(!v));
      return !v;
    });
  };

  if (collapsed) {
    return <div className="space-y-1 pt-1">{children}</div>;
  }

  return (
    <div className="space-y-1">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/60 hover:text-white/90 transition-colors"
      >
        <span>{label}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

// ── Finance Group ─────────────────────────────────────────────────────────────

function FinanceGroup({ collapsed, hasCapability }) {
  const user = useAuthStore((s) => s.user);
  const hasFinance = user?.planFeatures?.hasFinance ?? false;

  if (!hasCapability('settings.manage')) return null;

  return (
    <NavGroup id="finance" label="Finance" collapsed={collapsed} defaultOpen={false}>
      {!hasFinance && !collapsed && (
        <div className="mx-3 mb-1.5 rounded-lg bg-secondary-500/20 border border-secondary-400/40 px-2.5 py-2">
          <p className="text-xs font-semibold text-secondary-300">Finance Module</p>
          <p className="text-xs text-white/60 mt-0.5">Upgrade your plan to unlock suppliers, purchasing, and financial reports.</p>
        </div>
      )}
      <NavItem to="/app/suppliers" label="Suppliers" Icon={Truck} collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/purchases" label="Purchases" Icon={ShoppingCart} collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/payments" label="Payments" Icon={CreditCard} collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/accounts" label="Accounts" Icon={BookOpen} collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/bank-accounts" label="Bank Accounts" Icon={Landmark} collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/journal" label="Journal" Icon={ScrollText} collapsed={collapsed} locked={!hasFinance} />
    </NavGroup>
  );
}

// ── Super Admin Nav ───────────────────────────────────────────────────────────

function SuperAdminNav({ collapsed }) {
  return (
    <nav className={['flex-1 overflow-y-auto py-3 space-y-3', collapsed ? 'px-2' : 'px-3'].join(' ')}>

      <NavItem to="/app/dashboard" label="Overview" Icon={LayoutDashboard} collapsed={collapsed} />

      <NavGroup id="sa-platform" label="Platform" collapsed={collapsed} defaultOpen>
        <NavItem to="/app/admin" label="Companies" Icon={Building2} collapsed={collapsed} isAdmin search="companies" />
        <NavItem to="/app/admin" label="Plans & Pricing" Icon={Star} collapsed={collapsed} isAdmin search="plans" />
        <NavItem to="/app/admin" label="Pricing Rules" Icon={CreditCard} collapsed={collapsed} isAdmin search="pricing" />
      </NavGroup>

      <NavGroup id="sa-people" label="People" collapsed={collapsed} defaultOpen>
        <NavItem to="/app/admin" label="All Users" Icon={UserCog} collapsed={collapsed} isAdmin search="users" />
        <NavItem to="/app/admin" label="Branches" Icon={GitBranch} collapsed={collapsed} isAdmin search="branches" />
      </NavGroup>

      <NavGroup id="sa-pos" label="POS Activity" collapsed={collapsed} defaultOpen={false}>
        <NavItem to="/app/admin" label="Sessions" Icon={Layers} collapsed={collapsed} isAdmin search="sessions" />
        <NavItem to="/app/admin" label="Terminals" Icon={Monitor} collapsed={collapsed} isAdmin search="terminals" />
        <NavItem to="/app/admin" label="Sales" Icon={Receipt} collapsed={collapsed} isAdmin search="sales" />
        <NavItem to="/app/admin" label="Payment Methods" Icon={CreditCard} collapsed={collapsed} isAdmin search="payments" />
      </NavGroup>

      <NavGroup id="sa-catalog" label="Catalog" collapsed={collapsed} defaultOpen={false}>
        <NavItem to="/app/admin" label="Products" Icon={Package} collapsed={collapsed} isAdmin search="products" />
        <NavItem to="/app/admin" label="Inventory" Icon={Warehouse} collapsed={collapsed} isAdmin search="inventory" />
      </NavGroup>

      <NavGroup id="sa-crm" label="CRM" collapsed={collapsed} defaultOpen={false}>
        <NavItem to="/app/admin" label="Customers" Icon={Users} collapsed={collapsed} isAdmin search="customers" />
      </NavGroup>

    </nav>
  );
}

// ── Tenant Nav ────────────────────────────────────────────────────────────────

function TenantNav({ collapsed, hasCapability }) {
  return (
    <nav className={['flex-1 overflow-y-auto py-3 space-y-3', collapsed ? 'px-2' : 'px-3'].join(' ')}>

      {hasCapability('dashboard.view') && (
        <NavItem to="/app/dashboard" label="Dashboard" Icon={LayoutDashboard} collapsed={collapsed} />
      )}

      {(hasCapability('sales.view') || hasCapability('returns.view') || hasCapability('shifts.view') || hasCapability('mpesa.view')) && (
        <NavGroup id="pos" label="POS" collapsed={collapsed} defaultOpen>
          {hasCapability('sales.view') && <NavItem to="/app/sales" label="Sales" Icon={Receipt} collapsed={collapsed} />}
          {hasCapability('returns.view') && <NavItem to="/app/returns" label="Returns" Icon={RotateCcw} collapsed={collapsed} />}
          {hasCapability('shifts.view') && <NavItem to="/app/shifts" label="Shifts" Icon={Clock} collapsed={collapsed} />}
          {hasCapability('mpesa.view') && <NavItem to="/app/mpesa" label="M-Pesa" Icon={Smartphone} collapsed={collapsed} />}
        </NavGroup>
      )}

      {(hasCapability('products.view') || hasCapability('inventory.view')) && (
        <NavGroup id="inventory" label="Inventory" collapsed={collapsed} defaultOpen>
          {hasCapability('products.view') && <NavItem to="/app/products" label="Products" Icon={Package} collapsed={collapsed} />}
          {hasCapability('inventory.view') && <NavItem to="/app/inventory" label="Inventory" Icon={Warehouse} collapsed={collapsed} />}
        </NavGroup>
      )}

      {hasCapability('customers.view') && (
        <NavItem to="/app/customers" label="Customers" Icon={Users} collapsed={collapsed} />
      )}

      <FinanceGroup collapsed={collapsed} hasCapability={hasCapability} />

      {hasCapability('reports.view') && (
        <NavGroup id="reports" label="Reports" collapsed={collapsed} defaultOpen={false}>
          <NavItem to="/app/reports" label="Sales Reports" Icon={BarChart2} collapsed={collapsed} />
        </NavGroup>
      )}

      {(hasCapability('users.view') || hasCapability('settings.manage')) && (
        <NavGroup id="admin" label="Administration" collapsed={collapsed} defaultOpen={false}>
          {hasCapability('users.view') && <NavItem to="/app/users" label="Users & Roles" Icon={UserCog} collapsed={collapsed} />}
          {hasCapability('settings.manage') && <NavItem to="/app/settings" label="Settings" Icon={Settings} collapsed={collapsed} />}
        </NavGroup>
      )}

    </nav>
  );
}

// ── Root Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar() {
  const { hasCapability } = usePermission();
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === 'super_admin';

  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem('sidebar-width');
    return stored ? Number(stored) : DEFAULT_WIDTH;
  });

  const sidebarRef = useRef(null);
  const dragging = useRef(false);

  const collapsed = width <= COLLAPSED_THRESHOLD;

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX - rect.left));
      setWidth(next);
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Snap to icon-only if user dragged close to minimum
      setWidth((w) => {
        const snapped = w < MIN_WIDTH + 20 ? MIN_WIDTH : w;
        localStorage.setItem('sidebar-width', String(snapped));
        return snapped;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startDrag = (e) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const toggle = () => {
    setWidth((w) => {
      const next = w <= COLLAPSED_THRESHOLD ? DEFAULT_WIDTH : MIN_WIDTH;
      localStorage.setItem('sidebar-width', String(next));
      return next;
    });
  };

  return (
    <aside
      ref={sidebarRef}
      style={{ width }}
      className="relative flex h-full flex-col bg-primary-500 text-white flex-shrink-0"
    >
      {/* Logo + collapse toggle */}
      <div className={[
        'flex items-center border-b border-white/20 flex-shrink-0',
        collapsed ? 'flex-col gap-3 px-0 py-3' : 'justify-between px-4 py-3',
      ].join(' ')}>
        <div className="flex items-center gap-2 overflow-hidden">
          {collapsed ? (
            /* Icon-only when collapsed */
            <img
              src="/statify-icon-white.svg"
              alt="Statify"
              className="h-9 w-9 flex-shrink-0"
            />
          ) : (
            /* Full wordmark when expanded */
            <img
              src="/statify-logo-white.svg"
              alt="Statify Solutions Limited"
              className="h-16 w-auto flex-shrink-0"
            />
          )}
          {!collapsed && isSuperAdmin && (
            <span className="ml-1 text-xs text-secondary-400 font-medium whitespace-nowrap">Super Admin</span>
          )}
        </div>
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex flex-shrink-0 items-center justify-center rounded-lg p-1.5 text-white/60 hover:bg-white/20 hover:text-white transition-colors"
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* POS shortcut — tenant only */}
      {!isSuperAdmin && hasCapability('pos.open') && (
        <div className={['pt-3 flex-shrink-0', collapsed ? 'px-2' : 'px-3'].join(' ')}>
          <NavLink
            to="/pos"
            title="Open POS Terminal"
            className={[
              'flex items-center rounded-lg bg-secondary-500 text-sm font-semibold text-black hover:bg-secondary-600 transition-colors',
              collapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
            ].join(' ')}
          >
            <Monitor className="h-4 w-4 flex-shrink-0" />
            {!collapsed && 'Open POS Terminal'}
          </NavLink>
        </div>
      )}

      {/* Navigation */}
      {isSuperAdmin
        ? <SuperAdminNav collapsed={collapsed} />
        : <TenantNav collapsed={collapsed} hasCapability={hasCapability} />
      }

      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-secondary-500/40 active:bg-secondary-500/60 transition-colors z-10"
      />
    </aside>
  );
}
