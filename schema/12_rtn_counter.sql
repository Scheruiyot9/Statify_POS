-- =============================================================================
-- 12_rtn_counter.sql
-- Adds atomic return counter to companies, matching the txn_counter pattern.
-- =============================================================================
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS rtn_counter BIGINT NOT NULL DEFAULT 0;
