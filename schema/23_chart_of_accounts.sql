-- =============================================================================
-- 23. Chart of Accounts
-- =============================================================================

CREATE TABLE IF NOT EXISTS accounts (
  account_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID         NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  account_code      VARCHAR(20)  NOT NULL,
  account_name      VARCHAR(100) NOT NULL,
  account_type      VARCHAR(20)  NOT NULL
    CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  account_subtype   VARCHAR(50),
  parent_account_id UUID         REFERENCES accounts(account_id),
  description       TEXT,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  is_system         BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (company_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts (company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type    ON accounts (company_id, account_type);
