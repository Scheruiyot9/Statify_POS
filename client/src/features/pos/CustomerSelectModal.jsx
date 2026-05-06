import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserCircle, Gift, Phone, X, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuthStore, useCartStore } from '@/app/store';
import { formatCurrency } from '@/utils/formatters';
import Button from '@/components/ui/Button';

export default function CustomerSelectModal({ open, onClose }) {
  const companyId    = useAuthStore((s) => s.user?.companyId);
  const setCustomer  = useCartStore((s) => s.setCustomer);
  const currentCust  = useCartStore((s) => s.customer);

  const [search,    setSearch]    = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [quickCreate, setQuickCreate] = useState(false);
  const [form,      setForm]      = useState({ customer_name: '', phone: '', email: '' });

  const searchRef = useRef(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-focus search on open
  useEffect(() => {
    if (open) {
      setSearch('');
      setDebouncedSearch('');
      setQuickCreate(false);
      setForm({ customer_name: '', phone: '', email: '' });
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open]);

  const { data: result, isFetching } = useQuery({
    queryKey: ['customers-search', debouncedSearch],
    queryFn:  () =>
      api.get('/customers', { params: { search: debouncedSearch, limit: 10 } })
         .then((r) => r.data.data),
    enabled: open && debouncedSearch.length >= 1,
    staleTime: 30_000,
  });

  const customers = result?.customers ?? [];

  const qc = useQueryClient();
  const { mutate: createCustomer, isPending: creating } = useMutation({
    mutationFn: (data) => api.post('/customers', data),
    onSuccess: (res) => {
      const customer = res.data.data;
      setCustomer(customer);
      qc.invalidateQueries({ queryKey: ['customers-search'] });
      toast.success(`${customer.customer_name} added`);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not create customer'),
  });

  const select = (customer) => {
    setCustomer(customer);
    onClose();
  };

  const clearCustomer = () => {
    setCustomer(null);
    onClose();
  };

  const handleCreate = () => {
    if (!form.customer_name.trim()) {
      toast.error('Name is required');
      return;
    }
    createCustomer({
      customer_name: form.customer_name.trim(),
      phone:         form.phone.trim() || undefined,
      email:         form.email.trim() || undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Select Customer</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Walk-in option */}
          <button
            onClick={clearCustomer}
            className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary-300 hover:bg-primary-50 ${
              !currentCust ? 'border-primary-400 bg-primary-50' : 'border-gray-100'
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
              <UserCircle className="h-5 w-5 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Walk-in Customer</p>
              <p className="text-xs text-gray-400">No loyalty points, no record</p>
            </div>
          </button>

          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name, phone or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Customer list */}
          {debouncedSearch.length >= 1 && (
            <div className="space-y-1.5">
              {isFetching && !customers.length && (
                <p className="py-4 text-center text-xs text-gray-400">Searching…</p>
              )}
              {!isFetching && customers.length === 0 && (
                <p className="py-3 text-center text-xs text-gray-400">No customers found for "{debouncedSearch}"</p>
              )}
              {customers.map((c) => (
                <button
                  key={c.customer_id}
                  onClick={() => select(c)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary-300 hover:bg-primary-50 ${
                    currentCust?.customer_id === c.customer_id ? 'border-primary-400 bg-primary-50' : 'border-gray-100'
                  }`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold text-sm flex-shrink-0">
                    {c.customer_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.customer_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.phone && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </span>
                      )}
                      {c.loyalty_points_balance > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                          <Gift className="h-3 w-3" />
                          {c.loyalty_points_balance.toLocaleString()} pts
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">{c.purchase_count} sales</p>
                    {c.total_spent > 0 && (
                      <p className="text-xs font-medium text-gray-600">{formatCurrency(c.total_spent)}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Quick create form toggle */}
          <button
            onClick={() => setQuickCreate((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-200 p-3 text-sm text-gray-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 transition-all"
          >
            <UserPlus className="h-4 w-4" />
            {quickCreate ? 'Cancel new customer' : 'Create new customer'}
          </button>

          {/* Quick create form */}
          {quickCreate && (
            <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary-800">New Customer</p>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Full name *"
                  value={form.customer_name}
                  onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                  autoFocus
                />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                />
              </div>
              <Button
                fullWidth size="sm"
                loading={creating}
                disabled={!form.customer_name.trim()}
                onClick={handleCreate}
              >
                Create &amp; Select
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <Button variant="secondary" fullWidth onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
