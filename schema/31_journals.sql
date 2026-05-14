-- Operational journal document table (accountant-created manual entries)
-- When posted, writes to journal_entries + ledger_entry_lines via the ledger engine.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS journal_counter INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS journals (
  journal_id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID            NOT NULL REFERENCES companies(company_id),
  branch_id           UUID            REFERENCES branches(branch_id),
  journal_number      VARCHAR(30)     NOT NULL,
  entry_date          DATE            NOT NULL,
  description         TEXT,
  reference           VARCHAR(100),
  status              VARCHAR(10)     NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'posted', 'void')),
  -- Link back to the ledger entry created on post
  ledger_entry_id     UUID            REFERENCES journal_entries(journal_entry_id),
  -- Audit trail
  created_by_user_id  UUID            REFERENCES users(user_id),
  posted_by_user_id   UUID            REFERENCES users(user_id),
  posted_at           TIMESTAMPTZ,
  voided_by_user_id   UUID            REFERENCES users(user_id),
  voided_at           TIMESTAMPTZ,
  void_reason         TEXT,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Lines of the journal document (separate from ledger_entry_lines)
CREATE TABLE IF NOT EXISTS journal_lines (
  journal_line_id UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id      UUID          NOT NULL REFERENCES journals(journal_id) ON DELETE CASCADE,
  account_id      UUID          NOT NULL REFERENCES accounts(account_id),
  description     TEXT,
  debit           NUMERIC(15,4) NOT NULL DEFAULT 0,
  credit          NUMERIC(15,4) NOT NULL DEFAULT 0,
  entity_type     VARCHAR(30)   CHECK (
                    entity_type IN ('customer','supplier','bank_account','employee','product')
                    OR entity_type IS NULL),
  entity_id       UUID,
  line_order      INT           NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_journals_company   ON journals      (company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_lines_jrnl ON journal_lines (journal_id);
