const { query } = require('../../config/database');
const AppError  = require('../../shared/AppError');
const QueryBuilder = require('../../shared/qb');
const { isCompanyWide } = require('../../shared/roles');

// Per-process access-token cache keyed by config_id.
// Tokens are valid for 1 hour; we refresh 60 s early.
const tokenCache = new Map();

// ── Daraja helpers ────────────────────────────────────────────────────────────

const DARAJA_BASE = {
  sandbox:    'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
};

function darajaBase(environment) {
  return DARAJA_BASE[environment] || DARAJA_BASE.sandbox;
}

function mpesaTimestamp() {
  return new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
}

// Normalise Kenyan phone numbers to 2547XXXXXXXX format
function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')   && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9)                              return `254${digits}`;
  return digits; // pass through if already unusual
}

// Fetch the best config for a given branch:
//   1. Branch-specific config (if branchId provided and configured)
//   2. Company-wide fallback (branch_id IS NULL)
async function fetchConfig(companyId, branchId) {
  const { rows } = await query(
    `SELECT * FROM mpesa_config
     WHERE company_id = $1 AND is_active = TRUE
       AND (branch_id = $2 OR branch_id IS NULL)
     ORDER BY branch_id NULLS LAST
     LIMIT 1`,
    [companyId, branchId || null]
  );
  if (!rows.length)
    throw AppError.badRequest(
      'M-Pesa is not configured for this branch. Add credentials under Settings → M-Pesa.',
      'MPESA_NOT_CONFIGURED'
    );
  return rows[0];
}

async function fetchToken(config, { forceRefresh = false } = {}) {
  const cacheKey = config.config_id;
  if (!forceRefresh) {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
  }

  const creds = Buffer.from(
    `${config.consumer_key.trim()}:${config.consumer_secret.trim()}`
  ).toString('base64');

  const res = await fetch(
    `${darajaBase(config.environment)}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${creds}` } }
  );

  const raw  = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = {}; }

  if (!res.ok) {
    console.error('[mpesa-token] OAuth failed:', res.status, raw.slice(0, 200));
    throw AppError.badRequest(
      `M-Pesa OAuth failed (${res.status}): ${data.errorMessage || raw.slice(0, 80)}`,
      'MPESA_AUTH_FAILED'
    );
  }

  const token = (data.access_token || '').trim();
  if (!token) {
    console.error('[mpesa-token] Empty token in response:', raw.slice(0, 200));
    throw AppError.internal('M-Pesa returned an empty access token');
  }

  const ttl = parseInt(data.expires_in, 10) || 3600;
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + (ttl - 120) * 1000, // refresh 2 min before expiry
  });
  return token;
}

function invalidateToken(configId) {
  tokenCache.delete(configId);
}

// Returns true when a Daraja JSON body signals an invalid/expired token
function isTokenError(data) {
  const msg = (data.errorMessage || data.ResultDesc || '').toLowerCase();
  return (
    data.errorCode === '404.001.03' ||
    msg.includes('invalid access token') ||
    msg.includes('access token expired') ||
    msg.includes('invalid credentials') ||
    msg.includes('bad request: invalid credentials')
  );
}

// Thin wrapper: POST to Daraja with automatic token-refresh retry on auth errors
async function darajaPost(url, body, config) {
  const attempt = async (forceRefresh) => {
    const token = await fetchToken(config, { forceRefresh });
    const res   = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:   JSON.stringify(body),
    });
    const raw  = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = {}; }
    return { res, data, raw };
  };

  let { res, data, raw } = await attempt(false);

  // If Daraja rejects the token, evict cache and retry once with a fresh one
  if (isTokenError(data)) {
    console.warn('[mpesa] Token rejected by Daraja — refreshing and retrying');
    invalidateToken(config.config_id);
    ({ res, data, raw } = await attempt(true));
  }

  if (!res.ok && Object.keys(data).length === 0) {
    console.error('[mpesa] Daraja non-JSON response:', res.status, raw.slice(0, 200));
  }

  return { res, data };
}

// ── Config management ─────────────────────────────────────────────────────────

// Returns all branch configs for a company (array, one entry per branch or company-wide)
async function getConfigForCompany(companyId) {
  const { rows } = await query(
    `SELECT mc.config_id, mc.company_id, mc.branch_id, mc.shortcode, mc.shortcode_type,
            mc.environment, mc.callback_url, mc.is_active, mc.created_at, mc.updated_at,
            b.branch_name,
            left(mc.consumer_key,    6) || '***' AS consumer_key,
            left(mc.consumer_secret, 6) || '***' AS consumer_secret,
            left(mc.passkey,         6) || '***' AS passkey
     FROM mpesa_config mc
     LEFT JOIN branches b ON b.branch_id = mc.branch_id
     WHERE mc.company_id = $1
     ORDER BY b.branch_name NULLS FIRST`,
    [companyId]
  );
  return rows;
}

async function saveConfig(companyId, branchId, {
  consumerKey, consumerSecret, shortcode, shortcodeType,
  passkey, environment, callbackUrl,
}) {
  if (!consumerKey || !consumerSecret || !shortcode || !passkey)
    throw AppError.badRequest('consumerKey, consumerSecret, shortcode and passkey are required');

  const bid = branchId || null;

  // Two separate upserts because ON CONFLICT with partial indexes requires matching the predicate
  let rows;
  if (bid) {
    ({ rows } = await query(`
      INSERT INTO mpesa_config
        (company_id, branch_id, consumer_key, consumer_secret, shortcode, shortcode_type,
         passkey, environment, callback_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (company_id, branch_id) WHERE branch_id IS NOT NULL DO UPDATE
        SET consumer_key    = EXCLUDED.consumer_key,
            consumer_secret = EXCLUDED.consumer_secret,
            shortcode       = EXCLUDED.shortcode,
            shortcode_type  = EXCLUDED.shortcode_type,
            passkey         = EXCLUDED.passkey,
            environment     = EXCLUDED.environment,
            callback_url    = EXCLUDED.callback_url,
            is_active       = TRUE,
            updated_at      = now()
      RETURNING config_id, branch_id, shortcode, shortcode_type, environment, is_active
    `, [
      companyId, bid, consumerKey, consumerSecret, shortcode,
      shortcodeType || 'paybill', passkey,
      environment || 'sandbox', callbackUrl || null,
    ]));
  } else {
    ({ rows } = await query(`
      INSERT INTO mpesa_config
        (company_id, consumer_key, consumer_secret, shortcode, shortcode_type,
         passkey, environment, callback_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (company_id) WHERE branch_id IS NULL DO UPDATE
        SET consumer_key    = EXCLUDED.consumer_key,
            consumer_secret = EXCLUDED.consumer_secret,
            shortcode       = EXCLUDED.shortcode,
            shortcode_type  = EXCLUDED.shortcode_type,
            passkey         = EXCLUDED.passkey,
            environment     = EXCLUDED.environment,
            callback_url    = EXCLUDED.callback_url,
            is_active       = TRUE,
            updated_at      = now()
      RETURNING config_id, branch_id, shortcode, shortcode_type, environment, is_active
    `, [
      companyId, consumerKey, consumerSecret, shortcode,
      shortcodeType || 'paybill', passkey,
      environment || 'sandbox', callbackUrl || null,
    ]));
  }

  invalidateToken(rows[0].config_id);
  return rows[0];
}

// ── STK Push ──────────────────────────────────────────────────────────────────

async function initiateSTKPush(companyId, branchId, {
  phone, amount, accountReference, description,
}) {
  if (!phone)                       throw AppError.badRequest('Phone number is required');
  if (!amount || parseFloat(amount) <= 0) throw AppError.badRequest('Amount must be greater than 0');

  const config = await fetchConfig(companyId, branchId);
  const base   = darajaBase(config.environment);
  const ts     = mpesaTimestamp();
  const password = Buffer.from(
    `${config.shortcode.trim()}${config.passkey.trim()}${ts}`
  ).toString('base64');

  const formattedPhone = formatPhone(phone);
  const callbackUrl = (config.callback_url || '').trim()
    || `${(process.env.API_BASE_URL || '').trim() || 'https://your-server.com'}/api/v1/mpesa/callback`;

  const stkBody = {
    BusinessShortCode: config.shortcode.trim(),
    Password:          password,
    Timestamp:         ts,
    TransactionType:   config.shortcode_type === 'till'
      ? 'CustomerBuyGoodsOnline'
      : 'CustomerPayBillOnline',
    Amount:           Math.ceil(parseFloat(amount)),
    PartyA:           formattedPhone,
    PartyB:           config.shortcode.trim(),
    PhoneNumber:      formattedPhone,
    CallBackURL:      callbackUrl,
    AccountReference: String(accountReference || 'POS').slice(0, 12),
    TransactionDesc:  String(description || 'POS Payment').slice(0, 13),
  };

  const { res, data } = await darajaPost(
    `${base}/mpesa/stkpush/v1/processrequest`,
    stkBody,
    config
  );

  if (!res.ok || data.errorCode || (data.ResponseCode && data.ResponseCode !== '0')) {
    const msg = data.errorMessage || data.ResponseDescription || 'STK Push request failed';
    console.error('[mpesa-stk] Failed:', res.status, JSON.stringify(data).slice(0, 200));
    throw AppError.badRequest(msg, 'MPESA_STK_FAILED');
  }

  const { rows } = await query(`
    INSERT INTO mpesa_transactions
      (company_id, branch_id, checkout_request_id, merchant_request_id,
       payment_mode, phone_number, amount, account_reference, description,
       status, stk_response)
    VALUES ($1,$2,$3,$4,'stk_push',$5,$6,$7,$8,'pending',$9)
    RETURNING mpesa_txn_id, checkout_request_id, status
  `, [
    companyId, branchId || null,
    data.CheckoutRequestID, data.MerchantRequestID,
    formattedPhone, parseFloat(amount),
    accountReference || 'POS', description || 'POS Payment',
    JSON.stringify(data),
  ]);

  return {
    mpesaTxnId:        rows[0].mpesa_txn_id,
    checkoutRequestId: data.CheckoutRequestID,
    status:            'pending',
  };
}

// Poll or return DB state for an STK push in progress
async function querySTKStatus(companyId, checkoutRequestId) {
  const { rows: dbRows } = await query(
    `SELECT mpesa_txn_id, branch_id, status, mpesa_receipt_number, amount::numeric,
            failure_reason, completed_at
     FROM mpesa_transactions
     WHERE checkout_request_id = $1 AND company_id = $2`,
    [checkoutRequestId, companyId]
  );
  if (!dbRows.length) throw AppError.notFound('M-Pesa transaction');

  const rec = dbRows[0];
  if (rec.status !== 'pending') {
    return {
      mpesaTxnId:          rec.mpesa_txn_id,
      status:              rec.status,
      mpesaReceiptNumber:  rec.mpesa_receipt_number,
      amount:              parseFloat(rec.amount),
      failureReason:       rec.failure_reason,
    };
  }

  // Still pending — actively query Daraja
  try {
    const config   = await fetchConfig(companyId, rec.branch_id);
    const base     = darajaBase(config.environment);
    const ts       = mpesaTimestamp();
    const password = Buffer.from(
      `${config.shortcode.trim()}${config.passkey.trim()}${ts}`
    ).toString('base64');

    const { data } = await darajaPost(
      `${base}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: config.shortcode.trim(),
        Password:          password,
        Timestamp:         ts,
        CheckoutRequestID: checkoutRequestId,
      },
      config
    );
    const code = String(data.ResultCode ?? '');

    if (code === '0') {
      await query(`
        UPDATE mpesa_transactions
        SET status = 'completed', result_code = $2, completed_at = now(), updated_at = now()
        WHERE checkout_request_id = $1
      `, [checkoutRequestId, code]);
      return {
        mpesaTxnId:         rec.mpesa_txn_id,
        status:             'completed',
        mpesaReceiptNumber: rec.mpesa_receipt_number || null,
        amount:             parseFloat(rec.amount),
      };
    } else if (code !== '' && code !== 'undefined') {
      const newStatus = code === '1032' ? 'cancelled' : 'failed';
      const reason    = data.ResultDesc || null;
      await query(`
        UPDATE mpesa_transactions
        SET status = $2, result_code = $3, failure_reason = $4, completed_at = now(), updated_at = now()
        WHERE checkout_request_id = $1
      `, [checkoutRequestId, newStatus, code, reason]);
      return { mpesaTxnId: rec.mpesa_txn_id, status: newStatus, amount: parseFloat(rec.amount), failureReason: reason };
    }
  } catch {
    // Daraja query failed — return current DB state
  }

  return { mpesaTxnId: rec.mpesa_txn_id, status: 'pending', amount: parseFloat(rec.amount) };
}

// ── Daraja callback (called by M-Pesa server) ─────────────────────────────────

async function processCallback(body) {
  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return;

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = cb;
  const succeeded = ResultCode === 0 || ResultCode === '0';

  let receiptNumber = null;
  if (succeeded && Array.isArray(CallbackMetadata?.Item)) {
    for (const item of CallbackMetadata.Item) {
      if (item.Name === 'MpesaReceiptNumber') receiptNumber = String(item.Value);
    }
  }

  if (succeeded) {
    await query(`
      UPDATE mpesa_transactions
      SET status               = 'completed',
          mpesa_receipt_number = $2,
          result_code          = $3,
          callback_payload     = $4,
          completed_at         = now(),
          updated_at           = now()
      WHERE checkout_request_id = $1 AND status = 'pending'
    `, [CheckoutRequestID, receiptNumber, String(ResultCode), JSON.stringify(body)]);
  } else {
    const newStatus = String(ResultCode) === '1032' ? 'cancelled' : 'failed';
    await query(`
      UPDATE mpesa_transactions
      SET status           = $2,
          result_code      = $3,
          failure_reason   = $4,
          callback_payload = $5,
          completed_at     = now(),
          updated_at       = now()
      WHERE checkout_request_id = $1 AND status = 'pending'
    `, [CheckoutRequestID, newStatus, String(ResultCode), ResultDesc || null, JSON.stringify(body)]);
  }
}

// ── Manual receipt entry ──────────────────────────────────────────────────────

async function recordManualPayment(companyId, branchId, {
  phone, amount, receiptNumber, accountReference, description,
}) {
  if (!receiptNumber || !receiptNumber.trim())
    throw AppError.badRequest('M-Pesa receipt number is required');
  if (!amount || parseFloat(amount) <= 0)
    throw AppError.badRequest('Amount must be greater than 0');

  const receipt = receiptNumber.toUpperCase().trim();

  const { rows: dup } = await query(
    `SELECT 1 FROM mpesa_transactions WHERE company_id = $1 AND mpesa_receipt_number = $2`,
    [companyId, receipt]
  );
  if (dup.length)
    throw AppError.conflict('This M-Pesa receipt number has already been recorded', 'DUPLICATE_RECEIPT');

  const { rows } = await query(`
    INSERT INTO mpesa_transactions
      (company_id, branch_id, payment_mode, phone_number, amount,
       account_reference, description, status, mpesa_receipt_number, completed_at)
    VALUES ($1,$2,'manual',$3,$4,$5,$6,'completed',$7,now())
    RETURNING mpesa_txn_id, status, mpesa_receipt_number, amount::numeric
  `, [
    companyId, branchId || null,
    phone ? formatPhone(phone) : null,
    parseFloat(amount),
    accountReference || 'POS',
    description || 'Manual M-Pesa entry',
    receipt,
  ]);

  return {
    mpesaTxnId:         rows[0].mpesa_txn_id,
    status:             'completed',
    mpesaReceiptNumber: rows[0].mpesa_receipt_number,
    amount:             parseFloat(rows[0].amount),
  };
}

// ── Unlinked payments (received but not yet applied to any sale) ──────────────
// Used by the cashier's "Find Received Payment" lookup in manual mode.
// Returns completed M-Pesa transactions for this company that have no
// sales_transaction_id — i.e. money is sitting there waiting to be matched.

async function listUnlinked(companyId, { amount, hours = 48 } = {}) {
  const qb = new QueryBuilder([companyId]);
  const conditions = [
    `mt.company_id = $1`,
    `mt.status = 'completed'`,
    `mt.sales_transaction_id IS NULL`,
    `mt.completed_at >= now() - ($${qb.add(hours)} || ' hours')::interval`,
  ];

  // When an amount is supplied, match exactly (M-Pesa amounts are always whole KES)
  if (amount !== undefined && amount !== null && amount !== '') {
    conditions.push(`mt.amount = $${qb.add(Math.round(parseFloat(amount)))}`);
  }

  const { rows } = await query(`
    SELECT
      mt.mpesa_txn_id,
      mt.mpesa_receipt_number,
      mt.phone_number,
      mt.amount::numeric,
      mt.payment_mode,
      mt.account_reference,
      mt.completed_at
    FROM mpesa_transactions mt
    WHERE ${conditions.join(' AND ')}
    ORDER BY mt.completed_at DESC
    LIMIT 30
  `, qb.params);

  return rows.map((r) => ({
    mpesa_txn_id:         r.mpesa_txn_id,
    mpesa_receipt_number: r.mpesa_receipt_number,
    phone_number:         r.phone_number,
    amount:               parseFloat(r.amount),
    payment_mode:         r.payment_mode,
    account_reference:    r.account_reference,
    completed_at:         r.completed_at,
  }));
}

// ── Link M-Pesa txn to a completed sale ──────────────────────────────────────

async function linkToSale(mpesaTxnId, salesTransactionId) {
  if (!salesTransactionId) throw AppError.badRequest('salesTransactionId is required');
  if (!mpesaTxnId)         throw AppError.badRequest('mpesaTxnId is required');
  const { rowCount } = await query(
    `UPDATE mpesa_transactions
     SET sales_transaction_id = $2, updated_at = now()
     WHERE mpesa_txn_id = $1`,
    [mpesaTxnId, salesTransactionId]
  );
  if (rowCount === 0)
    console.warn('[mpesa] linkToSale: no row matched mpesaTxnId', mpesaTxnId);
}

// ── Transaction listing ───────────────────────────────────────────────────────

async function listTransactions(companyId, role, branchIds, filters = {}) {
  const {
    branchId, status, paymentMode, startDate, endDate, search,
    page = 1, limit = 25,
  } = filters;

  const qb = new QueryBuilder([companyId]);
  const conditions = ['mt.company_id = $1'];

  if (!isCompanyWide(role)) {
    const ids = branchIds?.length ? branchIds : ['00000000-0000-0000-0000-000000000000'];
    conditions.push(`(mt.branch_id = ANY($${qb.add(ids)}) OR mt.branch_id IS NULL)`);
  } else if (branchId) {
    conditions.push(`mt.branch_id = $${qb.add(branchId)}`);
  }

  if (status)      conditions.push(`mt.status = $${qb.add(status)}`);
  if (paymentMode) conditions.push(`mt.payment_mode = $${qb.add(paymentMode)}`);
  if (startDate)   conditions.push(`mt.initiated_at::date >= $${qb.add(startDate)}`);
  if (endDate)     conditions.push(`mt.initiated_at::date <= $${qb.add(endDate)}`);
  if (search) {
    const p = qb.add(`%${search}%`);
    conditions.push(
      `(mt.mpesa_receipt_number ILIKE $${p} OR mt.phone_number ILIKE $${p}` +
      ` OR st.transaction_number ILIKE $${p})`
    );
  }

  const pg     = Math.max(1, parseInt(page, 10));
  const lm     = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const limIdx = qb.add(lm);
  const offIdx = qb.add((pg - 1) * lm);

  const { rows } = await query(`
    SELECT
      mt.mpesa_txn_id,
      mt.payment_mode,
      mt.phone_number,
      mt.amount::numeric,
      mt.mpesa_receipt_number,
      mt.account_reference,
      mt.status,
      mt.failure_reason,
      mt.initiated_at,
      mt.completed_at,
      b.branch_name,
      st.transaction_number AS sale_number,
      COUNT(*) OVER() AS total_count
    FROM mpesa_transactions mt
    LEFT JOIN branches b           ON b.branch_id             = mt.branch_id
    LEFT JOIN sales_transactions st ON st.transaction_id       = mt.sales_transaction_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY mt.initiated_at DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `, qb.params);

  const total = rows.length ? parseInt(rows[0].total_count) : 0;

  return {
    transactions: rows.map((r) => ({
      mpesa_txn_id:         r.mpesa_txn_id,
      payment_mode:         r.payment_mode,
      phone_number:         r.phone_number,
      amount:               parseFloat(r.amount),
      mpesa_receipt_number: r.mpesa_receipt_number,
      account_reference:    r.account_reference,
      status:               r.status,
      failure_reason:       r.failure_reason,
      initiated_at:         r.initiated_at,
      completed_at:         r.completed_at,
      branch_name:          r.branch_name,
      sale_number:          r.sale_number,
    })),
    total, page: pg, limit: lm,
    pages: Math.max(1, Math.ceil(total / lm)),
  };
}

module.exports = {
  getConfigForCompany, saveConfig,
  initiateSTKPush, querySTKStatus, processCallback,
  recordManualPayment, listUnlinked, linkToSale,
  listTransactions,
};
