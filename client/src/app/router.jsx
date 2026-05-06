import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store';
import { capabilitiesForRole, permissionToCapability } from './permissions';

import LoginPage     from '@/features/auth/LoginPage';
import AppLayout     from '@/components/layout/AppLayout';
import PosLayout     from '@/components/layout/PosLayout';
import DashboardPage from '@/features/dashboard/DashboardPage';
import ProductsPage  from '@/features/products/ProductsPage';
import InventoryPage from '@/features/inventory/InventoryPage';
import CustomersPage from '@/features/customers/CustomersPage';
import SalesPage     from '@/features/sales/SalesPage';
import ReturnsPage   from '@/features/returns/ReturnsPage';
import ShiftsPage    from '@/features/shifts/ShiftsPage';
import ReportsPage   from '@/features/reports/ReportsPage';
import SettingsPage  from '@/features/settings/SettingsPage';
import AdminPage     from '@/features/admin/AdminPage';
import UsersPage     from '@/features/users/UsersPage';
import PosTerminal   from '@/features/pos/PosTerminal';
import MpesaPage     from '@/features/mpesa/MpesaPage';

// Redirect unauthenticated users to /login
const PrivateRoute = ({ children }) => {
  const token = useAuthStore((s) => s.accessToken);
  return token ? children : <Navigate to="/login" replace />;
};

// Redirect already-authenticated users away from login
const PublicRoute = ({ children }) => {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <Navigate to="/app/dashboard" replace /> : children;
};

const CapabilityRoute = ({ children, capability }) => {
  const user = useAuthStore((s) => s.user);
  const roleAllows = capabilitiesForRole(user?.role).has(capability);
  const permissionAllows = (user?.permissions ?? []).some(
    (permission) => permissionToCapability[permission] === capability
  );
  if (!roleAllows && !permissionAllows) return <Navigate to="/app/dashboard" replace />;
  return children;
};

export default function AppRouter() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

      {/* POS Terminal — full-screen, own layout */}
      <Route path="/pos" element={
        <PrivateRoute>
          <CapabilityRoute capability="pos.open">
            <PosLayout><PosTerminal /></PosLayout>
          </CapabilityRoute>
        </PrivateRoute>
      } />

      {/* Back-office app */}
      <Route path="/app" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"  element={<CapabilityRoute capability="dashboard.view"><DashboardPage /></CapabilityRoute>} />
        <Route path="products"   element={<CapabilityRoute capability="products.view"><ProductsPage /></CapabilityRoute>} />
        <Route path="inventory"  element={<CapabilityRoute capability="inventory.view"><InventoryPage /></CapabilityRoute>} />
        <Route path="customers"  element={<CapabilityRoute capability="customers.view"><CustomersPage /></CapabilityRoute>} />
        <Route path="sales"      element={<CapabilityRoute capability="sales.view"><SalesPage /></CapabilityRoute>} />
        <Route path="mpesa"      element={<CapabilityRoute capability="mpesa.view"><MpesaPage /></CapabilityRoute>} />
        <Route path="returns"    element={<CapabilityRoute capability="returns.view"><ReturnsPage /></CapabilityRoute>} />
        <Route path="shifts"     element={
          <CapabilityRoute capability="shifts.view">
            <ShiftsPage />
          </CapabilityRoute>
        } />
        <Route path="reports"    element={<CapabilityRoute capability="reports.view"><ReportsPage /></CapabilityRoute>} />
        <Route path="users"      element={
          <CapabilityRoute capability="users.view">
            <UsersPage />
          </CapabilityRoute>
        } />
        <Route path="settings"   element={<CapabilityRoute capability="settings.manage"><SettingsPage /></CapabilityRoute>} />
        <Route path="admin"      element={
          <CapabilityRoute capability="platform.admin">
            <AdminPage />
          </CapabilityRoute>
        } />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}
