import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { usePermission } from '@/hooks/usePermission';

const STATUS_STYLES = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  refunded: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  partial:  'bg-orange-100 text-orange-700',
};

function ReturnDetail({ ret }) {
  if (!ret) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
        <div>
          <p className="font-mono text-sm font-bold text-gray-800">{ret.return_number}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(ret.return_date)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[ret.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {ret.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div><span className="text-gray-500">Original TXN: </span>
          <span className="font-mono font-medium text-primary-700">{ret.original_transaction_number}</span></div>
        <div><span className="text-gray-500">Branch: </span><span className="font-medium">{ret.branch_name}</span></div>
        <div><span className="text-gray-500">Processed by: </span><span className="font-medium">{ret.processed_by}</span></div>
        {ret.approved_by && <div><span className="text-gray-500">Approved by: </span><span className="font-medium">{ret.approved_by}</span></div>}
      </div>

      {ret.customer_notes && (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Customer note: </span>{ret.customer_notes}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Returned Items</p>
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Qty</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Refund</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Restock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ret.items?.map((item, i) => (
                <tr key={item.return_item_id ?? i}>
                  <td className="px-3 py-2 font-medium text-gray-800">{item.product_name}</td>
                  <td className="px-3 py-2 text-right">{parseFloat(item.quantity_returned)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.line_refund_amount)}</td>
                  <td className="px-3 py-2 text-center">
                    {item.return_to_inventory
                      ? <span className="text-green-600 text-xs font-medium">Yes</span>
                      : <span className="text-red-400 text-xs">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-1 text-sm border-t border-gray-100 pt-3">
        <div className="flex justify-between font-bold text-base">
          <span>Total Refunded</span>
          <span className="text-secondary-600">{formatCurrency(ret.total_refunded)}</span>
        </div>
      </div>

      {ret.refunds?.length > 0 && (
        <div className="text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Refund Method</p>
          {ret.refunds.map((r, i) => (
            <div key={r.refund_id ?? i} className="flex justify-between text-gray-700 py-0.5">
              <span>{r.method_name}{r.reference_number && <span className="text-gray-400 text-xs ml-2">#{r.reference_number}</span>}</span>
              <span className="font-medium">{formatCurrency(r.amount_refunded)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalForm({ label, actionLabel, variant = 'primary', onConfirm, onClose }) {
  const [notes, setNotes] = useState('');
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button variant={variant} fullWidth onClick={() => onConfirm(notes)}>{actionLabel}</Button>
      </div>
    </div>
  );
}

export default function ReturnsPage() {
  const qc = useQueryClient();
  const { hasCapability } = usePermission();
  const canProcess = hasCapability('returns.view');

  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget,  setRejectTarget]  = useState(null);

  const filters = { search, status, startDate, endDate, page, limit: 25 };

  const { data, isLoading } = useQuery({
    queryKey: ['returns', filters],
    queryFn: () => api.get('/returns', { params: filters }).then((r) => r.data.data),
    keepPreviousData: true,
  });

  const { data: retDetail } = useQuery({
    queryKey: ['return-detail', selected],
    queryFn: () => api.get(`/returns/${selected}`).then((r) => r.data.data),
    enabled: !!selected,
  });

  const approveMut = useMutation({
    mutationFn: ({ id, notes }) => api.patch(`/returns/${id}/approve`, { approvalNotes: notes }),
    onSuccess: () => {
      toast.success('Return approved');
      qc.invalidateQueries(['returns']);
      qc.invalidateQueries(['return-detail', approveTarget]);
      setApproveTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to approve'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, notes }) => api.patch(`/returns/${id}/reject`, { rejectionNotes: notes }),
    onSuccess: () => {
      toast.success('Return rejected');
      qc.invalidateQueries(['returns']);
      qc.invalidateQueries(['return-detail', rejectTarget]);
      setRejectTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reject'),
  });

  const returns = data?.returns ?? [];
  const total   = data?.total   ?? 0;
  const pages   = data?.pages   ?? 1;

  const selectedRet = retDetail;
  const isPending   = selectedRet?.status === 'pending';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Returns</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} return{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by RTN# or TXN#…"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="refunded">Refunded</option>
          <option value="rejected">Rejected</option>
        </select>
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
        <span className="flex items-center text-gray-400 text-sm">to</span>
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
        {(search || status || startDate || endDate) && (
          <button onClick={() => { setSearch(''); setStatus(''); setStartDate(''); setEndDate(''); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {isLoading ? <PageSpinner /> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">RTN #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Original TXN</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Branch</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Processed By</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Refunded</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {returns.map((r) => (
                <tr key={r.return_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-primary-600 font-semibold">{r.return_number}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDateTime(r.return_date)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.original_transaction_number}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{r.branch_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.processed_by}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(r.total_refunded)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(r.return_id)}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600 transition-colors">
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {returns.length === 0 && (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400">
                  <RotateCcw className="mx-auto mb-2 h-8 w-8 opacity-30" />No returns found
                </td></tr>
              )}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">Page {page} of {pages} ({total} total)</p>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">← Prev</button>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-md border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!selected && !approveTarget && !rejectTarget}
        onClose={() => setSelected(null)}
        title="Return Details"
        size="lg"
        footer={isPending && canProcess ? (
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth icon={<XCircle className="h-4 w-4 text-red-500" />}
              onClick={() => setRejectTarget(selected)}>
              Reject
            </Button>
            <Button fullWidth icon={<CheckCircle className="h-4 w-4" />}
              onClick={() => setApproveTarget(selected)}>
              Approve
            </Button>
          </div>
        ) : null}
      >
        <ReturnDetail ret={selectedRet} />
      </Modal>

      <Modal open={!!approveTarget} onClose={() => setApproveTarget(null)} title="Approve Return" size="sm">
        <ApprovalForm
          label="Approval notes (optional)"
          actionLabel="Approve"
          onClose={() => setApproveTarget(null)}
          onConfirm={(notes) => approveMut.mutate({ id: approveTarget, notes })}
        />
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Return" size="sm">
        <ApprovalForm
          label="Rejection reason"
          actionLabel="Reject"
          variant="secondary"
          onClose={() => setRejectTarget(null)}
          onConfirm={(notes) => rejectMut.mutate({ id: rejectTarget, notes })}
        />
      </Modal>
    </div>
  );
}
