-- =============================================================================
-- 29. Bank Reconciliation columns on journal_entry_lines
-- =============================================================================

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS is_reconciled         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reconciled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by_user_id UUID        REFERENCES users(user_id);

CREATE INDEX IF NOT EXISTS idx_jel_unreconciled
  ON journal_entry_lines (account_id, is_reconciled)
  WHERE NOT is_reconciled;
