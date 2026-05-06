import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Monitor, X, CheckCircle, BarChart2, Pause, WifiOff, Wifi, Maximize2, Minimize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuthStore, useCartStore, usePosDataStore } from '@/app/store';
import { formatCurrency } from '@/utils/formatters';
import ProductGrid        from './ProductGrid';
import Cart               from './Cart';
import PaymentModal       from './PaymentModal';
import HoldModal          from './HoldModal';
import OfflineQueueModal  from './OfflineQueueModal';
import Button             from '@/components/ui/Button';
import { PageSpinner }    from '@/components/ui/Spinner';
import useNetworkStatus   from '@/hooks/useNetworkStatus';
import ReceiptModal       from '@/components/ui/ReceiptModal';

// ── Open Session Screen ───────────────────────────────────────────────────────
function OpenSessionScreen({ branchId, onSessionOpened }) {
  const [terminalId,    setTerminalId]    = useState('');
  const [openingAmount, setOpeningAmount] = useState('');
  const [notes,         setNotes]         = useState('');
  const [pmAmounts,     setPmAmounts]     = useState({});

  const { data: terminals = [], isPending: terminalsLoading } = useQuery({
    queryKey: ['pos-terminals', branchId],
    queryFn:  () => api.get('/pos/terminals', { params: { branchId } }).then((r) => r.data.data),
    enabled:  !!branchId,
  });

  const { data: payMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn:  () => api.get('/pos/payment-methods').then((r) => r.data.data),
  });

  const nonCashMethods = payMethods.filter((m) => m.method_name !== 'Cash');

  useEffect(() => {
    if (terminals.length && !terminalId) setTerminalId(String(terminals[0].terminal_id));
  }, [terminals, terminalId]);

  const { mutate: open, isPending } = useMutation({
    mutationFn: (data) => api.post('/pos/sessions', data),
    onSuccess:  (res)  => {
      toast.success('Session opened!');
      onSessionOpened(res.data.data);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not open session'),
  });

  if (terminalsLoading) return <PageSpinner />;

  const payModeAmounts = nonCashMethods
    .filter((m) => parseFloat(pmAmounts[m.payment_method_id]) > 0)
    .map((m) => ({ paymentMethodId: m.payment_method_id, amount: parseFloat(pmAmounts[m.payment_method_id]) }));

  return (
    <div className="flex h-full items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100">
            <Monitor className="h-7 w-7 text-primary-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Open POS Session</h2>
          <p className="mt-1 text-sm text-gray-500">Select a terminal and count your opening float</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Terminal</label>
            <select
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Select terminal…</option>
              {terminals.map((t) => (
                <option key={t.terminal_id} value={t.terminal_id}>
                  {t.terminal_name} ({t.terminal_code})
                </option>
              ))}
            </select>
          </div>

          {/* Opening amounts per pay mode */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening Amounts</p>
            </div>
            <div className="divide-y divide-gray-50">
              {/* Cash always first */}
              <div className="flex items-center justify-between px-4 py-3">
                <label className="text-sm font-medium text-gray-800">Cash Float</label>
                <input
                  type="number" step="0.01" min="0"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm font-semibold focus:border-primary-500 focus:outline-none"
                />
              </div>
              {/* Non-cash methods */}
              {nonCashMethods.map((m) => (
                <div key={m.payment_method_id} className="flex items-center justify-between px-4 py-3">
                  <label className="text-sm font-medium text-gray-800">{m.method_name}</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={pmAmounts[m.payment_method_id] ?? ''}
                    onChange={(e) => setPmAmounts((prev) => ({ ...prev, [m.payment_method_id]: e.target.value }))}
                    placeholder="0.00"
                    className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm font-semibold focus:border-primary-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any opening notes…"
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <Button
            fullWidth size="lg" loading={isPending}
            disabled={!terminalId}
            onClick={() => open({
              branchId,
              terminalId,
              openingCashAmount: parseFloat(openingAmount) || 0,
              openingNotes: notes || null,
              payModeAmounts,
            })}
          >
            Open Session
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Shift Summary Modal ───────────────────────────────────────────────────────
function ShiftSummaryModal({ session, onClose }) {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['session-summary', session.session_id],
    queryFn:  () => api.get(`/pos/sessions/${session.session_id}/summary`).then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  const openingFloat = parseFloat(session.opening_cash_amount) || 0;
  const breakdown    = summary?.payment_breakdown ?? [];
  const cashMethod   = breakdown.find((p) => p.method_name === 'Cash');
  const cashSales    = parseFloat(cashMethod?.total) || 0;
  const expectedCash = openingFloat + cashSales;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Shift Summary</h2>
            <p className="text-sm text-gray-500">{session.terminal_name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : (
            <>
              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-primary-50 p-3 text-center">
                  <p className="text-xs text-gray-500">Transactions</p>
                  <p className="text-2xl font-bold text-primary-700">{summary?.txn_count ?? 0}</p>
                </div>
                <div className="rounded-xl bg-green-50 p-3 text-center">
                  <p className="text-xs text-gray-500">Total Sales</p>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(summary?.total_sales ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-secondary-50 p-3 text-center">
                  <p className="text-xs text-gray-500">Opening Float</p>
                  <p className="text-lg font-bold text-secondary-700">{formatCurrency(openingFloat)}</p>
                </div>
              </div>

              {/* Per-payment-method breakdown */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Payment Method Breakdown</h3>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Method</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Opening</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Sales</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Expected Total</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">Txns</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {/* Cash row */}
                      <tr className="bg-amber-50/40">
                        <td className="px-4 py-3 font-medium text-gray-800">Cash</td>
                        <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(openingFloat)}</td>
                        <td className="px-4 py-3 text-right text-green-700 font-medium">{formatCurrency(cashSales)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(expectedCash)}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{cashMethod?.count ?? 0}</td>
                      </tr>
                      {/* Other methods */}
                      {breakdown.filter((p) => p.method_name !== 'Cash').map((p) => (
                        <tr key={p.method_name}>
                          <td className="px-4 py-3 font-medium text-gray-800">{p.method_name}</td>
                          <td className="px-4 py-3 text-right text-gray-400">—</td>
                          <td className="px-4 py-3 text-right text-green-700 font-medium">{formatCurrency(p.total)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(p.total)}</td>
                          <td className="px-4 py-3 text-center text-gray-500">{p.count}</td>
                        </tr>
                      ))}
                      {/* Total row */}
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-700">{formatCurrency(openingFloat)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(summary?.total_sales ?? 0)}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(openingFloat + (summary?.total_sales ?? 0))}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700">{summary?.txn_count ?? 0}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-4">
          <Button variant="secondary" fullWidth onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── Close Session Modal ───────────────────────────────────────────────────────
function CloseSessionModal({ session, onClose, onClosed }) {
  const [closingAmount, setClosingAmount] = useState('');
  const [notes,         setNotes]         = useState('');
  const [pmClosing,     setPmClosing]     = useState({});

  const { data: summary } = useQuery({
    queryKey: ['session-summary', session.session_id],
    queryFn:  () => api.get(`/pos/sessions/${session.session_id}/summary`).then((r) => r.data.data),
  });

  const { mutate: close, isPending } = useMutation({
    mutationFn: (data) => api.patch(`/pos/sessions/${session.session_id}/close`, data),
    onSuccess: (res) => {
      const v = parseFloat(res.data.data.cash_variance);
      if (Math.abs(v) < 0.5) {
        toast.success('Session closed. Cash balanced!');
      } else {
        toast(
          v > 0
            ? `Session closed. Cash over by ${formatCurrency(v)}`
            : `Session closed. Cash short by ${formatCurrency(Math.abs(v))}`,
          { icon: v > 0 ? '💰' : '⚠️' }
        );
      }
      onClosed();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not close session'),
  });

  const openingFloat   = parseFloat(session.opening_cash_amount) || 0;
  const breakdown      = summary?.payment_breakdown ?? [];
  const cashMethod     = breakdown.find((p) => p.method_name === 'Cash');
  const cashSales      = parseFloat(cashMethod?.total) || 0;
  const expectedCash   = openingFloat + cashSales;
  const closingCounted = parseFloat(closingAmount) || 0;
  const variance       = closingAmount !== '' ? closingCounted - expectedCash : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Close Session</h2>
          <p className="text-sm text-gray-500">{session.terminal_name}</p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto space-y-5 p-6">
          {/* Summary stats */}
          {summary && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-500">Transactions</p>
                <p className="text-2xl font-bold text-gray-900">{summary.txn_count}</p>
              </div>
              <div className="rounded-xl bg-green-50 p-3 text-center">
                <p className="text-xs text-gray-500">Total Sales</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(summary.total_sales)}</p>
              </div>
            </div>
          )}

          {/* Per-payment-method closing table */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Balance by Payment Method</h3>
            <div className="rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Method</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Opening</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Sales</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Expected</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Closing Count</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {/* Cash row */}
                  <tr className="bg-amber-50/30">
                    <td className="px-4 py-3 font-medium text-gray-800">Cash</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(openingFloat)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatCurrency(cashSales)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(expectedCash)}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number" step="0.01" min="0"
                        value={closingAmount}
                        onChange={(e) => setClosingAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm font-semibold focus:border-primary-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {variance !== null ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          Math.abs(variance) < 0.5 ? 'bg-green-100 text-green-700' :
                          variance > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {Math.abs(variance) < 0.5 ? '✓ Balanced' :
                           variance > 0 ? `+${formatCurrency(variance)}` : formatCurrency(variance)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Other methods — count entered manually */}
                  {breakdown.filter((p) => p.method_name !== 'Cash').map((p) => {
                    const counted  = parseFloat(pmClosing[p.method_name] ?? '') || null;
                    const pmVar    = counted !== null ? counted - p.total : null;
                    return (
                      <tr key={p.method_name}>
                        <td className="px-4 py-3 font-medium text-gray-800">{p.method_name}</td>
                        <td className="px-4 py-3 text-right text-gray-400">—</td>
                        <td className="px-4 py-3 text-right text-green-700">{formatCurrency(p.total)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.total)}</td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number" step="0.01" min="0"
                            value={pmClosing[p.method_name] ?? ''}
                            onChange={(e) => setPmClosing((prev) => ({ ...prev, [p.method_name]: e.target.value }))}
                            placeholder="0.00"
                            className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm font-semibold focus:border-primary-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {pmVar !== null ? (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              Math.abs(pmVar) < 0.5 ? 'bg-green-100 text-green-700' :
                              pmVar > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {Math.abs(pmVar) < 0.5 ? '✓ Balanced' : pmVar > 0 ? `+${formatCurrency(pmVar)}` : formatCurrency(pmVar)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">Card and mobile transactions auto-reconcile via bank records.</p>
          </div>

          {/* Overall variance summary */}
          {variance !== null && Math.abs(variance) >= 0.5 && (
            <div className={`flex items-center gap-3 rounded-xl p-4 ${
              variance > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-red-50 border border-red-200'
            }`}>
              <CheckCircle className={`h-5 w-5 flex-shrink-0 ${variance > 0 ? 'text-blue-500' : 'text-red-500'}`} />
              <div>
                <p className={`text-sm font-semibold ${variance > 0 ? 'text-blue-800' : 'text-red-800'}`}>
                  Cash {variance > 0 ? 'Over' : 'Short'}: {formatCurrency(Math.abs(variance))}
                </p>
                <p className="text-xs text-gray-500">Expected {formatCurrency(expectedCash)} · Counted {formatCurrency(closingCounted)}</p>
              </div>
            </div>
          )}
          {variance !== null && Math.abs(variance) < 0.5 && (
            <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 p-4">
              <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-500" />
              <p className="text-sm font-semibold text-green-800">Cash balanced!</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Closing Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any notes for this shift…"
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button
            variant="danger" fullWidth loading={isPending}
            disabled={closingAmount === ''}
            onClick={() => {
              const closingPayModeAmounts = breakdown
                .filter((p) => p.method_name !== 'Cash' && pmClosing[p.method_name] !== undefined)
                .map((p) => ({ paymentMethodId: p.payment_method_id, amount: parseFloat(pmClosing[p.method_name]) || 0 }));
              close({
                closingCashCounted: closingCounted,
                closingNotes: notes || null,
                closingPayModeAmounts,
              });
            }}
          >
            Close Session
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main POS Terminal ─────────────────────────────────────────────────────────
export default function PosTerminal() {
  const branchId      = useAuthStore((s) => s.user?.branchIds?.[0]);
  const session       = useCartStore((s) => s.session);
  const setSession    = useCartStore((s) => s.setSession);
  const clearCart     = useCartStore((s) => s.clearCart);
  const setDefaultTax = useCartStore((s) => s.setDefaultTax);

  // Fetch and apply the default tax rate for this company
  useQuery({
    queryKey: ['default-tax-rate'],
    queryFn:  () => api.get('/tax-rates/default').then((r) => r.data.data),
    onSuccess: (tax) => setDefaultTax(tax), // null if no default set
    staleTime: 5 * 60 * 1000,
  });

  const holdsCount     = usePosDataStore((s) => s.holds.length);
  const offlineQueue   = usePosDataStore((s) => s.offlineQueue);
  const markSynced     = usePosDataStore((s) => s.markSynced);
  const markFailed     = usePosDataStore((s) => s.markFailed);
  const retryItem      = usePosDataStore((s) => s.retryItem);
  const isOnline       = useNetworkStatus();
  const wasOnlineRef   = useRef(isOnline);
  const [isSyncing,    setIsSyncing]    = useState(false);

  const [checkoutOpen,     setCheckoutOpen]     = useState(false);
  const [closeOpen,        setCloseOpen]        = useState(false);
  const [shiftOpen,        setShiftOpen]        = useState(false);
  const [holdsOpen,        setHoldsOpen]        = useState(false);
  const [queueOpen,        setQueueOpen]        = useState(false);
  const [receiptTxnId,     setReceiptTxnId]     = useState(null);
  const [cartVisible,      setCartVisible]      = useState(true);

  // ── Auto-sync offline queue when connection is restored ───────────────────
  const syncQueue = useCallback(async (queue) => {
    const pending = queue.filter((q) => q.status === 'pending');
    if (!pending.length) return;
    setIsSyncing(true);
    let synced = 0;
    let failed = 0;
    for (const item of pending) {
      try {
        await api.post('/sales/transactions', item.payload);
        markSynced(item.id);
        synced++;
      } catch (err) {
        const msg = err.response?.data?.message || 'Sync failed';
        markFailed(item.id, msg);
        failed++;
      }
    }
    setIsSyncing(false);
    if (synced > 0) toast.success(`${synced} transaction${synced > 1 ? 's' : ''} synced`);
    if (failed > 0) toast.error(`${failed} transaction${failed > 1 ? 's' : ''} failed to sync`);
  }, [markSynced, markFailed]);

  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      // Just came back online
      toast('Back online', { icon: '✅', duration: 2000 });
      const current = usePosDataStore.getState().offlineQueue;
      if (current.some((q) => q.status === 'pending')) syncQueue(current);
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, syncQueue]);

  // On mount / page refresh: restore existing open session if store is empty
  const { isPending: sessionChecking, isFetching: sessionFetching, data: fetchedSession } = useQuery({
    queryKey: ['active-session', branchId],
    queryFn:  () => api.get('/pos/sessions/active', { params: { branchId } }).then((r) => r.data.data),
    enabled:  !!branchId && !session,
    retry:    false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (fetchedSession) setSession(fetchedSession);
  }, [fetchedSession, setSession]);

  const handleSessionOpened = useCallback((newSession) => {
    setSession(newSession);
  }, [setSession]);

  const handleSessionClosed = useCallback(() => {
    clearCart();
    setSession(null);
    setCloseOpen(false);
  }, [clearCart, setSession]);

  const { data: receiptDetail } = useQuery({
    queryKey: ['receipt-detail', receiptTxnId],
    queryFn:  () => api.get(`/sales/transactions/${receiptTxnId}`).then((r) => r.data.data),
    enabled:  !!receiptTxnId,
    staleTime: Infinity,
  });

  const handlePaymentSuccess = useCallback((txn) => {
    setCheckoutOpen(false);
    setSession({
      ...session,
      txn_count:    (session?.txn_count    || 0) + 1,
      session_sales:(session?.session_sales || 0) + (txn?.total_amount || 0),
    });
    // Trigger receipt print/display after sale
    if (txn?.transaction_id) setReceiptTxnId(txn.transaction_id);
  }, [session, setSession]);

  // Show spinner only when we're actively checking for a session on refresh
  const isCheckingSession = !session && sessionChecking && sessionFetching;

  if (!branchId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <Monitor className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-500 font-medium">No branch assigned</p>
          <p className="text-sm text-gray-400 mt-1">Contact your administrator to assign a branch.</p>
        </div>
      </div>
    );
  }

  if (isCheckingSession) return <PageSpinner />;

  if (!session) {
    return <OpenSessionScreen branchId={branchId} onSessionOpened={handleSessionOpened} />;
  }

  const pendingQueueCount = offlineQueue.filter((q) => q.status === 'pending').length;
  const failedQueueCount  = offlineQueue.filter((q) => q.status === 'failed').length;

  return (
    <div className="flex h-full flex-col">
      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center justify-between bg-red-600 px-4 py-1.5 text-white text-xs">
          <div className="flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5" />
            <span className="font-medium">You're offline — payments will be queued for sync</span>
          </div>
          {(pendingQueueCount > 0 || failedQueueCount > 0) && (
            <button
              onClick={() => setQueueOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-0.5 hover:bg-white/30 transition-colors"
            >
              {pendingQueueCount} queued{failedQueueCount > 0 ? `, ${failedQueueCount} failed` : ''}
            </button>
          )}
        </div>
      )}

      {/* Coming back online with pending queue */}
      {isOnline && pendingQueueCount > 0 && (
        <div className="flex items-center justify-between bg-amber-500 px-4 py-1.5 text-white text-xs">
          <div className="flex items-center gap-2">
            <Wifi className="h-3.5 w-3.5" />
            <span className="font-medium">{isSyncing ? 'Syncing offline transactions…' : `${pendingQueueCount} offline transaction${pendingQueueCount > 1 ? 's' : ''} pending sync`}</span>
          </div>
          {!isSyncing && (
            <button
              onClick={() => syncQueue(offlineQueue)}
              className="flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-0.5 hover:bg-white/30 transition-colors"
            >
              Sync now
            </button>
          )}
        </div>
      )}

      {/* Session info bar */}
      <div className="flex items-center justify-between bg-primary-800 px-4 py-1.5 text-white">
        <div className="flex items-center gap-3 text-xs">
          <Monitor className="h-3.5 w-3.5 text-secondary-400" />
          <span className="font-medium text-white/90">{session.terminal_name}</span>
          <span className="text-white/30">|</span>
          <span className="text-white/70">{session.txn_count ?? 0} txn{(session.txn_count ?? 0) !== 1 ? 's' : ''}</span>
          <span className="text-white/30">|</span>
          <span className="font-semibold text-secondary-400">{formatCurrency(session.session_sales ?? 0)}</span>
          <span className="text-white/30">|</span>
          <span className="text-white/60">Float: {formatCurrency(session.opening_cash_amount ?? 0)}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Expand / collapse product grid */}
          <button
            onClick={() => setCartVisible((v) => !v)}
            title={cartVisible ? 'Expand product grid (hide cart)' : 'Show cart'}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {cartVisible
              ? <Maximize2 className="h-3.5 w-3.5" />
              : <Minimize2 className="h-3.5 w-3.5" />}
          </button>
          {/* Holds button */}
          <button
            onClick={() => setHoldsOpen(true)}
            className="relative flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Pause className="h-3.5 w-3.5" />
            Holds
            {holdsCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-gray-900">
                {holdsCount}
              </span>
            )}
          </button>
          {/* Offline queue button (only if there are items) */}
          {offlineQueue.length > 0 && (
            <button
              onClick={() => setQueueOpen(true)}
              className="relative flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <WifiOff className="h-3.5 w-3.5" />
              {failedQueueCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-400 text-[10px] font-bold text-white">
                  {failedQueueCount}
                </span>
              ) : (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-gray-900">
                  {offlineQueue.length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setShiftOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Shift
          </button>
          <button
            onClick={() => setCloseOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/70 transition-colors hover:bg-red-600 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            End Session
          </button>
        </div>
      </div>

      {/* POS main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden">
          <ProductGrid branchId={branchId} expanded={!cartVisible} />
        </div>
        {/* Cart panel — hidden when grid is expanded */}
        <div className={`flex-shrink-0 overflow-hidden transition-all duration-200 ${cartVisible ? 'w-[440px]' : 'w-0'}`}>
          {cartVisible && <Cart onCheckout={() => setCheckoutOpen(true)} />}
        </div>
      </div>

      {/* Modals */}
      <PaymentModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={handlePaymentSuccess}
      />

      <HoldModal
        open={holdsOpen}
        onClose={() => setHoldsOpen(false)}
      />

      <OfflineQueueModal
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        onSyncAll={() => syncQueue(offlineQueue)}
        isSyncing={isSyncing}
      />

      {shiftOpen && (
        <ShiftSummaryModal
          session={session}
          onClose={() => setShiftOpen(false)}
        />
      )}

      {closeOpen && (
        <CloseSessionModal
          session={session}
          onClose={() => setCloseOpen(false)}
          onClosed={handleSessionClosed}
        />
      )}

      <ReceiptModal
        open={!!receiptTxnId}
        onClose={() => setReceiptTxnId(null)}
        txn={receiptDetail}
      />
    </div>
  );
}
