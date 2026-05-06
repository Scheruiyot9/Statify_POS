-- =============================================================================
-- 11_p1_fixes.sql
-- Atomic transaction counters, offline idempotency, and refresh token sessions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Companies — atomic per-company transaction counter (eliminates COUNT race)
-- -----------------------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS txn_counter BIGINT NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- Sales Transactions — idempotency key for offline sync deduplication
-- -----------------------------------------------------------------------------
ALTER TABLE sales_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_txn_idempotency
  ON sales_transactions (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- User Sessions — server-side refresh token tracking for revocation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  revoked_reason  VARCHAR(50),

  CONSTRAINT uq_user_session_token UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user    ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_hash    ON user_sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions (expires_at) WHERE revoked_at IS NULL;
