const { query, transaction } = require('../../config/database');
const AppError = require('../../shared/AppError');
const jrn = require('../journal/journal.service');

async function listPayments(companyId, { supplierId, fromDate, toDate, page = 1, limit = 25 } = {}) {
  const pg = parseInt(page, 10);
  const lm = parseInt(limit, 10);
  const conds = ['sp.company_id = $1', 'sp.is_void = FALSE'];
  const vals  = [companyId];

  if (supplierId) { vals.push(supplierId); conds.push(`sp.supplier_id = $${vals.length}`); }
  if (fromDate)   { vals.push(fromDate);   conds.push(`sp.payment_date >= $${vals.length}`); }
  if (toDate)     { vals.push(toDate);     conds.push(`sp.payment_date <= $${vals.length}`); }

  vals.push(lm, (pg - 1) * lm);
  const { rows } = await query(`
    SELECT sp.payment_id, sp.payment_date, sp.amount, sp.payment_method,
           sp.reference_number, sp.notes, sp.created_at,
           s.supplier_name, s.supplier_id,
           b.branch_name,
           ba.account_name AS bank_account_name,
           po.po_number,
           u.first_name || ' ' || u.last_name AS created_by,
           COUNT(*) OVER() AS total_count
    FROM supplier_payments sp
    JOIN suppliers    s  ON s.supplier_id       = sp.supplier_id
    JOIN branches     b  ON b.branch_id         = sp.branch_id
    LEFT JOIN bank_accounts ba ON ba.bank_account_id = sp.bank_account_id
    LEFT JOIN purchase_orders po ON po.po_id    = sp.po_id
    LEFT JOIN users   u  ON u.user_id           = sp.created_by_user_id
    WHERE ${conds.join(' AND ')}
    ORDER BY sp.payment_date DESC, sp.created_at DESC
    LIMIT $${vals.length - 1} OFFSET $${vals.length}
  `, vals);

  const total = rows.length ? parseInt(rows[0].total_count) : 0;
  return { payments: rows.map(({ total_count, ...r }) => r), total, page: pg, limit: lm, pages: Math.ceil(total / lm) };
}

async function getPayment(companyId, paymentId) {
  const { rows: [payment] } = await query(`
    SELECT sp.*,
           s.supplier_name, s.email AS supplier_email, s.phone AS supplier_phone,
           b.branch_name,
           ba.account_name AS bank_account_name, ba.bank_name, ba.account_number,
           po.po_number,
           u.first_name || ' ' || u.last_name AS created_by
    FROM supplier_payments sp
    JOIN suppliers    s  ON s.supplier_id       = sp.supplier_id
    JOIN branches     b  ON b.branch_id         = sp.branch_id
    LEFT JOIN bank_accounts ba ON ba.bank_account_id = sp.bank_account_id
    LEFT JOIN purchase_orders po ON po.po_id    = sp.po_id
    LEFT JOIN users   u  ON u.user_id           = sp.created_by_user_id
    WHERE sp.payment_id = $1 AND sp.company_id = $2
  `, [paymentId, companyId]);
  if (!payment) throw AppError.notFound('Payment');
  return payment;
}

async function createPayment(companyId, userId, data) {
  const { branch_id, supplier_id, bank_account_id, po_id,
          payment_date, amount, payment_method, reference_number, notes } = data;

  if (!branch_id)   throw AppError.badRequest('branch_id is required');
  if (!supplier_id) throw AppError.badRequest('supplier_id is required');
  if (!amount || parseFloat(amount) <= 0) throw AppError.badRequest('Amount must be greater than zero');

  // Verify supplier belongs to this company
  const { rows: [supplier] } = await query(
    `SELECT supplier_id, current_balance FROM suppliers WHERE supplier_id=$1 AND company_id=$2`,
    [supplier_id, companyId]
  );
  if (!supplier) throw AppError.notFound('Supplier');

  // Optional: verify PO belongs to company and supplier
  if (po_id) {
    const { rows: [po] } = await query(
      `SELECT po_id FROM purchase_orders WHERE po_id=$1 AND company_id=$2 AND supplier_id=$3`,
      [po_id, companyId, supplier_id]
    );
    if (!po) throw AppError.badRequest('PO not found or does not belong to this supplier');
  }

  // Optional: verify bank account belongs to company
  if (bank_account_id) {
    const { rows: [ba] } = await query(
      `SELECT bank_account_id FROM bank_accounts WHERE bank_account_id=$1 AND company_id=$2`,
      [bank_account_id, companyId]
    );
    if (!ba) throw AppError.badRequest('Bank account not found');
  }

  return transaction(async (client) => {
    const { rows: [payment] } = await client.query(`
      INSERT INTO supplier_payments
        (company_id, branch_id, supplier_id, bank_account_id, po_id,
         payment_date, amount, payment_method, reference_number, notes, created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [companyId, branch_id, supplier_id, bank_account_id || null, po_id || null,
        payment_date || new Date().toISOString().slice(0, 10),
        parseFloat(amount), payment_method || 'bank_transfer',
        reference_number || null, notes || null, userId]);

    // Reduce supplier AP balance
    await client.query(
      `UPDATE suppliers SET current_balance = current_balance - $1 WHERE supplier_id = $2`,
      [parseFloat(amount), supplier_id]
    );

    // Debit bank account if provided
    if (bank_account_id) {
      await client.query(
        `UPDATE bank_accounts SET current_balance = current_balance - $1 WHERE bank_account_id = $2`,
        [parseFloat(amount), bank_account_id]
      );
    }

    // Post double-entry journal for this payment
    await jrn.postPaymentEntry(client, companyId, payment);

    return payment;
  });
}

async function voidPayment(companyId, paymentId, userId) {
  const { rows: [payment] } = await query(
    `SELECT * FROM supplier_payments WHERE payment_id=$1 AND company_id=$2`,
    [paymentId, companyId]
  );
  if (!payment) throw AppError.notFound('Payment');
  if (payment.is_void) throw AppError.conflict('Payment is already voided');

  return transaction(async (client) => {
    await client.query(`
      UPDATE supplier_payments
      SET is_void=TRUE, voided_at=now(), voided_by_user_id=$2
      WHERE payment_id=$1
    `, [paymentId, userId]);

    // Reverse AP balance reduction
    await client.query(
      `UPDATE suppliers SET current_balance = current_balance + $1 WHERE supplier_id = $2`,
      [parseFloat(payment.amount), payment.supplier_id]
    );

    // Reverse bank account debit if applicable
    if (payment.bank_account_id) {
      await client.query(
        `UPDATE bank_accounts SET current_balance = current_balance + $1 WHERE bank_account_id = $2`,
        [parseFloat(payment.amount), payment.bank_account_id]
      );
    }

    // Post reversal journal entry
    await jrn.postVoidPaymentEntry(client, companyId, payment, userId);

    return { payment_id: paymentId, voided: true };
  });
}

module.exports = { listPayments, getPayment, createPayment, voidPayment };
