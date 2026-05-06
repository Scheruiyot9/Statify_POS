import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Barcode, X, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useCartStore } from '@/app/store';
import { formatCurrency } from '@/utils/formatters';
import Spinner from '@/components/ui/Spinner';
import useNetworkStatus from '@/hooks/useNetworkStatus';

function loadProductCache(branchId) {
  try {
    const raw = localStorage.getItem(`pos-products-cache-${branchId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveProductCache(branchId, products) {
  try {
    localStorage.setItem(`pos-products-cache-${branchId}`, JSON.stringify(products));
  } catch {}
}

// Colored avatar fallback for products without an image
const TILE_COLORS = [
  'bg-primary-100 text-primary-700',
  'bg-secondary-100 text-secondary-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

function tileColor(name = '') {
  const code = name.charCodeAt(0) || 0;
  return TILE_COLORS[code % TILE_COLORS.length];
}

// Small square thumb — used in Cart items and hold previews
function ProductThumb({ product, size = 'md' }) {
  const [imgError, setImgError] = useState(false);
  const dim = size === 'sm' ? 'h-9 w-9 text-sm' : 'h-14 w-14 text-xl';
  if (product.image_url && !imgError) {
    return (
      <img
        src={product.image_url}
        alt={product.product_name}
        onError={() => setImgError(true)}
        className={`${dim} rounded-lg object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${dim} rounded-lg flex items-center justify-center font-bold flex-shrink-0 ${tileColor(product.product_name)}`}>
      {product.product_name[0]?.toUpperCase()}
    </div>
  );
}

// Full-width image banner — used inside product grid cards
function ProductCardImage({ product }) {
  const [imgError, setImgError] = useState(false);
  if (product.image_url && !imgError) {
    return (
      <img
        src={product.image_url}
        alt={product.product_name}
        onError={() => setImgError(true)}
        className="w-full h-full object-cover"
      />
    );
  }
  return (
    <div className={`w-full h-full flex items-center justify-center text-3xl font-bold ${tileColor(product.product_name)}`}>
      {product.product_name[0]?.toUpperCase()}
    </div>
  );
}

export { ProductThumb };

export default function ProductGrid({ branchId, expanded = false }) {
  const [search,     setSearch]     = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [scanMode,   setScanMode]   = useState(false);
  const [barcodeVal, setBarcodeVal] = useState('');
  const barcodeRef  = useRef(null);
  const searchRef   = useRef(null);
  const addItem     = useCartStore((s) => s.addItem);
  const cartCount   = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const isOnline    = useNetworkStatus();
  const qc          = useQueryClient();

  const { data: liveProducts, isLoading } = useQuery({
    queryKey: ['pos-products', branchId, search, categoryId],
    queryFn: () =>
      api.get('/pos/products', { params: { branchId, search, categoryId, limit: 200 } })
         .then((r) => r.data.data.products ?? r.data.data),
    enabled: !!branchId && isOnline,
  });

  // Save to cache when we get a fresh unfiltered fetch
  useEffect(() => {
    if (liveProducts && !search && !categoryId && branchId) {
      saveProductCache(branchId, liveProducts);
    }
  }, [liveProducts, search, categoryId, branchId]);

  // Offline fallback: load from cache when offline and no live data
  const products = liveProducts ?? (!isOnline ? loadProductCache(branchId) : undefined);
  const usingCache = !isOnline && !liveProducts && products != null;

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories').then((r) => r.data.data),
  });

  // Auto-focus barcode input when scan mode enabled
  useEffect(() => {
    if (scanMode) barcodeRef.current?.focus();
    else          searchRef.current?.focus();
  }, [scanMode]);

  // Refresh stock counts after a successful scan
  const refreshProducts = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['pos-products', branchId] });
  }, [qc, branchId]);

  const handleBarcodeScan = useCallback((code) => {
    if (!code.trim()) return;
    const exact = (products ?? []).find(
      (p) => p.barcode === code.trim() || p.sku === code.trim()
    );
    if (exact) {
      const outOfStock = exact.track_inventory !== false && parseFloat(exact.quantity_available ?? 0) <= 0;
      if (outOfStock) {
        toast.error(`${exact.product_name} is out of stock`);
      } else {
        addItem(exact, exact.branch_price);
        toast.success(`${exact.product_name} added`, { duration: 1200 });
        refreshProducts(); // update stock badge immediately
      }
    } else {
      // Not in loaded set — fall back to a server search for exact match
      api.get('/pos/products', { params: { branchId, search: code.trim(), limit: 5 } })
        .then((r) => {
          const list = r.data.data.products ?? r.data.data ?? [];
          const match = list.find((p) => p.barcode === code.trim() || p.sku === code.trim());
          if (match) {
            addItem(match, match.branch_price);
            toast.success(`${match.product_name} added`, { duration: 1200 });
            refreshProducts(); // update stock badge immediately
          } else {
            toast.error(`No product found for "${code.trim()}"`, { duration: 2000 });
          }
        })
        .catch(() => toast.error('Barcode lookup failed'));
    }
    setBarcodeVal('');
  }, [products, branchId, addItem, refreshProducts]);

  return (
    <div className="relative flex h-full flex-col bg-white">
      {/* Floating cart item count — visible only when grid is expanded (cart hidden) */}
      {expanded && cartCount > 0 && (
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-secondary-600 px-4 py-2.5 shadow-lg text-white text-sm font-semibold pointer-events-none select-none">
          🛒 {cartCount} item{cartCount !== 1 ? 's' : ''} in cart
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex gap-2 border-b border-gray-100 p-3">
        {scanMode ? (
          /* ── Barcode scan mode ── */
          <div className="relative flex-1">
            <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-500" />
            <input
              ref={barcodeRef}
              type="text"
              placeholder="Scan or type barcode then press Enter…"
              value={barcodeVal}
              onChange={(e) => setBarcodeVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { handleBarcodeScan(barcodeVal); e.preventDefault(); }
              }}
              className="w-full rounded-lg border-2 border-primary-400 py-2 pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-300 bg-primary-50"
            />
          </div>
        ) : (
          /* ── Text search mode ── */
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name, SKU or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Category filter — hidden in scan mode */}
        {!scanMode && (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories?.map((c) => (
              <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
            ))}
          </select>
        )}

        {/* Scan mode toggle */}
        <button
          onClick={() => { setScanMode((v) => !v); setBarcodeVal(''); setSearch(''); }}
          title={scanMode ? 'Switch to search mode' : 'Switch to barcode scan mode'}
          className={[
            'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
            scanMode
              ? 'border-primary-500 bg-primary-500 text-white'
              : 'border-gray-200 text-gray-600 hover:border-primary-300 hover:bg-primary-50',
          ].join(' ')}
        >
          <Barcode className="h-4 w-4" />
          {scanMode ? 'Scan' : 'Scan'}
        </button>
      </div>

      {/* Scan mode hint banner */}
      {scanMode && (
        <div className="bg-primary-50 border-b border-primary-100 px-4 py-1.5 text-xs text-primary-700 flex items-center gap-2">
          <Barcode className="h-3.5 w-3.5 flex-shrink-0" />
          Barcode scan mode active — scan a product or type its barcode/SKU and press Enter
        </div>
      )}

      {/* Offline / cached data banner */}
      {!isOnline && (
        <div className={`border-b px-4 py-1.5 text-xs flex items-center gap-2 ${
          usingCache
            ? 'bg-amber-50 border-amber-100 text-amber-700'
            : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
          {usingCache ? 'Offline — showing cached products' : 'Offline — no cached products available'}
        </div>
      )}

      {/* Product tiles */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center"><Spinner size="lg" /></div>
        ) : (
          <div className={`grid gap-2 ${
            expanded
              ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7'
              : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
          }`}>
            {products?.map((product) => {
              const quantity   = parseFloat(product.quantity_available ?? 0);
              const outOfStock = product.track_inventory !== false && quantity <= 0;
              const lowStock   = !outOfStock && product.track_inventory !== false && quantity < 5;

              return (
                <button
                  key={product.product_id}
                  disabled={outOfStock}
                  onClick={() => addItem(product, product.branch_price)}
                  className={[
                    'group flex flex-col rounded-xl border overflow-hidden text-left transition-all',
                    outOfStock
                      ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50'
                      : 'border-gray-100 bg-white hover:border-primary-300 hover:shadow-md active:scale-95',
                  ].join(' ')}
                >
                  {/* Full-width image */}
                  <div className="w-full aspect-[4/3] overflow-hidden bg-gray-100 flex-shrink-0">
                    <ProductCardImage product={product} />
                  </div>

                  {/* Info */}
                  <div className="p-2 flex flex-col gap-0.5">
                    <p className="line-clamp-2 text-xs font-semibold text-gray-800 group-hover:text-primary-700 leading-snug">
                      {product.product_name}
                    </p>
                    <p className="text-sm font-bold text-secondary-600">
                      {formatCurrency(product.branch_price ?? product.base_price)}
                    </p>
                    {product.quantity_available !== undefined && (
                      <p className={`text-[10px] font-medium ${
                        outOfStock ? 'text-red-500' : lowStock ? 'text-amber-500' : 'text-gray-400'
                      }`}>
                        {outOfStock ? 'Out of stock' : lowStock ? `Low: ${quantity}` : `Stock: ${quantity}`}
                      </p>
                    )}
                    {(product.barcode || product.sku) && (
                      <p className="text-[10px] font-mono text-gray-300 truncate leading-tight">
                        {product.barcode || product.sku}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
            {products?.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-gray-400">No products found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
