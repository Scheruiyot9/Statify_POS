const { query } = require('../../config/database');
const QueryBuilder = require('../../shared/qb');
const AppError = require('../../shared/AppError');

// ── Shared helpers ─────────────────────────────────────────────────────────────

function paginate(page, limit) {
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lm = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
  return { pg, lm, offset: (pg - 1) * lm };
}

function shape(rows, pg, lm, key = 'rows') {
  const total = rows.length ? parseInt(rows[0].total_count, 10) : 0;
  return { [key]: rows.map(({ total_count: _, ...r }) => r), total, page: pg, limit: lm, pages: Math.ceil(total / lm) };
}

// ── Companies summary (with live counts) ──────────────────────────────────────

async function listAllCompanies({ search, status, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = [];

  if (search) {
    const p = qb.add(`%${search}%`);
    conds.push(`(c.company_name ILIKE $${p} OR c.domain ILIKE $${p})`);
  }
  if (status) conds.push(`c.subscription_status = $${qb.add(status)}`);

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      c.company_id, c.company_name, c.domain, c.subscription_status,
      c.is_active, c.timezone, c.currency, c.created_at,
      sp.plan_name, sp.max_users, sp.max_branches,
      (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.company_id AND b.is_active = TRUE) AS branch_count,
      (SELECT COUNT(*) FROM users   u WHERE u.company_id = c.company_id AND u.is_active = TRUE) AS user_count,
      COUNT(*) OVER() AS total_count
    FROM companies c
    LEFT JOIN subscription_plans sp ON sp.plan_id = c.subscription_plan_id
    ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
    ORDER BY c.created_at DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'companies');
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function listAllUsers({ search, companyId, role, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = ['u.is_active = TRUE'];

  if (companyId) conds.push(`u.company_id = $${qb.add(companyId)}`);
  if (search) {
    const p = qb.add(`%${search}%`);
    conds.push(`(u.first_name ILIKE $${p} OR u.last_name ILIKE $${p} OR u.email ILIKE $${p})`);
  }
  if (role) conds.push(`r.role_name = $${qb.add(role)}`);

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      u.user_id, u.first_name, u.last_name, u.email,
      u.is_active, u.last_login, u.created_at,
      c.company_name, c.company_id,
      r.role_name,
      b.branch_name,
      COUNT(*) OVER() AS total_count
    FROM users u
    LEFT JOIN companies c ON c.company_id = u.company_id
    LEFT JOIN user_roles ur ON ur.user_id = u.user_id
    LEFT JOIN roles r ON r.role_id = ur.role_id
    LEFT JOIN user_branch_assignments uba ON uba.user_id = u.user_id AND uba.is_default_branch = TRUE
    LEFT JOIN branches b ON b.branch_id = uba.branch_id
    WHERE ${conds.join(' AND ')}
    ORDER BY c.company_name NULLS LAST, u.first_name
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'users');
}

// ── Branches ──────────────────────────────────────────────────────────────────

async function listAllBranches({ search, companyId, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = ['b.is_active = TRUE'];

  if (companyId) conds.push(`b.company_id = $${qb.add(companyId)}`);
  if (search) {
    const p = qb.add(`%${search}%`);
    conds.push(`(b.branch_name ILIKE $${p} OR b.branch_code ILIKE $${p})`);
  }

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      b.branch_id, b.branch_name, b.branch_code, b.phone, b.address,
      b.is_headquarters, b.is_active, b.created_at,
      c.company_name, c.company_id,
      COUNT(*) OVER() AS total_count
    FROM branches b
    JOIN companies c ON c.company_id = b.company_id
    WHERE ${conds.join(' AND ')}
    ORDER BY c.company_name, b.branch_name
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'branches');
}

// ── Terminals ─────────────────────────────────────────────────────────────────

async function listAllTerminals({ search, companyId, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = [];

  if (companyId) conds.push(`t.company_id = $${qb.add(companyId)}`);
  if (search) {
    const p = qb.add(`%${search}%`);
    conds.push(`(t.terminal_name ILIKE $${p} OR t.terminal_code ILIKE $${p})`);
  }

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      t.terminal_id, t.terminal_name, t.terminal_code, t.description, t.is_active, t.created_at,
      b.branch_name, b.branch_id,
      c.company_name, c.company_id,
      (SELECT COUNT(*) FROM pos_sessions ps WHERE ps.terminal_id = t.terminal_id AND ps.status = 'open') AS open_sessions,
      COUNT(*) OVER() AS total_count
    FROM pos_terminals t
    JOIN branches b ON b.branch_id = t.branch_id
    JOIN companies c ON c.company_id = t.company_id
    ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
    ORDER BY c.company_name, b.branch_name, t.terminal_name
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'terminals');
}

// ── POS Sessions ──────────────────────────────────────────────────────────────

async function listAllSessions({ companyId, status, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = [];

  if (companyId) conds.push(`s.company_id = $${qb.add(companyId)}`);
  if (status)    conds.push(`s.status = $${qb.add(status)}`);

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      s.session_id, s.status, s.opening_cash_amount,
      s.closing_cash_counted, s.expected_cash_amount, s.cash_variance,
      s.session_start, s.session_end,
      t.terminal_name, t.terminal_code,
      b.branch_name,
      c.company_name, c.company_id,
      cashier.first_name  || ' ' || cashier.last_name  AS cashier_name,
      opener.first_name   || ' ' || opener.last_name   AS opened_by_name,
      COUNT(*) OVER() AS total_count
    FROM pos_sessions s
    JOIN pos_terminals t ON t.terminal_id = s.terminal_id
    JOIN branches b      ON b.branch_id   = s.branch_id
    JOIN companies c     ON c.company_id  = s.company_id
    JOIN users cashier   ON cashier.user_id = s.cashier_user_id
    LEFT JOIN users opener ON opener.user_id = s.opened_by_user_id
    ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
    ORDER BY s.session_start DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'sessions');
}

// ── Sales Transactions ────────────────────────────────────────────────────────

async function listAllSales({ companyId, status, dateFrom, dateTo, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = [];

  if (companyId) conds.push(`st.company_id = $${qb.add(companyId)}`);
  if (status)    conds.push(`st.status = $${qb.add(status)}`);
  if (dateFrom)  conds.push(`st.transaction_date >= $${qb.add(dateFrom)}`);
  if (dateTo)    conds.push(`st.transaction_date <= $${qb.add(dateTo)}`);

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      st.transaction_id, st.transaction_number,
      st.total_amount::numeric, st.status, st.transaction_date,
      st.payment_status,
      b.branch_name, c.company_name, c.company_id,
      cashier.first_name || ' ' || cashier.last_name AS cashier_name,
      COUNT(*) OVER() AS total_count
    FROM sales_transactions st
    JOIN branches b    ON b.branch_id  = st.branch_id
    JOIN companies c   ON c.company_id = st.company_id
    JOIN users cashier ON cashier.user_id = st.cashier_user_id
    ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
    ORDER BY st.transaction_date DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'sales');
}

// ── Products ──────────────────────────────────────────────────────────────────

async function listAllProducts({ search, companyId, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = ['p.is_active = TRUE'];

  if (companyId) conds.push(`p.company_id = $${qb.add(companyId)}`);
  if (search) {
    const p = qb.add(`%${search}%`);
    conds.push(`(p.product_name ILIKE $${p} OR p.sku ILIKE $${p})`);
  }

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      p.product_id, p.product_name, p.sku, p.barcode,
      p.base_price::numeric, p.cost_price::numeric,
      p.unit_of_measure, p.is_active,
      c.company_name, c.company_id,
      cat.category_name,
      COUNT(*) OVER() AS total_count
    FROM products p
    JOIN companies c ON c.company_id = p.company_id
    LEFT JOIN categories cat ON cat.category_id = p.category_id
    WHERE ${conds.join(' AND ')}
    ORDER BY c.company_name, p.product_name
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'products');
}

// ── Inventory ─────────────────────────────────────────────────────────────────

async function listAllInventory({ companyId, lowStockOnly, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = ['p.is_active = TRUE', 'b.is_active = TRUE'];

  if (companyId)   conds.push(`b.company_id = $${qb.add(companyId)}`);
  if (lowStockOnly) conds.push('pbi.quantity_available <= pbi.reorder_level AND pbi.reorder_level > 0');

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      pbi.inventory_id,
      p.product_name, p.sku,
      pbi.quantity_available::numeric, pbi.reorder_level::numeric,
      pbi.quantity_reserved::numeric, pbi.quantity_on_order::numeric,
      b.branch_name, c.company_name, c.company_id,
      COUNT(*) OVER() AS total_count
    FROM product_branch_inventory pbi
    JOIN products  p ON p.product_id  = pbi.product_id
    JOIN branches  b ON b.branch_id   = pbi.branch_id
    JOIN companies c ON c.company_id  = b.company_id
    WHERE ${conds.join(' AND ')}
    ORDER BY c.company_name, b.branch_name, p.product_name
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'inventory');
}

// ── Customers ─────────────────────────────────────────────────────────────────

async function listAllCustomers({ search, companyId, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = [];

  if (companyId) conds.push(`cu.company_id = $${qb.add(companyId)}`);
  if (search) {
    const p = qb.add(`%${search}%`);
    conds.push(`(cu.customer_name ILIKE $${p} OR cu.phone ILIKE $${p} OR cu.email ILIKE $${p})`);
  }

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      cu.customer_id, cu.customer_name, cu.customer_code,
      cu.phone, cu.email, cu.loyalty_points_balance, cu.created_at,
      c.company_name, c.company_id,
      cg.group_name,
      COUNT(*) OVER() AS total_count
    FROM customers cu
    JOIN companies c ON c.company_id = cu.company_id
    LEFT JOIN customer_groups cg ON cg.group_id = cu.customer_group_id
    ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
    ORDER BY c.company_name, cu.customer_name
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'customers');
}

// ── Payment Methods ───────────────────────────────────────────────────────────

async function listAllPaymentMethods({ companyId, page, limit } = {}) {
  const qb    = new QueryBuilder();
  const conds = [];

  if (companyId) conds.push(`pm.company_id = $${qb.add(companyId)}`);

  const { pg, lm, offset } = paginate(page, limit);
  const limIdx = qb.add(lm);
  const offIdx = qb.add(offset);

  const { rows } = await query(`
    SELECT
      pm.payment_method_id, pm.method_name, pm.is_active, pm.requires_reference,
      c.company_name, c.company_id,
      COUNT(*) OVER() AS total_count
    FROM payment_methods pm
    JOIN companies c ON c.company_id = pm.company_id
    ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
    ORDER BY c.company_name, pm.method_name
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);
  return shape(rows, pg, lm, 'paymentMethods');
}

// ── Platform stats ────────────────────────────────────────────────────────────

async function platformStats() {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*) FROM companies)                    AS total_companies,
      (SELECT COUNT(*) FROM companies WHERE subscription_status = 'active')    AS active_companies,
      (SELECT COUNT(*) FROM companies WHERE subscription_status = 'trial')     AS trial_companies,
      (SELECT COUNT(*) FROM companies WHERE subscription_status = 'suspended') AS suspended_companies,
      (SELECT COUNT(*) FROM users    WHERE is_active = TRUE AND company_id IS NOT NULL) AS total_users,
      (SELECT COUNT(*) FROM branches WHERE is_active = TRUE) AS total_branches,
      (SELECT COUNT(*) FROM products WHERE is_active = TRUE) AS total_products,
      (SELECT COUNT(*) FROM customers)                       AS total_customers,
      (SELECT COUNT(*) FROM pos_sessions WHERE status = 'open') AS open_sessions,
      (SELECT COALESCE(SUM(total_amount), 0)::numeric
       FROM sales_transactions
       WHERE transaction_date >= CURRENT_DATE AND status = 'completed') AS today_sales
  `);
  const r = rows[0];
  return {
    total_companies:     parseInt(r.total_companies),
    active_companies:    parseInt(r.active_companies),
    trial_companies:     parseInt(r.trial_companies),
    suspended_companies: parseInt(r.suspended_companies),
    total_users:         parseInt(r.total_users),
    total_branches:      parseInt(r.total_branches),
    total_products:      parseInt(r.total_products),
    total_customers:     parseInt(r.total_customers),
    open_sessions:       parseInt(r.open_sessions),
    today_sales:         parseFloat(r.today_sales),
  };
}

// ── Subscription Plans CRUD ───────────────────────────────────────────────────

async function listPlans() {
  const { rows } = await query(`
    SELECT plan_id, plan_name, price::numeric, annual_price::numeric,
           billing_cycle, max_users, max_branches, trial_days,
           has_finance, has_api_access, sort_order,
           features_json, is_active, created_at
    FROM subscription_plans
    ORDER BY sort_order, plan_name
  `);
  return rows;
}

async function createPlan(data) {
  const {
    plan_name, price, annual_price, billing_cycle = 'monthly',
    max_users = 5, max_branches = 1, trial_days = 14,
    has_finance = false, has_api_access = false, sort_order = 0,
    features_json = {},
  } = data;

  if (!plan_name) throw AppError.badRequest('plan_name is required');
  if (price == null) throw AppError.badRequest('price is required');

  const { rows } = await query(`
    INSERT INTO subscription_plans
      (plan_name, price, annual_price, billing_cycle, max_users, max_branches,
       trial_days, has_finance, has_api_access, sort_order, features_json)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING plan_id, plan_name, price::numeric, has_finance, has_api_access
  `, [
    plan_name, price, annual_price ?? null, billing_cycle,
    max_users, max_branches, trial_days,
    has_finance, has_api_access, sort_order,
    JSON.stringify(features_json),
  ]);
  return rows[0];
}

async function updatePlan(planId, data) {
  const allowed = [
    'plan_name','price','annual_price','billing_cycle','max_users','max_branches',
    'trial_days','has_finance','has_api_access','sort_order','features_json','is_active',
  ];
  const sets  = [];
  const params = [planId];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      params.push(key === 'features_json' ? JSON.stringify(data[key]) : data[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) throw AppError.badRequest('No fields to update');

  const { rows } = await query(`
    UPDATE subscription_plans SET ${sets.join(', ')}
    WHERE plan_id = $1
    RETURNING plan_id, plan_name, price::numeric, has_finance, has_api_access, is_active
  `, params);
  if (!rows.length) throw AppError.notFound('Subscription plan');
  return rows[0];
}

async function deletePlan(planId) {
  const { rows: inUse } = await query(
    `SELECT COUNT(*) AS cnt FROM companies WHERE subscription_plan_id = $1`, [planId]
  );
  if (parseInt(inUse[0].cnt) > 0)
    throw AppError.conflict('Cannot deactivate a plan that is assigned to active companies');

  const { rows } = await query(
    `UPDATE subscription_plans SET is_active = FALSE WHERE plan_id = $1 RETURNING plan_id`,
    [planId]
  );
  if (!rows.length) throw AppError.notFound('Subscription plan');
  return { plan_id: planId, is_active: false };
}

// ── Company Management ────────────────────────────────────────────────────────

async function changeCompanyPlan(companyId, planId) {
  const { rows: plan } = await query(
    `SELECT plan_id, plan_name FROM subscription_plans WHERE plan_id = $1 AND is_active = TRUE`, [planId]
  );
  if (!plan.length) throw AppError.notFound('Subscription plan');

  const { rows } = await query(`
    UPDATE companies
    SET subscription_plan_id = $2, updated_at = now()
    WHERE company_id = $1
    RETURNING company_id, company_name
  `, [companyId, planId]);
  if (!rows.length) throw AppError.notFound('Company');
  return { company_id: companyId, plan_name: plan[0].plan_name };
}

async function changeCompanyStatus(companyId, status) {
  const valid = ['trial','active','suspended','cancelled'];
  if (!valid.includes(status)) throw AppError.badRequest(`status must be one of: ${valid.join(', ')}`);

  const { rows } = await query(`
    UPDATE companies
    SET subscription_status = $2, updated_at = now()
    WHERE company_id = $1
    RETURNING company_id, company_name, subscription_status
  `, [companyId, status]);
  if (!rows.length) throw AppError.notFound('Company');
  return rows[0];
}

module.exports = {
  listAllCompanies, listAllUsers, listAllBranches, listAllTerminals,
  listAllSessions,  listAllSales,  listAllProducts,  listAllInventory,
  listAllCustomers, listAllPaymentMethods, platformStats,
  listPlans, createPlan, updatePlan, deletePlan,
  changeCompanyPlan, changeCompanyStatus,
};
