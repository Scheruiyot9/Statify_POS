import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Warehouse, Users, Receipt,
  BarChart2, Settings, ShieldCheck, Monitor, UserCog, Clock,
  RotateCcw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Smartphone, Building2, GitBranch, Layers, ShoppingCart,
  CreditCard, BookOpen, Landmark, Truck, Lock, Star,
} from 'lucide-react';
import { useAuthStore } from '@/app/store';
import { usePermission } from '@/hooks/usePermission';

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({ to, label, Icon, collapsed, locked, isAdmin, search }) {
  const navigate = useNavigate();

  if (isAdmin) {
    // Admin items link to /app/admin with a ?tab= param
    const target = `/app/admin${search ? `?tab=${search}` : ''}`;
    const location = useLocation();
    const isActive = location.pathname === '/app/admin' &&
      (search ? location.search === `?tab=${search}` : !location.search);

    return (
      <button
        onClick={() => navigate(target)}
        title={collapsed ? label : undefined}
        className={[
          'flex w-full items-center rounded-lg text-sm font-medium transition-colors',
          collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-secondary-500/20 text-secondary-400 font-semibold'
            : 'text-white/70 hover:bg-white/10 hover:text-white',
        ].join(' ')}
      >
        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-secondary-400' : ''}`} />
        {!collapsed && (
          <span className="flex-1 text-left">{label}</span>
        )}
        {!collapsed && locked && <Lock className="h-3 w-3 text-amber-400 flex-shrink-0" />}
      </button>
    );
  }

  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) => [
        'flex items-center rounded-lg text-sm font-medium transition-colors',
        collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
        isActive
          ? 'bg-secondary-500/20 text-secondary-400 font-semibold'
          : locked
            ? 'text-white/40 cursor-not-allowed'
            : 'text-white/70 hover:bg-white/10 hover:text-white',
      ].join(' ')}
      onClick={locked ? (e) => e.preventDefault() : undefined}
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-secondary-400' : locked ? 'text-white/30' : ''}`} />
          {!collapsed && <span className="flex-1">{label}</span>}
          {!collapsed && locked && <Lock className="h-3 w-3 text-amber-400 flex-shrink-0" />}
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
    // In collapsed mode render items directly without group header
    return <div className="space-y-1 pt-1">{children}</div>;
  }

  return (
    <div className="space-y-1">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/40 hover:text-white/60 transition-colors"
      >
        <span>{label}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

// ── Upgrade Banner ────────────────────────────────────────────────────────────

function FinanceGroup({ collapsed, hasCapability }) {
  const user = useAuthStore((s) => s.user);
  const hasFinance = user?.planFeatures?.hasFinance ?? false;

  if (!hasCapability('settings.manage')) return null; // accountant+ only

  return (
    <NavGroup id="finance" label="Finance" collapsed={collapsed} defaultOpen={false}>
      {!hasFinance && !collapsed && (
        <div className="mx-3 mb-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
          <p className="text-xs font-semibold text-amber-400">Finance Module</p>
          <p className="text-xs text-amber-300/70 mt-0.5">Upgrade to Growth plan to unlock suppliers, purchasing, and financial reports.</p>
        </div>
      )}
      <NavItem to="/app/suppliers" label="Suppliers" Icon={Truck}   collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/purchases" label="Purchases" Icon={ShoppingCart} collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/payments"  label="Payments"  Icon={CreditCard}   collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/accounts"  label="Accounts"  Icon={BookOpen}     collapsed={collapsed} locked={!hasFinance} />
      <NavItem to="/app/bank-accounts" label="Bank Accounts" Icon={Landmark} collapsed={collapsed} locked={!hasFinance} />
    </NavGroup>
  );
}

// ── Super Admin Sidebar ───────────────────────────────────────────────────────

function SuperAdminNav({ collapsed }) {
  return (
    <nav className={['flex-1 overflow-y-auto py-3 space-y-3', collapsed ? 'px-2' : 'px-3'].join(' ')}>

      {/* Overview */}
      <NavItem to="/app/dashboard" label="Overview" Icon={LayoutDashboard} collapsed={collapsed} />

      {/* Platform */}
      <NavGroup id="sa-platform" label="Platform" collapsed={collapsed} defaultOpen>
        <NavItem to="/app/admin" label="Companies"   Icon={Building2}  collapsed={collapsed} isAdmin search="companies" />
        <NavItem to="/app/admin" label="Plans & Pricing" Icon={Star}   collapsed={collapsed} isAdmin search="plans" />
        <NavItem to="/app/admin" label="Pricing Rules"   Icon={CreditCard} collapsed={collapsed} isAdmin search="pricing" />
      </NavGroup>

      {/* People */}
      <NavGroup id="sa-people" label="People" collapsed={collapsed} defaultOpen>
        <NavItem to="/app/admin" label="All Users"   Icon={UserCog}   collapsed={collapsed} isAdmin search="users" />
        <NavItem to="/app/admin" label="Branches"    Icon={GitBranch} collapsed={collapsed} isAdmin search="branches" />
      </NavGroup>

      {/* POS Activity */}
      <NavGroup id="sa-pos" label="POS Activity" collapsed={collapsed} defaultOpen={false}>
        <NavItem to="/app/admin" label="Sessions"    Icon={Layers}       collapsed={collapsed} isAdmin search="sessions" />
        <NavItem to="/app/admin" label="Terminals"   Icon={Monitor}      collapsed={collapsed} isAdmin search="terminals" />
        <NavItem to="/app/admin" label="Sales"       Icon={Receipt}      collapsed={collapsed} isAdmin search="sales" />
        <NavItem to="/app/admin" label="Payment Methods" Icon={CreditCard} collapsed={collapsed} isAdmin search="payments" />
      </NavGroup>

      {/* Catalog */}
      <NavGroup id="sa-catalog" label="Catalog" collapsed={collapsed} defaultOpen={false}>
        <NavItem to="/app/admin" label="Products"    Icon={Package}   collapsed={collapsed} isAdmin search="products" />
        <NavItem to="/app/admin" label="Inventory"   Icon={Warehouse} collapsed={collapsed} isAdmin search="inventory" />
      </NavGroup>

      {/* CRM */}
      <NavGroup id="sa-crm" label="CRM" collapsed={collapsed} defaultOpen={false}>
        <NavItem to="/app/admin" label="Customers"   Icon={Users}     collapsed={collapsed} isAdmin search="customers" />
      </NavGroup>

    </nav>
  );
}

// ── Tenant Sidebar ────────────────────────────────────────────────────────────

function TenantNav({ collapsed, hasCapability }) {
  return (
    <nav className={['flex-1 overflow-y-auto py-3 space-y-3', collapsed ? 'px-2' : 'px-3'].join(' ')}>

      {hasCapability('dashboard.view') && (
        <NavItem to="/app/dashboard" label="Dashboard" Icon={LayoutDashboard} collapsed={collapsed} />
      )}

      {/* POS */}
      {(hasCapability('sales.view') || hasCapability('returns.view') || hasCapability('shifts.view') || hasCapability('mpesa.view')) && (
        <NavGroup id="pos" label="POS" collapsed={collapsed} defaultOpen>
          {hasCapability('sales.view')   && <NavItem to="/app/sales"   label="Sales"   Icon={Receipt}    collapsed={collapsed} />}
          {hasCapability('returns.view') && <NavItem to="/app/returns" label="Returns" Icon={RotateCcw}  collapsed={collapsed} />}
          {hasCapability('shifts.view')  && <NavItem to="/app/shifts"  label="Shifts"  Icon={Clock}      collapsed={collapsed} />}
          {hasCapability('mpesa.view')   && <NavItem to="/app/mpesa"   label="M-Pesa"  Icon={Smartphone} collapsed={collapsed} />}
        </NavGroup>
      )}

      {/* Inventory */}
      {(hasCapability('products.view') || hasCapability('inventory.view')) && (
        <NavGroup id="inventory" label="Inventory" collapsed={collapsed} defaultOpen>
          {hasCapability('products.view')   && <NavItem to="/app/products"  label="Products"  Icon={Package}   collapsed={collapsed} />}
          {hasCapability('inventory.view')  && <NavItem to="/app/inventory" label="Inventory" Icon={Warehouse} collapsed={collapsed} />}
        </NavGroup>
      )}

      {/* Customers */}
      {hasCapability('customers.view') && (
        <NavItem to="/app/customers" label="Customers" Icon={Users} collapsed={collapsed} />
      )}

      {/* Finance (shown for accountant+ with upgrade lock if no plan) */}
      <FinanceGroup collapsed={collapsed} hasCapability={hasCapability} />

      {/* Reports */}
      {hasCapability('reports.view') && (
        <NavGroup id="reports" label="Reports" collapsed={collapsed} defaultOpen={false}>
          <NavItem to="/app/reports" label="Sales Reports" Icon={BarChart2} collapsed={collapsed} />
        </NavGroup>
      )}

      {/* Administration */}
      {(hasCapability('users.view') || hasCapability('settings.manage')) && (
        <NavGroup id="admin" label="Administration" collapsed={collapsed} defaultOpen={false}>
          {hasCapability('users.view')      && <NavItem to="/app/users"    label="Users & Roles" Icon={UserCog}   collapsed={collapsed} />}
          {hasCapability('settings.manage') && <NavItem to="/app/settings" label="Settings"      Icon={Settings}  collapsed={collapsed} />}
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

  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem('sidebar-collapsed', String(!v));
      return !v;
    });
  };

  return (
    <aside className={[
      'relative flex h-full flex-col bg-primary-900 text-white transition-all duration-200',
      collapsed ? 'w-16' : 'w-56',
    ].join(' ')}>

      {/* Logo + collapse toggle */}
      <div className={[
        'flex items-center border-b border-white/10 flex-shrink-0',
        collapsed ? 'flex-col gap-3 px-0 py-4' : 'justify-between px-4 py-4',
      ].join(' ')}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-500 font-bold text-black text-sm">
            S
          </div>
          {!collapsed && (
            <div>
              <span className="font-semibold text-lg tracking-tight">Statify</span>
              {isSuperAdmin && (
                <span className="block text-xs text-secondary-400 font-medium -mt-0.5">Super Admin</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* POS shortcut — tenant users only */}
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

    </aside>
  );
}
