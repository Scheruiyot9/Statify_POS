import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, Warehouse, Users, Receipt,
  BarChart2, Settings, ShieldCheck, Monitor, UserCog, Clock,
  RotateCcw, ChevronLeft, ChevronRight, Smartphone,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';

const NAV = [
  { to: '/app/dashboard', label: 'Dashboard', Icon: LayoutDashboard, capability: 'dashboard.view' },
  { to: '/app/products', label: 'Products', Icon: Package, capability: 'products.view' },
  { to: '/app/inventory', label: 'Inventory', Icon: Warehouse, capability: 'inventory.view' },
  { to: '/app/customers', label: 'Customers', Icon: Users, capability: 'customers.view' },
  { to: '/app/sales',    label: 'Sales',    Icon: Receipt,    capability: 'sales.view' },
  { to: '/app/mpesa',   label: 'M-Pesa',   Icon: Smartphone, capability: 'mpesa.view' },
  { to: '/app/returns',  label: 'Returns',  Icon: RotateCcw,  capability: 'returns.view' },
  { to: '/app/shifts',   label: 'Shifts',   Icon: Clock,      capability: 'shifts.view' },
  { to: '/app/reports', label: 'Reports', Icon: BarChart2, capability: 'reports.view' },
  { to: '/app/users', label: 'Users', Icon: UserCog, capability: 'users.view' },
  { to: '/app/settings', label: 'Settings', Icon: Settings, capability: 'settings.manage' },
  { to: '/app/admin', label: 'Admin', Icon: ShieldCheck, capability: 'platform.admin' },
];

export default function Sidebar() {
  const { hasCapability } = usePermission();

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
        'flex items-center border-b border-white/10',
        collapsed ? 'flex-col gap-3 px-0 py-4' : 'justify-between px-4 py-4',
      ].join(' ')}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-500 font-bold text-black text-sm">
            S
          </div>
          {!collapsed && <span className="font-semibold text-lg tracking-tight">Statify</span>}
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

      {/* POS shortcut */}
      {hasCapability('pos.open') && (
        <div className={['pt-4', collapsed ? 'px-2' : 'px-3'].join(' ')}>
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
      <nav className={['flex-1 overflow-y-auto py-4 space-y-1', collapsed ? 'px-2' : 'px-3'].join(' ')}>
        {NAV.filter((item) => hasCapability(item.capability)).map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) => [
              'flex items-center rounded-lg text-sm font-medium transition-colors',
              collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
              isActive
                ? 'bg-secondary-500/20 text-secondary-400 font-semibold'
                : 'text-white/70 hover:bg-white/10 hover:text-white',
            ].join(' ')}
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-secondary-400' : ''}`} />
                {!collapsed && label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </aside>
  );
}
