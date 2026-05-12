-- Persisted STK push sessions so callbacks survive server restarts.
-- Rows are deleted when the callback is processed or auto-expire after 1 hour.
CREATE TABLE IF NOT EXISTS stk_sessions (
  checkout_request_id  TEXT         PRIMARY KEY,
  company_id           UUID         NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  branch_id            UUID         REFERENCES branches(branch_id) ON DELETE SET NULL,
  phone                TEXT,
  amount               NUMERIC(12,2) NOT NULL,
  account_reference    TEXT,
  description          TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stk_sessions_created ON stk_sessions(created_at);
