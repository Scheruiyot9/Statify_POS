-- =============================================================================
-- 28. Journal Entries (Double-Entry Ledger)
-- =============================================================================

-- Entry number counter on companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS je_counter INTEGER NOT NULL DEFAULT 0;

-- Journal entry header
CREATE TABLE IF NOT EXISTS journal_entries (
  journal_entry_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID         NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  entry_number       VARCHAR(30)  NOT NULL,
  entry_date         DATE         NOT NULL,
  description        TEXT,
  source_type        VARCHAR(30)  NOT NULL DEFAULT 'MANUAL',
  -- SALE | GRN | PAYMENT | PAYMENT_VOID | RETURN | OPENING | MANUAL | VOID
  source_id          UUID,
  status             VARCHAR(20)  NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  created_by_user_id UUID,
  voided_by_user_id  UUID,
  voided_at          TIMESTAMPTZ,
  void_reason        TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Journal entry lines (Dr/Cr pairs)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  line_id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id   UUID          NOT NULL REFERENCES journal_entries(journal_entry_id) ON DELETE CASCADE,
  account_id         UUID          NOT NULL REFERENCES accounts(account_id),
  description        TEXT,
  debit              NUMERIC(15,4) NOT NULL DEFAULT 0,
  credit             NUMERIC(15,4) NOT NULL DEFAULT 0,
  line_order         INTEGER       NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT chk_dr_cr CHECK (
    debit  >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_je_company    ON journal_entries (company_id);
CREATE INDEX IF NOT EXISTS idx_je_date       ON journal_entries (company_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_source     ON journal_entries (company_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_jel_entry     ON journal_entry_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account   ON journal_entry_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_jel_acct_date ON journal_entry_lines (account_id, journal_entry_id);
