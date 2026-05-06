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

module.exports = { getDashboard, getSalesReport };
