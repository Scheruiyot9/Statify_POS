-- M-Pesa integration tables
-- Run via: node src/scripts/migrate.js  (added to FILES_IN_ORDER)

-- Per-company M-Pesa / Daraja API credentials
CREATE TABLE IF NOT EXISTS mpesa_config (
  config_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID         NOT NULL UNIQUE REFERENCES companies(company_id) ON DELETE CASCADE,
  consumer_key     TEXT         NOT NULL,
  consumer_secret  TEXT         NOT NULL,
  shortcode        TEXT         NOT NULL,
  shortcode_type   TEXT         NOT NULL DEFAULT 'paybill',  -- 'paybill' | 'till'
  passkey          TEXT         NOT NULL,
  callback_url     TEXT,                                     -- public HTTPS URL for Daraja callbacks
  environment      TEXT         NOT NULL DEFAULT 'sandbox',  -- 'sandbox' | 'production'
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- All M-Pesa payment attempts (STK push and manual code entry)
-- Linked to sales_transactions after a sale is committed
CREATE TABLE IF NOT EXISTS mpesa_transactions (
  mpesa_txn_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID         NOT NULL REFERENCES companies(company_id),
  branch_id             UUID         REFERENCES branches(branch_id),

  -- Daraja STK push identifiers (null for manual entries)
  checkout_request_id   TEXT         UNIQUE,
  merchant_request_id   TEXT,

  -- Resolved payment details (populated by Daraja callback or manual entry)
  mpesa_receipt_number  TEXT,
  payment_mode          TEXT         NOT NULL DEFAULT 'stk_push',  -- 'stk_push' | 'manual'
  phone_number          TEXT,
  amount                NUMERIC(12,2) NOT NULL,
  account_reference     TEXT,
  description           TEXT,

  -- Status lifecycle: pending → completed | failed | cancelled | timeout
  status                TEXT         NOT NULL DEFAULT 'pending',
  failure_reason        TEXT,
  result_code           TEXT,

  -- Back-link to the POS sale (set after the sale transaction is committed)
  sales_transaction_id  UUID         REFERENCES sales_transactions(transaction_id) ON DELETE SET NULL,

  -- Raw Daraja API payloads for audit / debugging
  stk_response          JSONB,
  callback_payload      JSONB,

  initiated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_txn_company    ON mpesa_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_txn_branch     ON mpesa_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_txn_status     ON mpesa_transactions(status);
CREATE INDEX IF NOT EXISTS idx_mpesa_txn_checkout   ON mpesa_transactions(checkout_request_id) WHERE checkout_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpesa_txn_receipt    ON mpesa_transactions(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpesa_txn_sales      ON mpesa_transactions(sales_transaction_id) WHERE sales_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpesa_txn_initiated  ON mpesa_transactions(company_id, initiated_at DESC);
