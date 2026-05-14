-- =============================================================================
-- 30. Rename journal_entry_lines → ledger_entry_lines
--     Add entity linkage columns (entity_type, entity_id) for sub-ledger drill-down
-- =============================================================================

-- Step 1: Rename the table (idempotent — handles re-runs of migration 28)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledger_entry_lines') THEN
    -- Already renamed; drop any empty journal_entry_lines re-created by migration 28 re-run
    DROP TABLE IF EXISTS journal_entry_lines;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entry_lines') THEN
    ALTER TABLE journal_entry_lines RENAME TO ledger_entry_lines;
  END IF;
END $$;

-- Step 2: Add entity linkage columns
ALTER TABLE ledger_entry_lines
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30)
    CHECK (entity_type IN ('customer','supplier','bank_account','employee','product') OR entity_type IS NULL),
  ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Step 3: Index for sub-ledger queries (e.g. "all lines for customer X")
CREATE INDEX IF NOT EXISTS idx_lel_entity
  ON ledger_entry_lines (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- Step 4: Rename legacy indexes to match new table name (safe, idempotent)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_jel_entry') THEN
    ALTER INDEX idx_jel_entry RENAME TO idx_lel_entry;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_jel_account') THEN
    ALTER INDEX idx_jel_account RENAME TO idx_lel_account;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_jel_acct_date') THEN
    ALTER INDEX idx_jel_acct_date RENAME TO idx_lel_acct_date;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_jel_unreconciled') THEN
    ALTER INDEX idx_jel_unreconciled RENAME TO idx_lel_unreconciled;
  END IF;
END $$;
