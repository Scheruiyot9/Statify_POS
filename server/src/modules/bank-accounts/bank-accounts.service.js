const { query } = require('../../config/database');
const AppError  = require('../../shared/AppError');

async function listBankAccounts(companyId) {
  const { rows } = await query(`
    SELECT ba.*, a.account_name AS coa_account_name, b.branch_name
    FROM bank_accounts ba
    LEFT JOIN accounts  a ON a.account_id = ba.account_id
    LEFT JOIN branches  b ON b.branch_id  = ba.branch_id
    WHERE ba.company_id = $1
    ORDER BY ba.is_default DESC, ba.account_name
  `, [companyId]);
  return rows;
}

async function getBankAccount(companyId, id) {
  const { rows } = await query(
    `SELECT * FROM bank_accounts WHERE bank_account_id = $1 AND company_id = $2`,
    [id, companyId]
  );
  if (!rows.length) throw AppError.notFound('Bank account');
  return rows[0];
}

async function createBankAccount(companyId, data) {
  const { account_name, bank_name, account_number, bank_branch,
          currency = 'KES', opening_balance = 0,
          is_default = false, account_id, branch_id, notes } = data;

  if (!account_name) throw AppError.badRequest('account_name is required');
  if (!bank_name)    throw AppError.badRequest('bank_name is required');

  if (is_default) {
    await query(
      `UPDATE bank_accounts SET is_default = FALSE WHERE company_id = $1`,
      [companyId]
    );
  }

  const { rows } = await query(`
    INSERT INTO bank_accounts
      (company_id, branch_id, account_id, account_name, bank_name, account_number,
       bank_branch, currency, opening_balance, current_balance, is_default, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)
    RETURNING *
  `, [companyId, branch_id || null, account_id || null,
      account_name.trim(), bank_name.trim(), account_number || null,
      bank_branch || null, currency, parseFloat(opening_balance) || 0,
      is_default, notes || null]);

  return rows[0];
}

async function updateBankAccount(companyId, id, data) {
  const allowed = ['account_name','bank_name','account_number','bank_branch',
                   'currency','is_default','account_id','branch_id','notes','is_active'];
  const sets = [];
  const vals = [companyId, id];

  if (data.is_default) {
    await query(`UPDATE bank_accounts SET is_default = FALSE WHERE company_id = $1`, [companyId]);
  }

  for (const [k, v] of Object.entries(data)) {
    if (!allowed.includes(k)) continue;
    vals.push(v === '' ? null : v);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) throw AppError.badRequest('No valid fields to update');

  const { rows } = await query(`
    UPDATE bank_accounts SET ${sets.join(', ')}, updated_at = now()
    WHERE company_id = $1 AND bank_account_id = $2
    RETURNING *
  `, vals);
  if (!rows.length) throw AppError.notFound('Bank account');
  return rows[0];
}

async function deleteBankAccount(companyId, id) {
  const { rows } = await query(
    `UPDATE bank_accounts SET is_active = FALSE, updated_at = now()
     WHERE bank_account_id = $1 AND company_id = $2 RETURNING bank_account_id`,
    [id, companyId]
  );
  if (!rows.length) throw AppError.notFound('Bank account');
  return { deleted: true };
}

// ── Bank Account Ledger (payment in/out history) ──────────────────────────────

async function getBankAccountLedger(companyId, bankAccountId, { startDate, endDate, page = 1, limit = 50 } = {}) {
  const start = startDate || new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10);
  const end   = endDate   || new Date().toISOString().slice(0, 10);
  const pg = parseInt(page, 10);
  const lm = parseInt(limit, 10);

  // Verify bank account belongs to company
  const { rows: baRows } = await query(
    `SELECT bank_account_id, account_name, bank_name, current_balance::numeric AS current_balance
     FROM bank_accounts WHERE bank_account_id = $1 AND company_id = $2`,
    [bankAccountId, companyId]
  );
  if (!baRows.length) throw AppError.notFound('Bank account');
  const ba = baRows[0];

  // Entries: supplier payments debit this bank account
  const { rows: pmtRows } = await query(`
    SELECT sp.payment_id AS id,
           sp.payment_date AS entry_date,
           'PAYMENT' AS entry_type,
           COALESCE(sp.reference_number, 'PMT-' || LEFT(sp.payment_id::text, 8)) AS reference,
           'Payment to ' || s.supplier_name AS description,
           0::numeric AS credit_in,
           sp.amount::numeric AS debit_out,
           sp.payment_method
    FROM supplier_payments sp
    JOIN suppliers s ON s.supplier_id = sp.supplier_id
    WHERE sp.company_id = $1
      AND (sp.bank_account_id = $2 OR (sp.bank_account_id IS NULL AND sp.payment_method IN ('bank_transfer','cheque')))
      AND sp.is_void = FALSE
      AND sp.payment_date BETWEEN $3 AND $4
    ORDER BY sp.payment_date DESC, sp.created_at DESC
  `, [companyId, bankAccountId, start, end]);

  // Entries: sales transactions with bank payment methods map to deposits
  const { rows: salesRows } = await query(`
    SELECT st.transaction_id AS id,
           st.transaction_date AS entry_date,
           'DEPOSIT' AS entry_type,
           st.transaction_number AS reference,
           'Sales deposit — ' || COALESCE(c.customer_name, 'Walk-in') AS description,
           COALESCE(SUM(tp.amount), 0)::numeric AS credit_in,
           0::numeric AS debit_out,
           'bank_transfer' AS payment_method
    FROM sales_transactions st
    LEFT JOIN customers c ON c.customer_id = st.customer_id
    JOIN transaction_payments tp ON tp.transaction_id = st.transaction_id
    JOIN payment_methods pm ON pm.payment_method_id = tp.payment_method_id
      AND pm.method_name NOT ILIKE '%cash%'
      AND pm.method_name NOT ILIKE '%mpesa%'
    WHERE st.company_id = $1 AND st.status = 'completed'
      AND st.transaction_date::date BETWEEN $2 AND $3
    GROUP BY st.transaction_id, st.transaction_date, st.transaction_number, c.customer_name
    ORDER BY st.transaction_date DESC
  `, [companyId, start, end]);

  const allEntries = [
    ...pmtRows.map((r) => ({
      id:          r.id,
      entryDate:   r.entry_date,
      entryType:   r.entry_type,
      reference:   r.reference,
      description: r.description,
      creditIn:    parseFloat(r.credit_in),
      debitOut:    parseFloat(r.debit_out),
    })),
    ...salesRows.map((r) => ({
      id:          r.id,
      entryDate:   r.entry_date,
      entryType:   r.entry_type,
      reference:   r.reference,
      description: r.description,
      creditIn:    parseFloat(r.credit_in),
      debitOut:    parseFloat(r.debit_out),
    })),
  ];

  allEntries.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

  const totalCount = allEntries.length;
  const page_entries = allEntries.slice((pg - 1) * lm, pg * lm);

  // Add running balance (simplified — from current balance backward)
  let running = parseFloat(ba.current_balance);
  for (const e of page_entries) {
    e.balance = +running.toFixed(2);
    running = running + e.debitOut - e.creditIn;
  }

  const totalIn  = allEntries.reduce((s, e) => s + e.creditIn,  0);
  const totalOut = allEntries.reduce((s, e) => s + e.debitOut,  0);

  return {
    bankAccount:  { ...ba, currentBalance: parseFloat(ba.current_balance) },
    period:       { startDate: start, endDate: end },
    entries:      page_entries,
    total:        totalCount,
    page:         pg,
    limit:        lm,
    pages:        Math.ceil(totalCount / lm),
    summary:      { totalIn: +totalIn.toFixed(2), totalOut: +totalOut.toFixed(2) },
  };
}

module.exports = { listBankAccounts, getBankAccount, createBankAccount, updateBankAccount, deleteBankAccount, getBankAccountLedger };
