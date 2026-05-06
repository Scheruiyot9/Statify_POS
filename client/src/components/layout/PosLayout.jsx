import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/app/store';

export default function PosLayout({ children }) {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Slim POS header */}
      <header className="flex items-center justify-between bg-primary-900 px-4 py-2 text-white shadow-md">
        <div className="flex items-center gap-3">
          <Link
            to="/app/dashboard"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <span className="text-sm font-semibold">Statify POS</span>
        </div>
        <p className="text-xs text-white/70">
          {user?.firstName} {user?.lastName} · <span className="capitalize">{user?.role?.replace('_', ' ')}</span>
        </p>
      </header>

      {/* Full-height POS content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
