const { query } = require('../../config/database');
const AppError  = require('../../shared/AppError');

const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

async function listAccounts(companyId) {
  const { rows } = await query(`
    SELECT a.account_id, a.account_code, a.account_name, a.account_type,
           a.account_subtype, a.parent_account_id, a.description,
           a.is_active, a.is_system,
           p.account_name AS parent_name
    FROM accounts a
    LEFT JOIN accounts p ON p.account_id = a.parent_account_id
    WHERE a.company_id = $1
    ORDER BY a.account_type, a.account_code
  `, [companyId]);
  return rows;
}

async function getAccount(companyId, accountId) {
  const { rows } = await query(
    `SELECT * FROM accounts WHERE account_id = $1 AND company_id = $2`,
    [accountId, companyId]
  );
  if (!rows.length) throw AppError.notFound('Account');
  return rows[0];
}

async function createAccount(companyId, data) {
  const { account_code, account_name, account_type, account_subtype,
          parent_account_id, description } = data;

  if (!account_code || !account_name) throw AppError.badRequest('account_code and account_name are required');
  if (!TYPES.includes(account_type))  throw AppError.badRequest(`account_type must be one of: ${TYPES.join(', ')}`);

  if (parent_account_id) {
    const { rows: parent } = await query(
      `SELECT account_id FROM accounts WHERE account_id = $1 AND company_id = $2`,
      [parent_account_id, companyId]
    );
    if (!parent.length) throw AppError.badRequest('Parent account not found');
  }

  const { rows } = await query(`
    INSERT INTO accounts
      (company_id, account_code, account_name, account_type, account_subtype, parent_account_id, description)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `, [companyId, account_code.trim(), account_name.trim(), account_type,
      account_subtype || null, parent_account_id || null, description || null]);

  return rows[0];
}

async function updateAccount(companyId, accountId, data) {
  const allowed = ['account_code','account_name','account_type','account_subtype',
                   'parent_account_id','description','is_active'];
  const sets = [];
  const vals = [companyId, accountId];

  for (const [k, v] of Object.entries(data)) {
    if (!allowed.includes(k)) continue;
    if (k === 'account_type' && !TYPES.includes(v))
      throw AppError.badRequest(`account_type must be one of: ${TYPES.join(', ')}`);
    vals.push(v === '' ? null : v);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) throw AppError.badRequest('No valid fields to update');

  const { rows } = await query(`
    UPDATE accounts SET ${sets.join(', ')}, updated_at = now()
    WHERE company_id = $1 AND account_id = $2
    RETURNING *
  `, vals);
  if (!rows.length) throw AppError.notFound('Account');
  return rows[0];
}

async function deleteAccount(companyId, accountId) {
  const { rows: acc } = await query(
    `SELECT is_system FROM accounts WHERE account_id = $1 AND company_id = $2`,
    [accountId, companyId]
  );
  if (!acc.length) throw AppError.notFound('Account');
  if (acc[0].is_system) throw AppError.forbidden('System accounts cannot be deleted');

  const { rows: children } = await query(
    `SELECT account_id FROM accounts WHERE parent_account_id = $1 LIMIT 1`,
    [accountId]
  );
  if (children.length) throw AppError.conflict('Cannot delete an account that has sub-accounts');

  await query(
    `UPDATE accounts SET is_active = FALSE, updated_at = now() WHERE account_id = $1`,
    [accountId]
  );
  return { deleted: true };
}

const DEFAULT_ACCOUNTS = [
  // Assets
  { code: '1000', name: 'Cash on Hand',           type: 'asset',     subtype: 'current_asset', system: true },
  { code: '1010', name: 'Bank - Main Account',     type: 'asset',     subtype: 'current_asset', system: false },
  { code: '1100', name: 'Accounts Receivable',     type: 'asset',     subtype: 'current_asset', system: true },
  { code: '1200', name: 'Inventory',               type: 'asset',     subtype: 'current_asset', system: true },
  { code: '1300', name: 'Prepaid Expenses',        type: 'asset',     subtype: 'current_asset', system: false },
  { code: '1500', name: 'Fixed Assets',            type: 'asset',     subtype: 'fixed_asset',   system: false },
  { code: '1510', name: 'Accumulated Depreciation',type: 'asset',     subtype: 'fixed_asset',   system: false },
  // Liabilities
  { code: '2000', name: 'Accounts Payable',        type: 'liability', subtype: 'current_liability', system: true },
  { code: '2100', name: 'VAT Payable',             type: 'liability', subtype: 'current_liability', system: false },
  { code: '2200', name: 'PAYE Payable',            type: 'liability', subtype: 'current_liability', system: false },
  { code: '2300', name: 'Short-term Loans',        type: 'liability', subtype: 'current_liability', system: false },
  // Equity
  { code: '3000', name: "Owner's Capital",         type: 'equity',    subtype: null, system: false },
  { code: '3100', name: 'Retained Earnings',       type: 'equity',    subtype: null, system: false },
  // Revenue
  { code: '4000', name: 'Sales Revenue',           type: 'revenue',   subtype: null, system: true },
  { code: '4100', name: 'Service Revenue',         type: 'revenue',   subtype: null, system: false },
  { code: '4200', name: 'Other Income',            type: 'revenue',   subtype: null, system: false },
  // Expenses
  { code: '5000', name: 'Cost of Goods Sold',      type: 'expense',   subtype: null, system: true },
  { code: '5100', name: 'Salaries & Wages',        type: 'expense',   subtype: null, system: false },
  { code: '5200', name: 'Rent',                    type: 'expense',   subtype: null, system: false },
  { code: '5300', name: 'Utilities',               type: 'expense',   subtype: null, system: false },
  { code: '5400', name: 'Marketing & Advertising', type: 'expense',   subtype: null, system: false },
  { code: '5500', name: 'Office Supplies',         type: 'expense',   subtype: null, system: false },
  { code: '5600', name: 'Depreciation',            type: 'expense',   subtype: null, system: false },
  { code: '5700', name: 'Bank Charges',            type: 'expense',   subtype: null, system: false },
  { code: '5800', name: 'Other Expenses',          type: 'expense',   subtype: null, system: false },
];

async function seedDefaults(companyId) {
  const { rows: existing } = await query(
    `SELECT COUNT(*) AS cnt FROM accounts WHERE company_id = $1`, [companyId]
  );
  if (parseInt(existing[0].cnt) > 0)
    throw AppError.conflict('Chart of accounts already exists for this company. Clear it first or add accounts manually.');

  for (const a of DEFAULT_ACCOUNTS) {
    await query(`
      INSERT INTO accounts (company_id, account_code, account_name, account_type, account_subtype, is_system)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (company_id, account_code) DO NOTHING
    `, [companyId, a.code, a.name, a.type, a.subtype, a.system]);
  }
  return { seeded: DEFAULT_ACCOUNTS.length };
}

// ── Account Balance (computed from operational data) ──────────────────────────

async function getAccountBalance(companyId, accountId) {
  const { rows: accRows } = await query(
    `SELECT account_code, account_name, account_type FROM accounts WHERE account_id = $1 AND company_id = $2`,
    [accountId, companyId]
  );
  if (!accRows.length) throw AppError.notFound('Account');

  const { account_code, account_name, account_type } = accRows[0];

  const BALANCE_QUERIES = {
    '1010': `SELECT COALESCE(SUM(current_balance), 0)::numeric AS val FROM bank_accounts WHERE company_id = $1 AND is_active = TRUE`,
    '1200': `SELECT COALESCE(SUM(pbi.quantity_available * COALESCE(p.cost_price,0)),0)::numeric AS val
             FROM product_branch_inventory pbi JOIN products p ON p.product_id=pbi.product_id AND p.company_id=$1 AND p.is_active=TRUE
             JOIN branches b ON b.branch_id=pbi.branch_id AND b.company_id=$1 WHERE pbi.quantity_available>0`,
    '2000': `SELECT COALESCE(SUM(current_balance),0)::numeric AS val FROM suppliers WHERE company_id=$1 AND current_balance>0`,
    '2100': `SELECT COALESCE(SUM(COALESCE(tax_amount,0)),0)::numeric AS val FROM sales_transactions WHERE company_id=$1 AND status='completed'`,
    '4000': `SELECT COALESCE(SUM(total_amount - COALESCE(tax_amount,0)) - (SELECT COALESCE(SUM(total_refunded),0) FROM returns WHERE company_id=$1 AND status IN ('approved','refunded')),0)::numeric AS val FROM sales_transactions WHERE company_id=$1 AND status='completed'`,
    '5000': `SELECT COALESCE(SUM(sti.quantity*COALESCE(p.cost_price,0)),0)::numeric AS val FROM sales_transaction_items sti JOIN products p ON p.product_id=sti.product_id JOIN sales_transactions st ON st.transaction_id=sti.transaction_id WHERE st.company_id=$1 AND st.status='completed'`,
  };

  let balance = 0;
  if (BALANCE_QUERIES[account_code]) {
    const { rows } = await query(BALANCE_QUERIES[account_code], [companyId]);
    balance = parseFloat(rows[0]?.val ?? 0);
  }

  return { accountId, accountCode: account_code, accountName: account_name, accountType: account_type, balance };
}

// ── Account Ledger (synthesized entries) ─────────────────────────────────────

async function getAccountLedger(companyId, accountId, { startDate, endDate, page = 1, limit = 50 } = {}) {
  const { getLedgerEntries } = require('../reports/reports.service');
  return getLedgerEntries(companyId, { accountId, startDate, endDate, page, limit });
}

module.exports = { listAccounts, getAccount, createAccount, updateAccount, deleteAccount, seedDefaults, getAccountBalance, getAccountLedger };
