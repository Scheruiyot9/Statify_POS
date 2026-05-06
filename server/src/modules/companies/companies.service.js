const { query, transaction } = require('../../config/database');
const bcrypt = require('bcryptjs');
const AppError = require('../../shared/AppError');
const env = require('../../config/env');
const QueryBuilder = require('../../shared/qb');

const DEFAULT_ROLE_PERMISSIONS = {
  company_admin: [
    'view_sales', 'create_transaction', 'void_transaction', 'process_refund',
    'apply_discount', 'view_inventory', 'adjust_stock', 'transfer_stock',
    'view_products', 'manage_products', 'view_customers', 'manage_customers',
    'view_reports', 'view_all_branches', 'export_reports', 'manage_users',
    'manage_settings', 'open_pos_session',
  ],
  branch_manager: [
    'view_sales', 'create_transaction', 'void_transaction', 'process_refund',
    'apply_discount', 'view_inventory', 'adjust_stock', 'transfer_stock',
    'view_products', 'view_customers', 'manage_customers', 'view_reports',
    'open_pos_session',
  ],
  cashier: [
    'view_sales', 'create_transaction', 'apply_discount', 'view_products',
    'view_customers', 'view_inventory', 'open_pos_session',
  ],
  inventory_manager: [
    'view_inventory', 'adjust_stock', 'transfer_stock', 'view_products',
    'manage_products', 'view_reports',
  ],
  accountant: [
    'view_sales', 'view_inventory', 'view_products', 'view_customers',
    'view_reports', 'view_all_branches', 'export_reports',
  ],
  sales_staff: ['view_products', 'view_customers'],
};

async function ensureCompanyRoles(client, companyId) {
  const roleIds = {};

  for (const [roleName, permissionCodes] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const { rows: roleRows } = await client.query(`
      INSERT INTO roles (company_id, role_name, is_system_role)
      VALUES ($1, $2, TRUE)
      ON CONFLICT (company_id, role_name) DO UPDATE SET role_name = EXCLUDED.role_name
      RETURNING role_id
    `, [companyId, roleName]);

    const roleId = roleRows[0].role_id;
    roleIds[roleName] = roleId;

    for (const permissionCode of permissionCodes) {
      await client.query(`
        INSERT INTO role_permissions (role_id, permission_id, can_create, can_read, can_update, can_delete, can_export)
        SELECT $1, permission_id, TRUE, TRUE, TRUE, FALSE, TRUE
        FROM permissions
        WHERE permission_code = $2
        ON CONFLICT (role_id, permission_id) DO NOTHING
      `, [roleId, permissionCode]);
    }
  }

  return roleIds;
}

async function listCompanies({ search, status, page = 1, limit = 25 } = {}) {
  const qb = new QueryBuilder();
  const conditions = [];

  if (search) {
    conditions.push(`c.company_name ILIKE $${qb.add(`%${search}%`)}`);
  }
  if (status) {
    conditions.push(`c.subscription_status = $${qb.add(status)}`);
  }

  const pg = parseInt(page, 10);
  const lm = parseInt(limit, 10);
  const limIdx = qb.add(lm);
  const offIdx = qb.add((pg - 1) * lm);

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(`
    SELECT
      c.company_id, c.company_name, c.subscription_plan_id, c.subscription_status,
      COALESCE(c.domain, c.domain_name) AS domain, c.is_active, c.timezone, c.currency, c.created_at,
      c.logo_url,
      sp.plan_name, sp.max_users, sp.max_branches,
      (SELECT COUNT(*) FROM branches b
       WHERE b.company_id = c.company_id AND b.is_active = TRUE) AS branch_count,
      (SELECT COUNT(*) FROM users u
       WHERE u.company_id = c.company_id AND u.is_active = TRUE) AS user_count,
      COUNT(*) OVER() AS total_count
    FROM companies c
    LEFT JOIN subscription_plans sp ON sp.plan_id = c.subscription_plan_id
    ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);

  const total = rows.length ? parseInt(rows[0].total_count) : 0;
  return {
    companies: rows.map((r) => ({
      company_id: r.company_id,
      company_name: r.company_name,
      domain: r.domain,
      logo_url: r.logo_url ?? null,
      subscription_status: r.subscription_status,
      subscription_plan_id: r.subscription_plan_id,
      is_active: r.is_active,
      timezone: r.timezone,
      currency: r.currency,
      created_at: r.created_at,
      plan_name: r.plan_name,
      max_users: r.max_users,
      max_branches: r.max_branches,
      branch_count: parseInt(r.branch_count),
      user_count: parseInt(r.user_count),
    })),
    total, page: pg, limit: lm, pages: Math.ceil(total / lm),
  };
}

async function getCompany(companyId) {
  const { rows } = await query(`
    SELECT
      c.*,
      sp.plan_name, sp.max_users, sp.max_branches, sp.price AS plan_price,
      (SELECT COUNT(*) FROM branches b
       WHERE b.company_id = c.company_id AND b.is_active = TRUE) AS branch_count,
      (SELECT COUNT(*) FROM users u
       WHERE u.company_id = c.company_id AND u.is_active = TRUE) AS user_count
    FROM companies c
    LEFT JOIN subscription_plans sp ON sp.plan_id = c.subscription_plan_id
    WHERE c.company_id = $1
  `, [companyId]);

  if (!rows.length) throw AppError.notFound('Company');
  const r = rows[0];
  return { ...r, domain: r.domain || r.domain_name, branch_count: parseInt(r.branch_count), user_count: parseInt(r.user_count) };
}

// Full tenant onboarding: company + HQ branch + admin user + seed data
async function createCompany(data) {
  const {
    company_name, domain, timezone = 'Africa/Nairobi', currency = 'KES',
    subscription_plan_id,
    branch_name = 'Main Branch', branch_code,
    admin_first_name, admin_last_name, admin_email, admin_password = 'Admin@123',
  } = data;

  if (!company_name) throw AppError.badRequest('company_name is required');
  if (!admin_email) throw AppError.badRequest('admin_email is required');

  const emailLower = admin_email.toLowerCase().trim();
  const { rows: dup } = await query('SELECT 1 FROM users WHERE email = $1', [emailLower]);
  if (dup.length) throw AppError.conflict('A user with that email already exists');

  return transaction(async (client) => {
    // 1. Create company
    const { rows: [company] } = await client.query(`
      INSERT INTO companies (
        company_name, domain_name, domain, contact_email, timezone, currency,
        subscription_plan_id, subscription_status, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'trial', TRUE)
      RETURNING *
    `, [
      company_name,
      domain || null,   // domain_name
      domain || null,   // domain
      emailLower,
      timezone,
      currency,
      subscription_plan_id || null
    ]);
    // const { rows: [company] } = await client.query(`
    //   INSERT INTO companies (
    //     company_name, domain_name, domain, contact_email, timezone, currency,
    //     subscription_plan_id, subscription_status, is_active
    //   )
    //   VALUES ($1, $2, $2, $3, $4, $5, $6, 'trial', TRUE)
    //   RETURNING *
    // `, [company_name, domain || null, emailLower, timezone, currency, subscription_plan_id || null]);

    // 2. Create headquarters branch
    const bCode = branch_code
      || (company_name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) + '-HQ');

    const { rows: [branch] } = await client.query(`
      INSERT INTO branches (company_id, branch_name, branch_code, is_headquarters, is_active)
      VALUES ($1, $2, $3, TRUE, TRUE)
      RETURNING branch_id, branch_name, branch_code, is_headquarters
    `, [company.company_id, branch_name, bCode]);

    // 3. Create tenant roles and default role permissions
    const roleIds = await ensureCompanyRoles(client, company.company_id);

    // 4. Create admin user
    const passwordHash = await bcrypt.hash(admin_password, env.bcryptRounds);
    const username = emailLower.split('@')[0].replace(/[^a-z0-9._-]/gi, '').slice(0, 60) || 'admin';
    const { rows: [adminUser] } = await client.query(`
      INSERT INTO users (company_id, username, first_name, last_name, email, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      RETURNING user_id, first_name, last_name, email
    `, [company.company_id,
      username,
    admin_first_name || 'Admin',
    admin_last_name || 'User',
      emailLower,
      passwordHash]);

    // 5. Assign company_admin role
    await client.query(`
      INSERT INTO user_roles (user_role_id, user_id, role_id)
      VALUES (gen_random_uuid(), $1, $2) ON CONFLICT DO NOTHING
    `, [adminUser.user_id, roleIds.company_admin]);

    // 6. Assign admin to HQ branch as default
    await client.query(`
      INSERT INTO user_branch_assignments (assignment_id, user_id, branch_id, is_default_branch)
      VALUES (gen_random_uuid(), $1, $2, TRUE) ON CONFLICT DO NOTHING
    `, [adminUser.user_id, branch.branch_id]);

    // 7. Seed Walk-in customer group (required for walk-in sales)
    await client.query(`
      INSERT INTO customer_groups (company_id, group_name, is_system_group, is_active)
      VALUES ($1, 'Walk-in', TRUE, TRUE) ON CONFLICT DO NOTHING
    `, [company.company_id]);

    // 8. Seed default payment methods
    for (const pm of [
      { name: 'Cash', ref: false },
      { name: 'M-Pesa', ref: true },
      { name: 'Card', ref: false },
    ]) {
      await client.query(`
        INSERT INTO payment_methods (company_id, method_name, is_active, requires_reference)
        VALUES ($1, $2, TRUE, $3) ON CONFLICT DO NOTHING
      `, [company.company_id, pm.name, pm.ref]);
    }

    return { company, branch, admin_user: adminUser };
  });
}

async function updateCompany(companyId, data) {
  const { company_name, domain, timezone, currency, subscription_plan_id, logo_url } = data;

  const { rows } = await query(`
    UPDATE companies
    SET company_name         = COALESCE($2, company_name),
        domain_name          = COALESCE($3, domain_name),
        domain               = COALESCE($3, domain),
        timezone             = COALESCE($4, timezone),
        currency             = COALESCE($5, currency),
        subscription_plan_id = COALESCE($6, subscription_plan_id),
        logo_url             = CASE WHEN $7::TEXT IS NOT NULL THEN $7::TEXT ELSE logo_url END,
        updated_at           = now()
    WHERE company_id = $1
    RETURNING company_id, company_name, COALESCE(domain, domain_name) AS domain,
              timezone, currency, subscription_status, is_active, logo_url
  `, [companyId,
    company_name ?? null,
    domain ?? null,
    timezone ?? null,
    currency ?? null,
    subscription_plan_id ?? null,
    logo_url ?? null]);

  if (!rows.length) throw AppError.notFound('Company');
  return rows[0];
}

async function getMyCompany(companyId) {
  const { rows } = await query(
    `SELECT company_id, company_name, logo_url, tax_id FROM companies WHERE company_id = $1`,
    [companyId]
  );
  if (!rows.length) throw AppError.notFound('Company');
  return rows[0];
}

async function updateMyProfile(companyId, { tax_id }) {
  const { rows } = await query(
    `UPDATE companies SET tax_id = $2 WHERE company_id = $1 RETURNING company_id, company_name, logo_url, tax_id`,
    [companyId, tax_id ?? null]
  );
  if (!rows.length) throw AppError.notFound('Company');
  return rows[0];
}

async function getLoyaltySettings(companyId) {
  const { rows } = await query(
    `SELECT points_earn_rate, points_redeem_rate FROM companies WHERE company_id = $1`,
    [companyId]
  );
  if (!rows.length) throw AppError.notFound('Company');
  return {
    points_earn_rate:   parseFloat(rows[0].points_earn_rate),
    points_redeem_rate: parseFloat(rows[0].points_redeem_rate),
  };
}

async function updateLoyaltySettings(companyId, { points_earn_rate, points_redeem_rate }) {
  if (points_earn_rate   <= 0) throw AppError.badRequest('Earn rate must be greater than 0');
  if (points_redeem_rate <= 0) throw AppError.badRequest('Redeem rate must be greater than 0');
  const { rows } = await query(`
    UPDATE companies
    SET points_earn_rate = $2, points_redeem_rate = $3, updated_at = now()
    WHERE company_id = $1
    RETURNING points_earn_rate, points_redeem_rate
  `, [companyId, points_earn_rate, points_redeem_rate]);
  if (!rows.length) throw AppError.notFound('Company');
  return {
    points_earn_rate:   parseFloat(rows[0].points_earn_rate),
    points_redeem_rate: parseFloat(rows[0].points_redeem_rate),
  };
}

async function updateSubscriptionStatus(companyId, { status }) {
  const allowed = ['trial', 'active', 'suspended', 'cancelled'];
  if (!allowed.includes(status))
    throw AppError.badRequest(`status must be one of: ${allowed.join(', ')}`);

  const isActive = !['suspended', 'cancelled'].includes(status);

  const { rows } = await query(`
    UPDATE companies
    SET subscription_status = $2,
        is_active           = $3,
        updated_at          = now()
    WHERE company_id = $1
    RETURNING company_id, company_name, subscription_status, is_active
  `, [companyId, status, isActive]);

  if (!rows.length) throw AppError.notFound('Company');
  return rows[0];
}

async function listSubscriptionPlans() {
  const { rows } = await query(
    `SELECT plan_id, plan_name, price, max_users, max_branches
     FROM subscription_plans ORDER BY price`,
    []
  );
  return rows;
}

module.exports = {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  updateSubscriptionStatus,
  listSubscriptionPlans,
  getMyCompany,
  updateMyProfile,
  getLoyaltySettings,
  updateLoyaltySettings,
};
