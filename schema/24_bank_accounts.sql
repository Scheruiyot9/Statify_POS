-- =============================================================================
-- 24. Bank Accounts
-- =============================================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  bank_account_id UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID          NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  branch_id       UUID          REFERENCES branches(branch_id),
  account_id      UUID          REFERENCES accounts(account_id),
  account_name    VARCHAR(100)  NOT NULL,
  bank_name       VARCHAR(100)  NOT NULL,
  account_number  VARCHAR(50),
  bank_branch     VARCHAR(100),
  currency        VARCHAR(3)    NOT NULL DEFAULT 'KES',
  opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  is_default      BOOLEAN       NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company ON bank_accounts (company_id);
