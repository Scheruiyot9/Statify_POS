const { query } = require('../../config/database');
const { isCompanyWide, branchScope } = require('../../shared/roles');

const SALES_DASHBOARD_ROLES = ['super_admin', 'company_admin', 'branch_manager', 'accountant', 'cashier'];
const INVENTORY_DASHBOARD_ROLES = ['super_admin', 'company_admin', 'branch_manager', 'accountant', 'inventory_manager'];

// Platform-level summary when super_admin has no tenant context
async function getPlatformSummary() {
  const [summaryRes, tenantRes] = await Promise.all([
    query(`
      SELECT
        COALESCE(SUM(total_amount) FILTER (WHERE transaction_date::date = CURRENT_DATE), 0)::numeric AS today_sales,
        COUNT(*)                   FILTER (WHERE transaction_date::date = CURRENT_DATE)              AS today_txns,
        COUNT(DISTINCT customer_id) FILTER (WHERE transaction_date::date = CURRENT_DATE AND customer_id IS NOT NULL) AS customers_served
      FROM sales_transactions
      WHERE status = 'completed'
    `),
    query(`
      SELECT COUNT(*) FILTER (WHERE is_active = TRUE) AS active_companies,
             COUNT(*) AS total_companies
      FROM companies
    `),
  ]);

  const s = summaryRes.rows[0];
  const t = tenantRes.rows[0];

  return {
    todaySales:         parseFloat(s.today_sales),
    todayTransactions:  parseInt(s.today_txns),
    customersServed:    parseInt(s.customers_served),
    lowStockCount:      0,
    salesTrend:         [],
    recentTransactions: [],
    topProducts:        [],
    branchComparison:   [],
    platform: {
      activeCompanies: parseInt(t.active_companies),
      totalCompanies:  parseInt(t.total_companies),
    },
  };
}

async function getDashboard(companyId, role, branchIds, { period = '7d' } = {}) {
  if (!companyId) return getPlatformSummary();

  const canViewSales = SALES_DASHBOARD_ROLES.includes(role);
  const canViewInventory = INVENTORY_DASHBOARD_ROLES.includes(role);
  // Trend date range: 7d=6, 30d=29, 90d=89 days back from today
  const trendDays = period === '90d' ? 89 : period === '30d' ? 29 : 6;

  const { clause: bClause, params: bParams } = branchScope(role, companyId, branchIds);
  const allBranches = isCompanyWide(role);

  // Run all queries in parallel for speed
  const [summaryRes, lowStockRes, trendRes, recentRes, topProdsRes, branchRes] = await Promise.all([

    // 1. Today's summary
    query(`
      SELECT
        COALESCE(SUM(total_amount) FILTER (WHERE transaction_date::date = CURRENT_DATE), 0)::numeric AS today_sales,
        COUNT(*)                   FILTER (WHERE transaction_date::date = CURRENT_DATE)              AS today_txns,
        COUNT(DISTINCT customer_id) FILTER (
          WHERE transaction_date::date = CURRENT_DATE AND customer_id IS NOT NULL
        ) AS customers_served
      FROM sales_transactions st
      WHERE st.company_id = $1 AND st.status = 'completed'
      ${bClause}
    `, bParams),

    // 2. Low stock count
    query(`
      SELECT COUNT(DISTINCT pbi.product_id) AS cnt
      FROM product_branch_inventory pbi
      JOIN branches br ON br.branch_id = pbi.branch_id AND br.company_id = $1
        ${allBranches ? '' : 'AND pbi.branch_id = ANY($2)'}
      JOIN products p ON p.product_id = pbi.product_id
        AND p.is_active = TRUE AND p.company_id = $1
      WHERE pbi.reorder_level > 0
        AND pbi.quantity_available <= pbi.reorder_level
    `, bParams),

    // 3. Sales trend — dynamic period, daily rows (frontend groups into week/month)
    query(`
      SELECT
        gs.day::date                                                             AS sale_date,
        COALESCE(SUM(st.total_amount), 0)::numeric                              AS total,
        COALESCE(COUNT(st.transaction_id), 0)::int                              AS txn_count
      FROM generate_series(
        CURRENT_DATE - INTERVAL '${trendDays} days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS gs(day)
      LEFT JOIN sales_transactions st
        ON st.transaction_date::date = gs.day::date
        AND st.company_id = $1
        AND st.status = 'completed'
        ${bClause.replace('AND st.branch_id', 'AND st.branch_id')}
      GROUP BY gs.day
      ORDER BY gs.day
    `, bParams),

    // 4. Recent 10 transactions
    query(`
      SELECT
        st.transaction_id,
        st.transaction_number,
        st.transaction_date,
        st.total_amount::numeric,
        st.status,
        COALESCE(c.customer_name, 'Walk-in')                                    AS customer_name,
        u.first_name || ' ' || u.last_name                                      AS cashier_name,
        b.branch_name,
        (SELECT pm.method_name
           FROM transaction_payments tp
           JOIN payment_methods pm ON pm.payment_method_id = tp.payment_method_id
          WHERE tp.transaction_id = st.transaction_id
          ORDER BY tp.sequence_no
          LIMIT 1)                                                               AS payment_method
      FROM sales_transactions st
      LEFT JOIN customers c ON c.customer_id = st.customer_id
      JOIN users    u ON u.user_id    = st.cashier_user_id
      JOIN branches b ON b.branch_id  = st.branch_id
      WHERE st.company_id = $1 AND st.status = 'completed'
      ${bClause}
      ORDER BY st.transaction_date DESC
      LIMIT 10
    `, bParams),

    // 5. Top 5 products (last 30 days)
    query(`
      SELECT
        p.product_name,
        p.sku,
        SUM(sti.quantity)::numeric   AS qty_sold,
        SUM(sti.line_total)::numeric AS revenue
      FROM sales_transaction_items sti
      JOIN products p ON p.product_id = sti.product_id
      JOIN sales_transactions st ON st.transaction_id = sti.transaction_id
      WHERE st.company_id = $1 AND st.status = 'completed'
        AND st.transaction_date >= CURRENT_DATE - INTERVAL '29 days'
        ${bClause}
      GROUP BY p.product_id, p.product_name, p.sku
      ORDER BY revenue DESC
      LIMIT 5
    `, bParams),

    // 6. Branch comparison (only useful for company-wide roles)
    allBranches
      ? query(`
          SELECT
            b.branch_id,
            b.branch_name,
            b.branch_code,
            COALESCE(SUM(st.total_amount) FILTER (
              WHERE st.transaction_date::date = CURRENT_DATE
            ), 0)::numeric AS today_sales,
            COUNT(st.transaction_id) FILTER (
              WHERE st.transaction_date::date = CURRENT_DATE
            )              AS today_txns,
            COALESCE(SUM(st.total_amount) FILTER (
              WHERE st.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
            ), 0)::numeric AS month_sales
          FROM branches b
          LEFT JOIN sales_transactions st
            ON st.branch_id = b.branch_id AND st.status = 'completed'
          WHERE b.company_id = $1 AND b.is_active = TRUE
          GROUP BY b.branch_id, b.branch_name, b.branch_code
          ORDER BY month_sales DESC
        `, [companyId])
      : Promise.resolve({ rows: [] }),
  ]);

  const s = summaryRes.rows[0];

  return {
    todaySales:        canViewSales ? parseFloat(s.today_sales) : 0,
    todayTransactions: canViewSales ? parseInt(s.today_txns) : 0,
    customersServed:   canViewSales ? parseInt(s.customers_served) : 0,
    lowStockCount:     canViewInventory ? parseInt(lowStockRes.rows[0].cnt) : 0,

    trendDays,
    salesTrend: canViewSales ? trendRes.rows.map((r) => ({
      date:     r.sale_date,
      total:    parseFloat(r.total),
      txnCount: r.txn_count,
    })) : [],

    recentTransactions: canViewSales ? recentRes.rows.map((r) => ({
      transactionId:     r.transaction_id,
      transactionNumber: r.transaction_number,
      transactionDate:   r.transaction_date,
      totalAmount:       parseFloat(r.total_amount),
      status:            r.status,
      customerName:      r.customer_name,
      cashierName:       r.cashier_name,
      branchName:        r.branch_name,
      paymentMethod:     r.payment_method || 'Cash',
    })) : [],

    topProducts: canViewSales ? topProdsRes.rows.map((r) => ({
      productName: r.product_name,
      sku:         r.sku,
      qtySold:     parseFloat(r.qty_sold),
      revenue:     parseFloat(r.revenue),
    })) : [],

    branchComparison: branchRes.rows.map((r) => ({
      branchId:   r.branch_id,
      branchName: r.branch_name,
      branchCode: r.branch_code,
      todaySales: parseFloat(r.today_sales),
      todayTxns:  parseInt(r.today_txns),
      monthSales: parseFloat(r.month_sales),
    })),
  };
}

async function getSalesReport(companyId, role, branchIds, { startDate, endDate, branchId } = {}) {
  const start = startDate || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const end   = endDate   || new Date().toISOString().slice(0, 10);

  let filterParams = [companyId];
  let filterClause = '';

  if (isCompanyWide(role)) {
    if (branchId) { filterParams.push(branchId); filterClause = 'AND st.branch_id = $2'; }
  } else {
    const ids = branchIds?.length ? branchIds : ['00000000-0000-0000-0000-000000000000'];
    filterParams.push(ids);
    filterClause = 'AND st.branch_id = ANY($2)';
  }

  const d1 = filterParams.length + 1;
  const d2 = filterParams.length + 2;
  filterParams.push(start, end);
  const dateFilter = `AND st.transaction_date::date BETWEEN $${d1} AND $${d2}`;

  const [summaryRes, trendRes, topProdsRes, categoriesRes, cashiersRes] = await Promise.all([
    query(`
      SELECT
        COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
        COUNT(*)::int                            AS total_txns,
        COALESCE(AVG(total_amount), 0)::numeric  AS avg_txn,
        COUNT(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL)::int AS unique_customers
      FROM sales_transactions st
      WHERE st.company_id = $1 AND st.status = 'completed' ${filterClause} ${dateFilter}
    `, filterParams),

    query(`
      SELECT gs.day::date AS sale_date,
        COALESCE(SUM(st.total_amount), 0)::numeric AS total,
        COALESCE(COUNT(st.transaction_id), 0)::int AS txn_count
      FROM generate_series($${d1}::date, $${d2}::date, INTERVAL '1 day') gs(day)
      LEFT JOIN sales_transactions st
        ON st.transaction_date::date = gs.day::date
        AND st.company_id = $1 AND st.status = 'completed' ${filterClause}
      GROUP BY gs.day ORDER BY gs.day
    `, filterParams),

    query(`
      SELECT p.product_name, p.sku,
        SUM(sti.quantity)::numeric   AS qty_sold,
        SUM(sti.line_total)::numeric AS revenue
      FROM sales_transaction_items sti
      JOIN products p ON p.product_id = sti.product_id
      JOIN sales_transactions st ON st.transaction_id = sti.transaction_id
      WHERE st.company_id = $1 AND st.status = 'completed' ${filterClause} ${dateFilter}
      GROUP BY p.product_id, p.product_name, p.sku
      ORDER BY revenue DESC LIMIT 10
    `, filterParams),

    query(`
      SELECT COALESCE(pc.category_name, 'Uncategorized') AS category_name,
        SUM(sti.line_total)::numeric AS revenue,
        SUM(sti.quantity)::numeric   AS qty_sold
      FROM sales_transaction_items sti
      JOIN products p ON p.product_id = sti.product_id
      LEFT JOIN categories pc ON pc.category_id = p.category_id
      JOIN sales_transactions st ON st.transaction_id = sti.transaction_id
      WHERE st.company_id = $1 AND st.status = 'completed' ${filterClause} ${dateFilter}
      GROUP BY pc.category_id, pc.category_name
      ORDER BY revenue DESC
    `, filterParams),

    query(`
      SELECT u.first_name || ' ' || u.last_name AS cashier_name,
        COUNT(st.transaction_id)::int AS txn_count,
        SUM(st.total_amount)::numeric AS total_sales,
        AVG(st.total_amount)::numeric AS avg_txn
      FROM sales_transactions st
      JOIN users u ON u.user_id = st.cashier_user_id
      WHERE st.company_id = $1 AND st.status = 'completed' ${filterClause} ${dateFilter}
      GROUP BY st.cashier_user_id, u.first_name, u.last_name
      ORDER BY total_sales DESC
    `, filterParams),
  ]);

  const s = summaryRes.rows[0];
  return {
    period:      { startDate: start, endDate: end },
    summary:     {
      totalSales:      parseFloat(s.total_sales),
      totalTxns:       parseInt(s.total_txns),
      avgTxn:          parseFloat(s.avg_txn),
      uniqueCustomers: parseInt(s.unique_customers),
    },
    trend:       trendRes.rows.map((r) => ({ date: r.sale_date, total: parseFloat(r.total), txnCount: r.txn_count })),
    topProducts: topProdsRes.rows.map((r) => ({ productName: r.product_name, sku: r.sku, qtySold: parseFloat(r.qty_sold), revenue: parseFloat(r.revenue) })),
    categories:  categoriesRes.rows.map((r) => ({ categoryName: r.category_name, revenue: parseFloat(r.revenue), qtySold: parseFloat(r.qty_sold) })),
    cashiers:    cashiersRes.rows.map((r) => ({ cashierName: r.cashier_name, txnCount: parseInt(r.txn_count), totalSales: parseFloat(r.total_sales), avgTxn: parseFloat(r.avg_txn) })),
  };
}

// ── P&L Report ────────────────────────────────────────────────────────────────

async function getPLReport(companyId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const end   = endDate   || new Date().toISOString().slice(0, 10);

  const [revenueRes, returnsRes, cogsRes, paymentBreakRes, expenseRes, expenseBreakRes] = await Promise.all([
    // Gross revenue (VAT-inclusive)
    query(`
      SELECT
        COALESCE(SUM(total_amount), 0)::numeric AS gross_revenue,
        COUNT(*)::int                            AS txn_count,
        COALESCE(SUM(tax_amount), 0)::numeric   AS tax_collected
      FROM sales_transactions
      WHERE company_id = $1 AND status = 'completed'
        AND transaction_date::date BETWEEN $2 AND $3
    `, [companyId, start, end]),

    // Returns / refunds
    query(`
      SELECT COALESCE(SUM(total_refunded), 0)::numeric AS total_returns,
             COUNT(*)::int AS return_count
      FROM returns
      WHERE company_id = $1
        AND status IN ('approved', 'refunded')
        AND return_date::date BETWEEN $2 AND $3
    `, [companyId, start, end]),

    // COGS: qty sold × product cost_price
    query(`
      SELECT COALESCE(SUM(sti.quantity * COALESCE(p.cost_price, 0)), 0)::numeric AS cogs
      FROM sales_transaction_items sti
      JOIN products p ON p.product_id = sti.product_id
      JOIN sales_transactions st ON st.transaction_id = sti.transaction_id
      WHERE st.company_id = $1 AND st.status = 'completed'
        AND st.transaction_date::date BETWEEN $2 AND $3
    `, [companyId, start, end]),

    // Payment method breakdown
    query(`
      SELECT pm.method_name,
             COUNT(DISTINCT st.transaction_id)::int AS txn_count,
             COALESCE(SUM(tp.amount), 0)::numeric   AS amount
      FROM transaction_payments tp
      JOIN payment_methods pm ON pm.payment_method_id = tp.payment_method_id
      JOIN sales_transactions st ON st.transaction_id = tp.transaction_id
      WHERE st.company_id = $1 AND st.status = 'completed'
        AND st.transaction_date::date BETWEEN $2 AND $3
      GROUP BY pm.method_name
      ORDER BY amount DESC
    `, [companyId, start, end]),

    // Operating expenses: supplier payments in period
    query(`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total_expenses,
             COUNT(*)::int AS payment_count
      FROM supplier_payments
      WHERE company_id = $1 AND is_void = FALSE
        AND payment_date BETWEEN $2 AND $3
    `, [companyId, start, end]),

    // Expense breakdown by supplier
    query(`
      SELECT s.supplier_name,
             COALESCE(SUM(sp.amount), 0)::numeric AS amount,
             COUNT(sp.payment_id)::int             AS payment_count
      FROM supplier_payments sp
      JOIN suppliers s ON s.supplier_id = sp.supplier_id
      WHERE sp.company_id = $1 AND sp.is_void = FALSE
        AND sp.payment_date BETWEEN $2 AND $3
      GROUP BY s.supplier_id, s.supplier_name
      ORDER BY amount DESC
      LIMIT 10
    `, [companyId, start, end]),
  ]);

  const grossRevenue        = parseFloat(revenueRes.rows[0].gross_revenue);
  const taxCollected        = parseFloat(revenueRes.rows[0].tax_collected);
  const revenueExVat        = grossRevenue - taxCollected;
  const totalReturns        = parseFloat(returnsRes.rows[0].total_returns);
  const netRevenue          = revenueExVat - totalReturns;
  const cogs                = parseFloat(cogsRes.rows[0].cogs);
  const grossProfit         = netRevenue - cogs;
  const grossMargin         = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const operatingExpenses   = parseFloat(expenseRes.rows[0].total_expenses);
  const operatingProfit     = grossProfit - operatingExpenses;
  const operatingMargin     = netRevenue > 0 ? (operatingProfit / netRevenue) * 100 : 0;

  return {
    period: { startDate: start, endDate: end },
    income: {
      grossRevenue,
      taxCollected,
      revenueExVat,
      totalReturns,
      returnCount: parseInt(returnsRes.rows[0].return_count),
      netRevenue,
      txnCount: parseInt(revenueRes.rows[0].txn_count),
    },
    cogs,
    grossProfit,
    grossMargin: +grossMargin.toFixed(2),
    operatingExpenses,
    operatingProfit,
    operatingMargin: +operatingMargin.toFixed(2),
    expenseBreakdown: expenseBreakRes.rows.map((r) => ({
      supplierName:  r.supplier_name,
      amount:        parseFloat(r.amount),
      paymentCount:  r.payment_count,
    })),
    paymentBreakdown: paymentBreakRes.rows.map((r) => ({
      method:   r.method_name,
      txnCount: r.txn_count,
      amount:   parseFloat(r.amount),
    })),
  };
}

// ── LPO (Purchase Orders) Report ─────────────────────────────────────────────

async function getLPOReport(companyId, { startDate, endDate, supplierId, status, page = 1, limit = 25 } = {}) {
  const start = startDate || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const end   = endDate   || new Date().toISOString().slice(0, 10);
  const pg = parseInt(page, 10);
  const lm = parseInt(limit, 10);

  const conds = ['po.company_id = $1', 'po.order_date BETWEEN $2 AND $3'];
  const vals  = [companyId, start, end];

  if (status)     { vals.push(status);     conds.push(`po.status = $${vals.length}`); }
  if (supplierId) { vals.push(supplierId); conds.push(`po.supplier_id = $${vals.length}`); }

  vals.push(lm, (pg - 1) * lm);

  const { rows: poRows } = await query(`
    SELECT po.po_id, po.po_number, po.order_date, po.expected_date, po.status,
           po.subtotal::numeric, po.tax_amount::numeric, po.total_amount::numeric, po.notes,
           po.created_at, po.approved_at,
           s.supplier_name, s.phone AS supplier_phone, s.email AS supplier_email,
           b.branch_name, b.branch_code,
           u.first_name || ' ' || u.last_name AS created_by,
           a.first_name || ' ' || a.last_name AS approved_by,
           COUNT(*) OVER() AS total_count
    FROM purchase_orders po
    JOIN suppliers s ON s.supplier_id = po.supplier_id
    JOIN branches  b ON b.branch_id   = po.branch_id
    LEFT JOIN users u ON u.user_id = po.created_by_user_id
    LEFT JOIN users a ON a.user_id = po.approved_by_user_id
    WHERE ${conds.join(' AND ')}
    ORDER BY po.order_date DESC, po.po_number DESC
    LIMIT $${vals.length - 1} OFFSET $${vals.length}
  `, vals);

  const total = poRows.length ? parseInt(poRows[0].total_count) : 0;

  let items = [];
  if (poRows.length) {
    const poIds = poRows.map((r) => r.po_id);
    const { rows: itemRows } = await query(`
      SELECT poi.po_id, poi.poi_id,
             poi.quantity_ordered::numeric, poi.quantity_received::numeric,
             poi.unit_cost::numeric, poi.tax_rate::numeric, poi.line_total::numeric,
             poi.description, p.product_name, p.sku
      FROM purchase_order_items poi
      JOIN products p ON p.product_id = poi.product_id
      WHERE poi.po_id = ANY($1)
      ORDER BY poi.poi_id
    `, [poIds]);
    items = itemRows;
  }

  const itemsMap = {};
  for (const i of items) {
    if (!itemsMap[i.po_id]) itemsMap[i.po_id] = [];
    itemsMap[i.po_id].push({
      poiId:            i.poi_id,
      productName:      i.product_name,
      sku:              i.sku,
      description:      i.description,
      quantityOrdered:  parseFloat(i.quantity_ordered),
      quantityReceived: parseFloat(i.quantity_received),
      unitCost:         parseFloat(i.unit_cost),
      taxRate:          parseFloat(i.tax_rate),
      lineTotal:        parseFloat(i.line_total),
    });
  }

  // Summary over whole filtered period (not just current page)
  const { rows: sumRows } = await query(`
    SELECT
      COUNT(*)::int AS total_pos,
      COUNT(*) FILTER (WHERE status = 'draft')::int            AS draft,
      COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'approved')::int         AS approved,
      COUNT(*) FILTER (WHERE status IN ('partially_received','received'))::int AS received,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int        AS cancelled,
      COALESCE(SUM(total_amount), 0)::numeric                  AS total_value,
      COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('cancelled','draft')), 0)::numeric AS active_value
    FROM purchase_orders
    WHERE company_id = $1 AND order_date BETWEEN $2 AND $3
  `, [companyId, start, end]);

  const sum = sumRows[0];
  return {
    period:  { startDate: start, endDate: end },
    summary: {
      totalPos:    sum.total_pos,
      draft:       sum.draft,
      pending:     sum.pending,
      approved:    sum.approved,
      received:    sum.received,
      cancelled:   sum.cancelled,
      totalValue:  parseFloat(sum.total_value),
      activeValue: parseFloat(sum.active_value),
    },
    orders: poRows.map(({ total_count, ...r }) => ({
      poId:          r.po_id,
      poNumber:      r.po_number,
      orderDate:     r.order_date,
      expectedDate:  r.expected_date,
      status:        r.status,
      subtotal:      parseFloat(r.subtotal || 0),
      taxAmount:     parseFloat(r.tax_amount || 0),
      totalAmount:   parseFloat(r.total_amount || 0),
      notes:         r.notes,
      createdAt:     r.created_at,
      approvedAt:    r.approved_at,
      supplierName:  r.supplier_name,
      supplierPhone: r.supplier_phone,
      supplierEmail: r.supplier_email,
      branchName:    r.branch_name,
      branchCode:    r.branch_code,
      createdBy:     r.created_by,
      approvedBy:    r.approved_by,
      items:         itemsMap[r.po_id] ?? [],
    })),
    total, page: pg, limit: lm, pages: Math.ceil(total / lm),
  };
}

// ── GRN Report ────────────────────────────────────────────────────────────────

async function getGRNReport(companyId, { startDate, endDate, supplierId, page = 1, limit = 25 } = {}) {
  const start = startDate || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const end   = endDate   || new Date().toISOString().slice(0, 10);
  const pg = parseInt(page, 10);
  const lm = parseInt(limit, 10);

  const conds = ['g.company_id = $1', 'g.received_date BETWEEN $2 AND $3'];
  const vals  = [companyId, start, end];

  if (supplierId) { vals.push(supplierId); conds.push(`g.supplier_id = $${vals.length}`); }

  vals.push(lm, (pg - 1) * lm);

  const { rows: grnRows } = await query(`
    SELECT g.grn_id, g.grn_number, g.received_date, g.status,
           g.subtotal::numeric, g.total_amount::numeric, g.notes, g.posted_at,
           g.created_at,
           po.po_number,
           s.supplier_name, s.phone AS supplier_phone,
           b.branch_name,
           u.first_name || ' ' || u.last_name AS received_by,
           COUNT(*) OVER() AS total_count
    FROM grns g
    JOIN purchase_orders po ON po.po_id = g.po_id
    JOIN suppliers s  ON s.supplier_id  = g.supplier_id
    JOIN branches  b  ON b.branch_id    = g.branch_id
    LEFT JOIN users u ON u.user_id      = g.received_by_user_id
    WHERE ${conds.join(' AND ')}
    ORDER BY g.received_date DESC, g.grn_number DESC
    LIMIT $${vals.length - 1} OFFSET $${vals.length}
  `, vals);

  const total = grnRows.length ? parseInt(grnRows[0].total_count) : 0;

  let grnItems = [];
  if (grnRows.length) {
    const grnIds = grnRows.map((r) => r.grn_id);
    const { rows: itemRows } = await query(`
      SELECT gi.grn_id, gi.grni_id,
             gi.quantity_received::numeric, gi.unit_cost::numeric, gi.line_total::numeric,
             p.product_name, p.sku
      FROM grn_items gi
      JOIN products p ON p.product_id = gi.product_id
      WHERE gi.grn_id = ANY($1)
      ORDER BY gi.grni_id
    `, [grnIds]);
    grnItems = itemRows;
  }

  const itemsMap = {};
  for (const i of grnItems) {
    if (!itemsMap[i.grn_id]) itemsMap[i.grn_id] = [];
    itemsMap[i.grn_id].push({
      grniId:           i.grni_id,
      productName:      i.product_name,
      sku:              i.sku,
      quantityReceived: parseFloat(i.quantity_received),
      unitCost:         parseFloat(i.unit_cost),
      lineTotal:        parseFloat(i.line_total),
    });
  }

  const { rows: sumRows } = await query(`
    SELECT
      COUNT(*)::int AS total_grns,
      COUNT(*) FILTER (WHERE status = 'posted')::int AS posted,
      COUNT(*) FILTER (WHERE status = 'draft')::int  AS draft,
      COALESCE(SUM(total_amount) FILTER (WHERE status = 'posted'), 0)::numeric AS total_received,
      COALESCE(SUM(total_amount), 0)::numeric AS total_value
    FROM grns
    WHERE company_id = $1 AND received_date BETWEEN $2 AND $3
  `, [companyId, start, end]);

  const sum = sumRows[0];
  return {
    period:  { startDate: start, endDate: end },
    summary: {
      totalGrns:     sum.total_grns,
      posted:        sum.posted,
      draft:         sum.draft,
      totalReceived: parseFloat(sum.total_received),
      totalValue:    parseFloat(sum.total_value),
    },
    grns: grnRows.map(({ total_count, ...r }) => ({
      grnId:        r.grn_id,
      grnNumber:    r.grn_number,
      receivedDate: r.received_date,
      status:       r.status,
      subtotal:     parseFloat(r.subtotal || 0),
      totalAmount:  parseFloat(r.total_amount || 0),
      notes:        r.notes,
      postedAt:     r.posted_at,
      createdAt:    r.created_at,
      poNumber:     r.po_number,
      supplierName: r.supplier_name,
      supplierPhone: r.supplier_phone,
      branchName:   r.branch_name,
      receivedBy:   r.received_by,
      items:        itemsMap[r.grn_id] ?? [],
    })),
    total, page: pg, limit: lm, pages: Math.ceil(total / lm),
  };
}

// ── Trial Balance ─────────────────────────────────────────────────────────────

async function getTrialBalance(companyId, { asOf } = {}) {
  const asOfDate = asOf || new Date().toISOString().slice(0, 10);

  const [
    accountsRes,
    bankRes,
    inventoryRes,
    salesRes,
    returnsRes,
    cogsRes,
    apRes,
    vatRes,
    paymentRes,
  ] = await Promise.all([
    // All accounts for this company
    query(
      `SELECT account_id, account_code, account_name, account_type, account_subtype, is_active
       FROM accounts WHERE company_id = $1 ORDER BY account_code`,
      [companyId]
    ),
    // Bank balances
    query(
      `SELECT COALESCE(SUM(current_balance), 0)::numeric AS total
       FROM bank_accounts WHERE company_id = $1 AND is_active = TRUE`,
      [companyId]
    ),
    // Inventory value
    query(`
      SELECT COALESCE(SUM(pbi.quantity_available * COALESCE(p.cost_price, 0)), 0)::numeric AS total
      FROM product_branch_inventory pbi
      JOIN products p  ON p.product_id  = pbi.product_id AND p.company_id = $1 AND p.is_active = TRUE
      JOIN branches b  ON b.branch_id   = pbi.branch_id  AND b.company_id = $1
      WHERE pbi.quantity_available > 0
    `, [companyId]),
    // Sales revenue (ex-VAT, net of returns)
    query(`
      SELECT
        COALESCE(SUM(total_amount - COALESCE(tax_amount, 0)), 0)::numeric AS revenue,
        COALESCE(SUM(COALESCE(tax_amount, 0)), 0)::numeric                AS vat
      FROM sales_transactions
      WHERE company_id = $1 AND status = 'completed'
        AND transaction_date::date <= $2
    `, [companyId, asOfDate]),
    // Returns (reduce revenue)
    query(`
      SELECT COALESCE(SUM(total_refunded), 0)::numeric AS total
      FROM returns
      WHERE company_id = $1 AND status IN ('approved','refunded')
        AND return_date::date <= $2
    `, [companyId, asOfDate]),
    // COGS
    query(`
      SELECT COALESCE(SUM(sti.quantity * COALESCE(p.cost_price, 0)), 0)::numeric AS total
      FROM sales_transaction_items sti
      JOIN products p ON p.product_id = sti.product_id
      JOIN sales_transactions st ON st.transaction_id = sti.transaction_id
      WHERE st.company_id = $1 AND st.status = 'completed'
        AND st.transaction_date::date <= $2
    `, [companyId, asOfDate]),
    // AP balance
    query(
      `SELECT COALESCE(SUM(current_balance), 0)::numeric AS total
       FROM suppliers WHERE company_id = $1 AND current_balance > 0`,
      [companyId]
    ),
    // VAT payable (gross VAT collected)
    query(`
      SELECT COALESCE(SUM(COALESCE(tax_amount, 0)), 0)::numeric AS total
      FROM sales_transactions
      WHERE company_id = $1 AND status = 'completed'
        AND transaction_date::date <= $2
    `, [companyId, asOfDate]),
    // Supplier payments (cash outflow)
    query(`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total
      FROM supplier_payments
      WHERE company_id = $1 AND is_void = FALSE
        AND payment_date <= $2
    `, [companyId, asOfDate]),
  ]);

  const bankTotal      = parseFloat(bankRes.rows[0].total);
  const inventoryTotal = parseFloat(inventoryRes.rows[0].total);
  const salesRevenue   = parseFloat(salesRes.rows[0].revenue);
  const returnsTotal   = parseFloat(returnsRes.rows[0].total);
  const cogsTotal      = parseFloat(cogsRes.rows[0].total);
  const apTotal        = parseFloat(apRes.rows[0].total);
  const vatTotal       = parseFloat(vatRes.rows[0].total);
  const paymentsTotal  = parseFloat(paymentRes.rows[0].total);
  const netRevenue     = salesRevenue - returnsTotal;

  // Map computed balances to account codes
  const computedBalances = {
    '1010': bankTotal,
    '1200': inventoryTotal,
    '2000': apTotal,
    '2100': vatTotal,
    '4000': netRevenue,
    '5000': cogsTotal,
  };

  const accounts = accountsRes.rows;
  const rows = [];

  for (const acc of accounts) {
    const computed = computedBalances[acc.account_code] ?? null;
    const balance  = computed !== null ? computed : 0;
    const hasData  = computed !== null;

    let debit  = 0;
    let credit = 0;

    if (balance !== 0) {
      const isDebitNormal = ['asset', 'expense'].includes(acc.account_type);
      if (isDebitNormal) {
        debit  = balance > 0 ? balance : 0;
        credit = balance < 0 ? -balance : 0;
      } else {
        credit = balance > 0 ? balance : 0;
        debit  = balance < 0 ? -balance : 0;
      }
    }

    rows.push({
      accountId:   acc.account_id,
      accountCode: acc.account_code,
      accountName: acc.account_name,
      accountType: acc.account_type,
      isActive:    acc.is_active,
      hasData,
      debit,
      credit,
    });
  }

  const totalDebits  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredits = rows.reduce((s, r) => s + r.credit, 0);

  return {
    asOf:        asOfDate,
    rows,
    totalDebits:  +totalDebits.toFixed(2),
    totalCredits: +totalCredits.toFixed(2),
    difference:   +(totalDebits - totalCredits).toFixed(2),
  };
}

// ── Ledger Entries (synthesized from transactions) ────────────────────────────

async function getLedgerEntries(companyId, { accountId, startDate, endDate, page = 1, limit = 50 } = {}) {
  const start = startDate || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const end   = endDate   || new Date().toISOString().slice(0, 10);
  const pg = parseInt(page, 10);
  const lm = parseInt(limit, 10);

  // Resolve account code for the chosen account (if filtering)
  let filterCode = null;
  if (accountId) {
    const { rows: accRows } = await query(
      `SELECT account_code FROM accounts WHERE account_id = $1 AND company_id = $2`,
      [accountId, companyId]
    );
    if (accRows.length) filterCode = accRows[0].account_code;
  }

  // Fetch all accounts for code→id mapping
  const { rows: accMap } = await query(
    `SELECT account_id, account_code, account_name FROM accounts WHERE company_id = $1`,
    [companyId]
  );
  const byCode = {};
  for (const a of accMap) byCode[a.account_code] = a;

  // Helper to get account info by code
  const acct = (code) => byCode[code] || { account_id: null, account_code: code, account_name: code };

  // Build entries from all sources
  const entries = [];

  // 1 — Sales Transactions: DR Cash(1000)/Bank(1010), CR Revenue(4000) + VAT(2100)
  if (!filterCode || ['4000', '2100', '1000', '1010'].includes(filterCode)) {
    const { rows: sales } = await query(`
      SELECT st.transaction_id, st.transaction_number, st.transaction_date,
             (st.total_amount - COALESCE(st.tax_amount, 0))::numeric AS revenue,
             COALESCE(st.tax_amount, 0)::numeric AS vat,
             st.total_amount::numeric AS total,
             COALESCE(c.customer_name, 'Walk-in') AS customer_name
      FROM sales_transactions st
      LEFT JOIN customers c ON c.customer_id = st.customer_id
      WHERE st.company_id = $1 AND st.status = 'completed'
        AND st.transaction_date::date BETWEEN $2 AND $3
      ORDER BY st.transaction_date
    `, [companyId, start, end]);

    for (const s of sales) {
      const desc = `Sale to ${s.customer_name}`;
      const ref  = s.transaction_number;
      const dt   = s.transaction_date;

      // Credit: Sales Revenue
      if (!filterCode || filterCode === '4000') {
        entries.push({ date: dt, reference: ref, description: desc,
          accountCode: '4000', accountName: acct('4000').account_name,
          debit: 0, credit: parseFloat(s.revenue), sourceType: 'sale' });
      }
      // Credit: VAT Payable
      if (parseFloat(s.vat) > 0 && (!filterCode || filterCode === '2100')) {
        entries.push({ date: dt, reference: ref, description: `VAT — ${ref}`,
          accountCode: '2100', accountName: acct('2100').account_name,
          debit: 0, credit: parseFloat(s.vat), sourceType: 'sale_vat' });
      }
      // Debit: Bank (simplified — all cash/bank)
      if (!filterCode || filterCode === '1010') {
        entries.push({ date: dt, reference: ref, description: desc,
          accountCode: '1010', accountName: acct('1010').account_name,
          debit: parseFloat(s.total), credit: 0, sourceType: 'sale_bank' });
      }
    }
  }

  // 2 — GRN Postings: DR Inventory(1200), CR AP(2000)
  if (!filterCode || ['1200', '2000'].includes(filterCode)) {
    const { rows: grns } = await query(`
      SELECT g.grn_id, g.grn_number, g.received_date, g.total_amount::numeric,
             s.supplier_name
      FROM grns g
      JOIN suppliers s ON s.supplier_id = g.supplier_id
      WHERE g.company_id = $1 AND g.status = 'posted'
        AND g.received_date BETWEEN $2 AND $3
      ORDER BY g.received_date
    `, [companyId, start, end]);

    for (const g of grns) {
      const desc = `Goods received from ${g.supplier_name}`;
      const ref  = g.grn_number;
      const dt   = g.received_date;
      const amt  = parseFloat(g.total_amount);

      if (!filterCode || filterCode === '1200') {
        entries.push({ date: dt, reference: ref, description: desc,
          accountCode: '1200', accountName: acct('1200').account_name,
          debit: amt, credit: 0, sourceType: 'grn' });
      }
      if (!filterCode || filterCode === '2000') {
        entries.push({ date: dt, reference: ref, description: `AP: ${g.supplier_name}`,
          accountCode: '2000', accountName: acct('2000').account_name,
          debit: 0, credit: amt, sourceType: 'grn_ap' });
      }
    }
  }

  // 3 — Supplier Payments: DR AP(2000), CR Bank(1010)/Cash(1000)
  if (!filterCode || ['2000', '1010', '1000'].includes(filterCode)) {
    const { rows: pmts } = await query(`
      SELECT sp.payment_id, sp.payment_date, sp.amount::numeric,
             sp.payment_method, sp.reference_number,
             s.supplier_name
      FROM supplier_payments sp
      JOIN suppliers s ON s.supplier_id = sp.supplier_id
      WHERE sp.company_id = $1 AND sp.is_void = FALSE
        AND sp.payment_date BETWEEN $2 AND $3
      ORDER BY sp.payment_date
    `, [companyId, start, end]);

    for (const p of pmts) {
      const desc     = `Payment to ${p.supplier_name}`;
      const ref      = p.reference_number || p.payment_id.slice(0, 8);
      const dt       = p.payment_date;
      const amt      = parseFloat(p.amount);
      const isCash   = ['cash', 'mpesa', 'other'].includes(p.payment_method);
      const bankCode = isCash ? '1000' : '1010';

      if (!filterCode || filterCode === '2000') {
        entries.push({ date: dt, reference: ref, description: desc,
          accountCode: '2000', accountName: acct('2000').account_name,
          debit: amt, credit: 0, sourceType: 'payment_ap' });
      }
      if (!filterCode || filterCode === bankCode) {
        entries.push({ date: dt, reference: ref, description: desc,
          accountCode: bankCode, accountName: acct(bankCode).account_name,
          debit: 0, credit: amt, sourceType: 'payment_bank' });
      }
    }
  }

  // 4 — Returns: DR Revenue(4000), CR Bank(1010)/Cash(1000)
  if (!filterCode || ['4000', '1010', '1000'].includes(filterCode)) {
    const { rows: rets } = await query(`
      SELECT r.return_id, r.return_number, r.return_date, r.total_refunded::numeric
      FROM returns r
      WHERE r.company_id = $1 AND r.status IN ('approved','refunded')
        AND r.return_date::date BETWEEN $2 AND $3
      ORDER BY r.return_date
    `, [companyId, start, end]);

    for (const r of rets) {
      const desc = `Sales return ${r.return_number}`;
      const dt   = r.return_date;
      const amt  = parseFloat(r.total_refunded);

      if (!filterCode || filterCode === '4000') {
        entries.push({ date: dt, reference: r.return_number, description: desc,
          accountCode: '4000', accountName: acct('4000').account_name,
          debit: amt, credit: 0, sourceType: 'return' });
      }
      if (!filterCode || filterCode === '1010') {
        entries.push({ date: dt, reference: r.return_number, description: desc,
          accountCode: '1010', accountName: acct('1010').account_name,
          debit: 0, credit: amt, sourceType: 'return_bank' });
      }
    }
  }

  // Normalise sourceType → display entryType
  const SOURCE_TYPE_MAP = {
    sale:         'SALE',
    sale_vat:     'SALE',
    sale_bank:    'SALE',
    grn:          'GRN',
    grn_ap:       'GRN',
    payment_ap:   'PAYMENT',
    payment_bank: 'PAYMENT',
    return:       'RETURN',
    return_bank:  'RETURN',
  };

  // Sort by date desc, then paginate
  entries.sort((a, b) => {
    const d = new Date(b.date) - new Date(a.date);
    return d !== 0 ? d : a.reference?.localeCompare(b.reference ?? '') ?? 0;
  });

  const totalCount = entries.length;
  const page_entries = entries.slice((pg - 1) * lm, pg * lm);

  // Running balance per account (for current page only)
  const runMap = {};
  for (const e of page_entries) {
    const key = e.accountCode;
    if (!runMap[key]) runMap[key] = 0;
    runMap[key] += e.debit - e.credit;
    e.runningBalance = +runMap[key].toFixed(2);
  }

  // Normalise to frontend-expected field names
  const normalised = page_entries.map((e) => ({
    id:          e.reference,
    entryDate:   e.date instanceof Date ? e.date.toISOString() : e.date,
    entryType:   SOURCE_TYPE_MAP[e.sourceType] ?? e.sourceType?.toUpperCase() ?? 'ENTRY',
    reference:   e.reference,
    accountCode: e.accountCode,
    description: e.description,
    debit:       e.debit,
    credit:      e.credit,
    balance:     e.runningBalance,
  }));

  return {
    period:  { startDate: start, endDate: end },
    entries: normalised,
    total:   totalCount,
    page:    pg,
    limit:   lm,
    pages:   Math.ceil(totalCount / lm),
  };
}

// ── AP Aging ──────────────────────────────────────────────────────────────────

async function getAPAging(companyId) {
  const { rows } = await query(`
    SELECT
      s.supplier_id, s.supplier_name, s.phone, s.email,
      s.current_balance::numeric                AS balance,
      s.payment_terms,
      MIN(g.posted_at)::date                    AS oldest_invoice_date,
      MAX(g.posted_at)::date                    AS latest_invoice_date,
      CURRENT_DATE - MIN(g.posted_at)::date     AS days_outstanding,
      COUNT(g.grn_id)::int                      AS grn_count,
      COALESCE(SUM(g.total_amount), 0)::numeric AS total_invoiced
    FROM suppliers s
    LEFT JOIN grns g ON g.supplier_id = s.supplier_id
      AND g.company_id = $1 AND g.status = 'posted'
    WHERE s.company_id = $1 AND s.current_balance > 0
    GROUP BY s.supplier_id, s.supplier_name, s.phone, s.email, s.current_balance, s.payment_terms
    ORDER BY days_outstanding DESC NULLS LAST
  `, [companyId]);

  const bucket = (days) => {
    if (days === null || days === undefined) return 'current';
    if (days <= 30)  return 'current';
    if (days <= 60)  return '31_60';
    if (days <= 90)  return '61_90';
    return 'over_90';
  };

  const suppliers = rows.map((r) => ({
    supplierId:       r.supplier_id,
    supplierName:     r.supplier_name,
    phone:            r.phone,
    email:            r.email,
    balance:          parseFloat(r.balance),
    paymentTerms:     r.payment_terms,
    daysOutstanding:  r.days_outstanding !== null ? parseInt(r.days_outstanding) : null,
    oldestInvoice:    r.oldest_invoice_date,
    latestInvoice:    r.latest_invoice_date,
    grnCount:         r.grn_count,
    totalInvoiced:    parseFloat(r.total_invoiced),
    bucket:           bucket(r.days_outstanding !== null ? parseInt(r.days_outstanding) : null),
  }));

  const totals = { current: 0, '31_60': 0, '61_90': 0, over_90: 0, total: 0 };
  for (const s of suppliers) {
    totals[s.bucket] += s.balance;
    totals.total     += s.balance;
  }

  return { suppliers, totals };
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────

async function getBalanceSheet(companyId) {
  const [bankRes, inventoryRes, apRes, receivablesRes] = await Promise.all([
    // Bank accounts
    query(`
      SELECT ba.account_name, ba.bank_name, ba.account_number,
             ba.current_balance::numeric AS balance, ba.currency, ba.is_default
      FROM bank_accounts ba
      WHERE ba.company_id = $1 AND ba.is_active = TRUE
      ORDER BY ba.is_default DESC, ba.account_name
    `, [companyId]),

    // Inventory value (qty × cost_price)
    query(`
      SELECT
        COALESCE(SUM(pbi.quantity_available * COALESCE(p.cost_price, 0)), 0)::numeric AS inventory_value,
        SUM(pbi.quantity_available)::numeric AS total_units,
        COUNT(DISTINCT p.product_id)::int AS product_count
      FROM product_branch_inventory pbi
      JOIN products p ON p.product_id = pbi.product_id AND p.company_id = $1 AND p.is_active = TRUE
      JOIN branches b ON b.branch_id = pbi.branch_id AND b.company_id = $1
      WHERE pbi.quantity_available > 0
    `, [companyId]),

    // AP: outstanding supplier balances
    query(`
      SELECT supplier_name, current_balance::numeric AS balance
      FROM suppliers
      WHERE company_id = $1 AND current_balance > 0
      ORDER BY current_balance DESC
    `, [companyId]),

    // AR: nothing tracked yet, so 0
    query(`SELECT 0::numeric AS ar_balance`, []),
  ]);

  const bankAccounts   = bankRes.rows.map((r) => ({ ...r, balance: parseFloat(r.balance) }));
  const totalBankCash  = bankAccounts.reduce((s, r) => s + r.balance, 0);
  const inv            = inventoryRes.rows[0];
  const inventoryValue = parseFloat(inv.inventory_value);
  const apSuppliers    = apRes.rows.map((r) => ({ supplierName: r.supplier_name, balance: parseFloat(r.balance) }));
  const totalAP        = apSuppliers.reduce((s, r) => s + r.balance, 0);

  const totalAssets      = totalBankCash + inventoryValue;
  const totalLiabilities = totalAP;
  const equity           = totalAssets - totalLiabilities;

  return {
    asOf: new Date().toISOString().slice(0, 10),
    assets: {
      cashAndBank: { total: totalBankCash, accounts: bankAccounts },
      inventory:   { total: inventoryValue, totalUnits: parseFloat(inv.total_units || 0), productCount: inv.product_count },
      total:       totalAssets,
    },
    liabilities: {
      accountsPayable: { total: totalAP, suppliers: apSuppliers },
      total:           totalLiabilities,
    },
    equity,
  };
}

// ── Stock Valuation ───────────────────────────────────────────────────────────

async function getStockValuation(companyId, { branchId } = {}) {
  const conds = ['p.company_id = $1', 'p.is_active = TRUE', 'b.company_id = $1', 'pbi.quantity_available > 0'];
  const vals  = [companyId];

  if (branchId) { vals.push(branchId); conds.push(`pbi.branch_id = $${vals.length}`); }

  const { rows } = await query(`
    SELECT
      p.product_id, p.product_name, p.sku, p.unit_of_measure,
      COALESCE(pc.category_name, 'Uncategorized') AS category_name,
      b.branch_name, b.branch_id,
      pbi.quantity_available::numeric AS qty,
      COALESCE(p.cost_price, 0)::numeric AS unit_cost,
      (pbi.quantity_available * COALESCE(p.cost_price, 0))::numeric AS total_value,
      pbi.reorder_level
    FROM product_branch_inventory pbi
    JOIN products p ON p.product_id = pbi.product_id
    JOIN branches b ON b.branch_id  = pbi.branch_id
    LEFT JOIN categories pc ON pc.category_id = p.category_id
    WHERE ${conds.join(' AND ')}
    ORDER BY total_value DESC
  `, vals);

  const items = rows.map((r) => ({
    productId:    r.product_id,
    productName:  r.product_name,
    sku:          r.sku,
    uom:          r.unit_of_measure,
    category:     r.category_name,
    branchName:   r.branch_name,
    branchId:     r.branch_id,
    qty:          parseFloat(r.qty),
    unitCost:     parseFloat(r.unit_cost),
    totalValue:   parseFloat(r.total_value),
    reorderLevel: r.reorder_level,
    belowReorder: parseFloat(r.qty) <= (r.reorder_level || 0),
  }));

  const totalValue = items.reduce((s, i) => s + i.totalValue, 0);
  const totalUnits = items.reduce((s, i) => s + i.qty, 0);

  return { items, totalValue: +totalValue.toFixed(2), totalUnits: +totalUnits.toFixed(3) };
}

// ── Purchases Summary ─────────────────────────────────────────────────────────

async function getPurchasesSummary(companyId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const end   = endDate   || new Date().toISOString().slice(0, 10);

  const [poRes, grnRes, payRes, supplierRes] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int AS total_pos,
        COUNT(*) FILTER (WHERE status='draft')::int            AS draft,
        COUNT(*) FILTER (WHERE status='pending_approval')::int AS pending,
        COUNT(*) FILTER (WHERE status='approved')::int         AS approved,
        COUNT(*) FILTER (WHERE status IN ('partially_received','received'))::int AS received,
        COUNT(*) FILTER (WHERE status='cancelled')::int        AS cancelled,
        COALESCE(SUM(total_amount), 0)::numeric                AS total_value
      FROM purchase_orders
      WHERE company_id = $1 AND order_date BETWEEN $2 AND $3
    `, [companyId, start, end]),

    query(`
      SELECT
        COUNT(*)::int AS total_grns,
        COUNT(*) FILTER (WHERE status='posted')::int AS posted,
        COALESCE(SUM(total_amount) FILTER (WHERE status='posted'), 0)::numeric AS total_received
      FROM grns
      WHERE company_id = $1 AND received_date BETWEEN $2 AND $3
    `, [companyId, start, end]),

    query(`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total_paid,
             COUNT(*)::int AS payment_count
      FROM supplier_payments
      WHERE company_id = $1 AND payment_date BETWEEN $2 AND $3 AND is_void = FALSE
    `, [companyId, start, end]),

    query(`
      SELECT s.supplier_name,
             COALESCE(SUM(g.total_amount) FILTER (WHERE g.status='posted'), 0)::numeric AS received_value,
             COALESCE(SUM(sp.amount), 0)::numeric AS paid_value,
             s.current_balance::numeric AS outstanding
      FROM suppliers s
      LEFT JOIN grns g ON g.supplier_id = s.supplier_id AND g.company_id = $1
        AND g.received_date BETWEEN $2 AND $3
      LEFT JOIN supplier_payments sp ON sp.supplier_id = s.supplier_id AND sp.company_id = $1
        AND sp.payment_date BETWEEN $2 AND $3 AND sp.is_void = FALSE
      WHERE s.company_id = $1
      GROUP BY s.supplier_id, s.supplier_name, s.current_balance
      HAVING COALESCE(SUM(g.total_amount), 0) > 0 OR COALESCE(SUM(sp.amount), 0) > 0
      ORDER BY received_value DESC
    `, [companyId, start, end]),
  ]);

  const po  = poRes.rows[0];
  const grn = grnRes.rows[0];
  const pay = payRes.rows[0];

  return {
    period: { startDate: start, endDate: end },
    orders: {
      total: po.total_pos, draft: po.draft, pending: po.pending,
      approved: po.approved, received: po.received, cancelled: po.cancelled,
      totalValue: parseFloat(po.total_value),
    },
    receipts: {
      total: grn.total_grns, posted: grn.posted,
      totalReceived: parseFloat(grn.total_received),
    },
    payments: {
      total: pay.payment_count,
      totalPaid: parseFloat(pay.total_paid),
    },
    bySupplier: supplierRes.rows.map((r) => ({
      supplierName:   r.supplier_name,
      receivedValue:  parseFloat(r.received_value),
      paidValue:      parseFloat(r.paid_value),
      outstanding:    parseFloat(r.outstanding),
    })),
  };
}

module.exports = { getDashboard, getSalesReport, getPLReport, getAPAging, getBalanceSheet, getStockValuation, getPurchasesSummary, getLPOReport, getGRNReport, getTrialBalance, getLedgerEntries };
