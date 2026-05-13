const { query, transaction } = require('../../config/database');
const AppError = require('../../shared/AppError');
const { isCompanyWide } = require('../../shared/roles');
const QueryBuilder = require('../../shared/qb');

// ── Return Reasons ────────────────────────────────────────────────────────────

async function listReturnReasons(companyId) {
  const { rows } = await query(
    `SELECT reason_id, reason_code, reason_name, restock_by_default, is_active
     FROM return_reasons
     WHERE company_id = $1
     ORDER BY reason_name`,
    [companyId]
  );
  return rows;
}

// ── Returns ───────────────────────────────────────────────────────────────────

async function listReturns(companyId, role, branchIds, filters = {}) {
  const { branchId, search, status, startDate, endDate, page = 1, limit = 25 } = filters;
  const isWide = isCompanyWide(role);

  const qb = new QueryBuilder([companyId]);
  const conditions = ['r.company_id = $1'];

  if (!isWide) {
    const ids = branchIds?.length ? branchIds : ['00000000-0000-0000-0000-000000000000'];
    conditions.push(`r.branch_id = ANY($${qb.add(ids)})`);
  } else if (branchId) {
    conditions.push(`r.branch_id = $${qb.add(branchId)}`);
  }

  if (status) conditions.push(`r.status = $${qb.add(status)}`);
  if (search) {
    const p = qb.add(`%${search}%`);
    conditions.push(`(r.return_number ILIKE $${p} OR st.transaction_number ILIKE $${p})`);
  }
  if (startDate) conditions.push(`r.return_date::date >= $${qb.add(startDate)}`);
  if (endDate)   conditions.push(`r.return_date::date <= $${qb.add(endDate)}`);

  const pg = parseInt(page, 10);
  const lm = parseInt(limit, 10);
  const limIdx = qb.add(lm);
  const offIdx = qb.add((pg - 1) * lm);

  const { rows } = await query(`
    SELECT
      r.return_id, r.return_number, r.return_date, r.status,
      r.total_refunded::numeric, r.subtotal_refunded::numeric,
      r.requires_approval, r.approved_at,
      st.transaction_number AS original_transaction_number,
      b.branch_name,
      u.first_name || ' ' || u.last_name AS processed_by,
      COUNT(*) OVER() AS total_count
    FROM returns r
    JOIN sales_transactions st ON st.transaction_id = r.original_transaction_id
    JOIN branches b ON b.branch_id = r.branch_id
    JOIN users u ON u.user_id = r.processed_by_user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.return_date DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);

  const total = rows.length ? parseInt(rows[0].total_count) : 0;
  return {
    returns: rows.map((r) => ({
      return_id:                    r.return_id,
      return_number:                r.return_number,
      return_date:                  r.return_date,
      status:                       r.status,
      total_refunded:               parseFloat(r.total_refunded),
      subtotal_refunded:            parseFloat(r.subtotal_refunded),
      requires_approval:            r.requires_approval,
      approved_at:                  r.approved_at,
      original_transaction_number:  r.original_transaction_number,
      branch_name:                  r.branch_name,
      processed_by:                 r.processed_by,
    })),
    total, page: pg, limit: lm, pages: Math.ceil(total / lm),
  };
}

async function getReturn(companyId, returnId, role, branchIds = []) {
  const params = [companyId, returnId];
  const conditions = ['r.company_id = $1', 'r.return_id = $2'];

  if (!isCompanyWide(role)) {
    params.push(branchIds?.length ? branchIds : ['00000000-0000-0000-0000-000000000000']);
    conditions.push(`r.branch_id = ANY($${params.length})`);
  }

  const { rows } = await query(`
    SELECT r.*,
      r.total_refunded::numeric, r.subtotal_refunded::numeric, r.tax_refunded::numeric,
      st.transaction_number AS original_transaction_number,
      st.total_amount::numeric AS original_total,
      b.branch_name,
      u.first_name || ' ' || u.last_name AS processed_by,
      au.first_name || ' ' || au.last_name AS approved_by
    FROM returns r
    JOIN sales_transactions st ON st.transaction_id = r.original_transaction_id
    JOIN branches b ON b.branch_id = r.branch_id
    JOIN users u ON u.user_id = r.processed_by_user_id
    LEFT JOIN users au ON au.user_id = r.approved_by_user_id
    WHERE ${conditions.join(' AND ')}
  `, params);

  if (!rows.length) throw AppError.notFound('Return');
  const ret = rows[0];

  const [itemsRes, refundsRes] = await Promise.all([
    query(`
      SELECT ri.*,
        ri.quantity_returned::numeric, ri.unit_price_at_sale::numeric,
        ri.line_refund_amount::numeric,
        p.product_name, p.sku,
        rr.reason_name
      FROM return_items ri
      JOIN products p ON p.product_id = ri.product_id
      LEFT JOIN return_reasons rr ON rr.reason_id = ri.return_reason_id
      WHERE ri.return_id = $1
    `, [returnId]),
    query(`
      SELECT rf.refund_id, rf.amount_refunded::numeric, rf.reference_number,
        rf.issued_as_store_credit, rf.created_at, pm.method_name
      FROM return_refunds rf
      JOIN payment_methods pm ON pm.payment_method_id = rf.payment_method_id
      WHERE rf.return_id = $1
    `, [returnId]),
  ]);

  return { ...ret, items: itemsRes.rows, refunds: refundsRes.rows };
}

async function createReturn(companyId, branchId, userId, data) {
  const {
    originalTransactionId,
    returnReasonId,
    customerNotes,
    internalNotes,
    posSessionId,
    items,   // [{ originalItemId, productId, quantityReturned, returnToInventory, itemCondition, returnReasonId, lineNotes }]
    refunds, // [{ paymentMethodId, amountRefunded, referenceNumber, issuedAsStoreCredit }]
    requiresApproval = false,
  } = data;

  if (!originalTransactionId) throw AppError.badRequest('originalTransactionId is required');
  if (!items?.length)          throw AppError.badRequest('At least one return item is required');
  if (!refunds?.length)        throw AppError.badRequest('At least one refund method is required');

  return transaction(async (client) => {
    // Validate original transaction belongs to this company/branch
    const { rows: txnRows } = await client.query(
      `SELECT transaction_id, branch_id, status FROM sales_transactions
       WHERE transaction_id = $1 AND company_id = $2`,
      [originalTransactionId, companyId]
    );
    if (!txnRows.length) throw AppError.notFound('Original transaction');
    if (txnRows[0].status === 'void') throw AppError.conflict('Cannot return a voided transaction');

    const { rows: ctrRows } = await client.query(
      `UPDATE companies SET rtn_counter = rtn_counter + 1 WHERE company_id = $1 RETURNING rtn_counter`,
      [companyId]
    );
    const returnNumber = `RTN-${new Date().getFullYear()}-${String(ctrRows[0].rtn_counter).padStart(6, '0')}`;

    // Validate each return item against the original sale
    for (const item of items) {
      const { rows: origItem } = await client.query(
        `SELECT sti.quantity::numeric, sti.unit_price::numeric, sti.tax_amount::numeric,
                sti.discount::numeric, sti.line_total::numeric,
                COALESCE(
                  (SELECT SUM(ri2.quantity_returned)
                   FROM return_items ri2
                   JOIN returns r2 ON r2.return_id = ri2.return_id
                   WHERE ri2.original_item_id = sti.item_id
                     AND r2.status NOT IN ('rejected')
                  ), 0
                )::numeric AS already_returned
         FROM sales_transaction_items sti
         WHERE sti.item_id = $1 AND sti.transaction_id = $2`,
        [item.originalItemId, originalTransactionId]
      );
      if (!origItem.length) throw AppError.badRequest(`Item ${item.originalItemId} not found on original transaction`);

      const maxReturnable = parseFloat(origItem[0].quantity) - parseFloat(origItem[0].already_returned);
      if (parseFloat(item.quantityReturned) > maxReturnable) {
        throw AppError.badRequest(
          `Cannot return more than available quantity (max: ${maxReturnable})`
        );
      }
    }

    // Calculate totals
    const subtotalRefunded = items.reduce((s, i) => s + parseFloat(i.lineRefundAmount || 0), 0);
    const totalRefunded    = refunds.reduce((s, r) => s + parseFloat(r.amountRefunded), 0);

    const { rows: [ret] } = await client.query(`
      INSERT INTO returns (
        company_id, branch_id, return_number, original_transaction_id,
        processed_by_user_id, pos_session_id, return_reason_id,
        customer_notes, internal_notes, requires_approval,
        subtotal_refunded, total_refunded,
        status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING return_id, return_number, return_date, status
    `, [
      companyId, branchId, returnNumber, originalTransactionId,
      userId, posSessionId || null, returnReasonId || null,
      customerNotes || null, internalNotes || null,
      requiresApproval,
      subtotalRefunded, totalRefunded,
      requiresApproval ? 'pending' : 'approved',
    ]);

    for (const item of items) {
      await client.query(`
        INSERT INTO return_items (
          return_id, original_item_id, product_id, quantity_returned,
          unit_price_at_sale, unit_tax_at_sale, unit_discount_at_sale,
          line_refund_amount, return_to_inventory, item_condition,
          return_reason_id, line_notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [
        ret.return_id, item.originalItemId, item.productId,
        item.quantityReturned,
        item.unitPriceAtSale   || 0,
        item.unitTaxAtSale     || 0,
        item.unitDiscountAtSale || 0,
        item.lineRefundAmount  || 0,
        item.returnToInventory !== false,
        item.itemCondition     || 'resellable',
        item.returnReasonId    || null,
        item.lineNotes         || null,
      ]);
    }

    for (const refund of refunds) {
      await client.query(`
        INSERT INTO return_refunds (return_id, payment_method_id, amount_refunded, reference_number, issued_as_store_credit)
        VALUES ($1,$2,$3,$4,$5)
      `, [
        ret.return_id, refund.paymentMethodId, refund.amountRefunded,
        refund.referenceNumber || null,
        refund.issuedAsStoreCredit || false,
      ]);
    }

    // If auto-approved, inventory restock is handled by DB trigger trg_restock_on_return_approval
    return { return_id: ret.return_id, return_number: ret.return_number, status: ret.status };
  });
}

async function approveReturn(companyId, returnId, userId, approvalNotes) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT return_id, status FROM returns WHERE return_id = $1 AND company_id = $2 FOR UPDATE`,
      [returnId, companyId]
    );
    if (!rows.length)              throw AppError.notFound('Return');
    if (rows[0].status !== 'pending') throw AppError.conflict(`Return is already ${rows[0].status}`);

    await client.query(`
      UPDATE returns
      SET status             = 'approved',
          approved_by_user_id = $2,
          approved_at         = now(),
          approval_notes      = $3,
          updated_at          = now()
      WHERE return_id = $1
    `, [returnId, userId, approvalNotes || null]);

    return { return_id: returnId, status: 'approved' };
  });
}

async function rejectReturn(companyId, returnId, userId, rejectionNotes) {
  const { rows } = await query(
    `UPDATE returns
     SET status = 'rejected', approved_by_user_id = $2,
         approved_at = now(), approval_notes = $3, updated_at = now()
     WHERE return_id = $1 AND company_id = $4 AND status = 'pending'
     RETURNING return_id`,
    [returnId, userId, rejectionNotes || null, companyId]
  );
  if (!rows.length) throw AppError.conflict('Return not found or not in pending status');
  return { return_id: returnId, status: 'rejected' };
}

async function markRefunded(companyId, returnId, userId, refundNotes) {
  const { rows } = await query(
    `UPDATE returns
     SET status             = 'refunded',
         refunded_by_user_id = $2,
         refunded_at         = now(),
         refund_notes        = $3,
         updated_at          = now()
     WHERE return_id = $1
       AND company_id = $4
       AND status = 'approved'
     RETURNING return_id`,
    [returnId, userId, refundNotes || null, companyId]
  );
  if (!rows.length) throw AppError.conflict('Return not found or not in approved status');
  return { return_id: returnId, status: 'refunded' };
}

module.exports = {
  listReturnReasons,
  listReturns,
  getReturn,
  createReturn,
  approveReturn,
  rejectReturn,
  markRefunded,
};
