import { useState } from 'react';
import { Trash2, Plus, Minus, UserCircle, Tag, ChevronDown, Gift, Pause } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCartStore, usePosDataStore } from '@/app/store';
import { formatCurrency } from '@/utils/formatters';
import Button from '@/components/ui/Button';
import CustomerSelectModal from './CustomerSelectModal';
import { ProductThumb } from './ProductGrid';

// ── Inline discount editor per cart item ─────────────────────────────────────
function ItemDiscountRow({ item, onClose }) {
  const setItemDiscount = useCartStore((s) => s.setItemDiscount);
  const [type,  setType]  = useState(item.discountType !== 'none' ? item.discountType : 'percent');
  const [value, setValue] = useState(item.discountValue > 0 ? String(item.discountValue) : '');

  const apply = () => {
    if (!value || parseFloat(value) <= 0) {
      setItemDiscount(item.product.product_id, 0, 'none');
    } else {
      setItemDiscount(item.product.product_id, parseFloat(value), type);
    }
    onClose();
  };

  const remove = () => {
    setItemDiscount(item.product.product_id, 0, 'none');
    onClose();
  };

  return (
    <div className="mt-1 rounded-lg border border-primary-100 bg-primary-50 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {['percent', 'fixed'].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2.5 py-1 transition-colors ${type === t ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t === 'percent' ? '%' : 'KES'}
            </button>
          ))}
        </div>
        <input
          type="number"
          min="0"
          max={type === 'percent' ? 100 : undefined}
          step="0.01"
          placeholder={type === 'percent' ? '0 – 100' : '0.00'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={remove}  className="flex-1 rounded-md bg-white border border-gray-200 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">Remove</button>
        <button onClick={apply}   className="flex-1 rounded-md bg-primary-500 py-1 text-xs text-white hover:bg-primary-600 transition-colors">Apply</button>
        <button onClick={onClose} className="flex-1 rounded-md bg-white border border-gray-200 py-1 text-xs text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ── Order-level discount row ──────────────────────────────────────────────────
function OrderDiscountRow({ onClose }) {
  const { orderDiscount, orderDiscountType, setOrderDiscount, clearOrderDiscount } = useCartStore();
  const [type,  setType]  = useState(orderDiscountType);
  const [value, setValue] = useState(orderDiscount > 0 ? String(orderDiscount) : '');

  const apply = () => {
    if (!value || parseFloat(value) <= 0) clearOrderDiscount();
    else setOrderDiscount(parseFloat(value), type);
    onClose();
  };

  return (
    <div className="mx-4 mb-2 rounded-lg border border-secondary-200 bg-secondary-50 p-2 space-y-2">
      <p className="text-xs font-semibold text-secondary-700">Order Discount</p>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {['percent', 'fixed'].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2.5 py-1 transition-colors ${type === t ? 'bg-secondary-500 text-white' : 'bg-white text-gray-600'}`}
            >
              {t === 'percent' ? '%' : 'KES'}
            </button>
          ))}
        </div>
        <input
          type="number" min="0" step="0.01"
          placeholder={type === 'percent' ? '0 – 100' : '0.00'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-secondary-500 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={() => { clearOrderDiscount(); onClose(); }}
          className="flex-1 rounded-md bg-white border border-gray-200 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
          Remove
        </button>
        <button onClick={apply}
          className="flex-1 rounded-md bg-secondary-500 py-1 text-xs text-white hover:bg-secondary-600 transition-colors">
          Apply
        </button>
        <button onClick={onClose}
          className="flex-1 rounded-md bg-white border border-gray-200 py-1 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Inline editable quantity ──────────────────────────────────────────────────
function QtyInput({ item }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n)) updateQuantity(item.product.product_id, n);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number" min="1"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-10 rounded border border-primary-400 px-1 py-0.5 text-center text-sm font-semibold focus:outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(String(item.quantity)); setEditing(true); }}
      title="Click to edit quantity"
      className="w-8 text-center text-sm font-semibold text-gray-800 hover:text-primary-600 transition-colors"
    >
      {item.quantity}
    </button>
  );
}

// ── Hold label dialog ─────────────────────────────────────────────────────────
function HoldDialog({ onConfirm, onCancel }) {
  const [label, setLabel] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Pause className="h-5 w-5 text-primary-600" />
          <p className="text-sm font-bold text-gray-900">Hold Transaction</p>
        </div>
        <input
          type="text"
          autoFocus
          placeholder="Label (optional, e.g. Table 3)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(label); if (e.key === 'Escape') onCancel(); }}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth size="sm" onClick={onCancel}>Cancel</Button>
          <Button fullWidth size="sm" onClick={() => onConfirm(label)}>
            <Pause className="h-3.5 w-3.5 mr-1" />Hold
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Cart ─────────────────────────────────────────────────────────────────
export default function Cart({ onCheckout }) {
  const {
    items, customer, updateQuantity, removeItem, clearCart, totals,
    orderDiscount, orderDiscountType, defaultTax,
  } = useCartStore();
  const { subtotal, tax, itemDiscounts, orderDiscountAmt, total } = totals();

  const holdCart = usePosDataStore((s) => s.holdCart);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [discountItemId,    setDiscountItemId]    = useState(null); // product_id of item being discounted
  const [orderDiscOpen,     setOrderDiscOpen]     = useState(false);
  const [holdDialogOpen,    setHoldDialogOpen]    = useState(false);

  const handleHold = (label) => {
    const snapshot = useCartStore.getState();
    holdCart({
      items:             snapshot.items,
      customer:          snapshot.customer,
      notes:             snapshot.notes,
      orderDiscount:     snapshot.orderDiscount,
      orderDiscountType: snapshot.orderDiscountType,
    }, label);
    clearCart();
    setHoldDialogOpen(false);
    toast.success(label ? `"${label}" held` : 'Cart held');
  };

  const hasDiscount   = (itemDiscounts + orderDiscountAmt) > 0;
  const loyaltyPoints = customer?.loyalty_points_balance ?? 0;

  return (
    <div className="flex h-full flex-col bg-white border-l border-gray-200">

      {/* Customer row */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        <UserCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {customer ? (
            <div>
              <p className="text-sm font-medium text-gray-800 truncate">{customer.customer_name}</p>
              {loyaltyPoints > 0 && (
                <p className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                  <Gift className="h-3 w-3" />
                  {loyaltyPoints.toLocaleString()} pts available
                </p>
              )}
            </div>
          ) : (
            <span className="text-sm text-gray-400">Walk-in customer</span>
          )}
        </div>
        <button
          onClick={() => setCustomerModalOpen(true)}
          className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors flex-shrink-0"
        >
          {customer ? 'Change' : 'Select'}
        </button>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {items.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-400">Cart is empty</p>
        )}

        {items.map((item) => (
          <div key={item.product.product_id}>
            <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 p-2.5 hover:border-gray-200 transition-colors">
              {/* Thumbnail */}
              <ProductThumb product={item.product} size="sm" />

              {/* Name + price */}
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-gray-800 leading-tight">
                  {item.product.product_name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[11px] text-gray-400">{formatCurrency(item.unitPrice)}</p>
                  {item.discount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                      -{formatCurrency(item.discount)}
                    </span>
                  )}
                </div>
              </div>

              {/* Qty controls */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => updateQuantity(item.product.product_id, item.quantity - 1)}
                  className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <Minus className="h-2.5 w-2.5" />
                </button>
                <QtyInput item={item} />
                <button
                  onClick={() => updateQuantity(item.product.product_id, item.quantity + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              </div>

              {/* Line total */}
              <p className="w-20 text-right text-sm font-semibold text-gray-900 flex-shrink-0">
                {formatCurrency(item.lineTotal)}
              </p>

              {/* Discount toggle */}
              <button
                onClick={() => setDiscountItemId(discountItemId === item.product.product_id ? null : item.product.product_id)}
                title="Apply item discount"
                className={`flex-shrink-0 rounded p-1 transition-colors ${
                  item.discount > 0
                    ? 'text-green-600 bg-green-50 hover:bg-green-100'
                    : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
              </button>

              {/* Delete */}
              <button
                onClick={() => removeItem(item.product.product_id)}
                className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Inline discount editor */}
            {discountItemId === item.product.product_id && (
              <ItemDiscountRow item={item} onClose={() => setDiscountItemId(null)} />
            )}
          </div>
        ))}
      </div>

      {/* Order-level discount editor (inline, above totals) */}
      {orderDiscOpen && (
        <OrderDiscountRow onClose={() => setOrderDiscOpen(false)} />
      )}

      {/* Totals */}
      <div className="border-t border-gray-100 px-4 py-3 space-y-1 bg-gray-50">
        {/* Subtotal = gross before item discounts (lineTotal already has item discounts out, so add them back) */}
        <div className="flex justify-between text-xs text-gray-500">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal + itemDiscounts)}</span>
        </div>
        {itemDiscounts > 0 && (
          <div className="flex justify-between text-xs text-green-600">
            <span>Item discounts</span>
            <span>-{formatCurrency(itemDiscounts)}</span>
          </div>
        )}
        {orderDiscountAmt > 0 && (
          <div className="flex justify-between text-xs text-green-600">
            <span>
              Order discount
              {orderDiscountType === 'percent' ? ` (${orderDiscount}%)` : ''}
            </span>
            <span>-{formatCurrency(orderDiscountAmt)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t border-gray-200">
          <span>Total</span>
          <span className="text-secondary-600">{formatCurrency(total)}</span>
        </div>
        {/* VAT is informational — already included in prices, shown below total for transparency */}
        {tax > 0 && (
          <div className="flex justify-between text-[11px] text-gray-400 pt-0.5">
            <span>
              of which {defaultTax?.template_name ?? 'VAT'}
              {defaultTax?.is_inclusive !== false ? ' (incl.)' : ''}
            </span>
            <span>{formatCurrency(tax)}</span>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex gap-2 p-3 border-t border-gray-200">
        <Button variant="secondary" size="sm" onClick={clearCart} disabled={!items.length}>
          Clear
        </Button>
        {/* Hold button */}
        <button
          onClick={() => setHoldDialogOpen(true)}
          disabled={!items.length}
          title="Hold transaction"
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-40 transition-all"
        >
          <Pause className="h-3.5 w-3.5" />
        </button>
        {/* Order discount toggle */}
        <button
          onClick={() => setOrderDiscOpen((v) => !v)}
          disabled={!items.length}
          title="Apply order discount"
          className={[
            'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
            hasDiscount && orderDiscountAmt > 0
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-gray-200 text-gray-500 hover:border-secondary-300 hover:bg-secondary-50 disabled:opacity-40',
          ].join(' ')}
        >
          <Tag className="h-3.5 w-3.5" />
          <ChevronDown className={`h-3 w-3 transition-transform ${orderDiscOpen ? 'rotate-180' : ''}`} />
        </button>
        <Button
          variant="accent"
          fullWidth
          size="sm"
          onClick={onCheckout}
          disabled={!items.length}
          className="text-sm font-semibold"
        >
          Charge {formatCurrency(total)}
        </Button>
      </div>

      {/* Customer select modal */}
      <CustomerSelectModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
      />

      {/* Hold label dialog */}
      {holdDialogOpen && (
        <HoldDialog
          onConfirm={handleHold}
          onCancel={() => setHoldDialogOpen(false)}
        />
      )}
    </div>
  );
}
