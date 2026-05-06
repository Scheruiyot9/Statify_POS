-- =============================================================================
-- P0.2 — POS Terminals & Sessions (Shift Management)
-- The original design mentions "cash float requirements" under branch capabilities
-- but provides no entity. Without sessions, cash reconciliation is impossible.
--
-- Flow:
--   Open terminal → Open session (count opening float) → Process transactions
--   → Close session (count closing cash) → Reconcile → Supervisor approves
-- =============================================================================


-- -----------------------------------------------------------------------------
-- POS_Terminals
-- A physical or virtual device at a branch. Multiple terminals can be open
-- simultaneously (e.g., 3 checkout lanes at one branch).
-- -----------------------------------------------------------------------------
CREATE TABLE pos_terminals (
    terminal_id         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID            NOT NULL REFERENCES branches(branch_id),
    company_id          UUID            NOT NULL REFERENCES companies(company_id),
    terminal_name       VARCHAR(100)    NOT NULL,   -- e.g. "Till 1", "Counter A"
    terminal_code       VARCHAR(20)     NOT NULL,
    description         TEXT,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_terminal_code_per_branch UNIQUE (branch_id, terminal_code)
);

CREATE INDEX idx_terminals_branch ON pos_terminals (branch_id, is_active);


-- -----------------------------------------------------------------------------
-- POS_Sessions
-- One session = one cashier's shift on one terminal.
-- A terminal can only have ONE open session at a time (enforced by partial index).
-- -----------------------------------------------------------------------------
CREATE TABLE pos_sessions (
    session_id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID            NOT NULL REFERENCES companies(company_id),
    branch_id               UUID            NOT NULL REFERENCES branches(branch_id),
    terminal_id             UUID            NOT NULL REFERENCES pos_terminals(terminal_id),
    cashier_user_id         UUID            NOT NULL REFERENCES users(user_id),

    -- Opening
    session_start           TIMESTAMPTZ     NOT NULL DEFAULT now(),
    opening_cash_amount     NUMERIC(15, 2)  NOT NULL DEFAULT 0,  -- float counted at open
    opening_notes           TEXT,
    opened_by_user_id       UUID            REFERENCES users(user_id),  -- supervisor who approved open

    -- Closing (populated when cashier closes session)
    session_end             TIMESTAMPTZ,
    closing_cash_counted    NUMERIC(15, 2),  -- physical cash count by cashier
    closing_notes           TEXT,
    closed_by_user_id       UUID            REFERENCES users(user_id),

    -- Reconciliation (populated by supervisor after closing)
    expected_cash_amount    NUMERIC(15, 2),  -- opening float + cash sales - cash refunds
    cash_variance           NUMERIC(15, 2),  -- closing_cash_counted - expected_cash_amount
    reconciled_by_user_id   UUID            REFERENCES users(user_id),
    reconciled_at           TIMESTAMPTZ,
    reconciliation_notes    TEXT,

    -- Status machine: open → closed → reconciled (or disputed)
    status  VARCHAR(20) NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'closed', 'reconciled', 'disputed')),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one open session per terminal at any time
CREATE UNIQUE INDEX uq_one_open_session_per_terminal
    ON pos_sessions (terminal_id)
    WHERE status = 'open';

-- Common lookups
CREATE INDEX idx_sessions_branch_date   ON pos_sessions (branch_id, session_start DESC);
CREATE INDEX idx_sessions_cashier       ON pos_sessions (cashier_user_id, session_start DESC);
CREATE INDEX idx_sessions_status        ON pos_sessions (company_id, status);


-- -----------------------------------------------------------------------------
-- Session_Cash_Denominations
-- Optional but important: lets cashiers record the exact note/coin breakdown
-- during opening float count and closing cash count. Prevents disputes.
-- -----------------------------------------------------------------------------
CREATE TABLE session_cash_denominations (
    denomination_id     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID            NOT NULL REFERENCES pos_sessions(session_id) ON DELETE CASCADE,
    count_type          VARCHAR(10)     NOT NULL CHECK (count_type IN ('opening', 'closing')),
    denomination_value  NUMERIC(10, 2)  NOT NULL,   -- e.g. 1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.50
    quantity            INTEGER         NOT NULL DEFAULT 0,
    subtotal            NUMERIC(12, 2)  GENERATED ALWAYS AS (denomination_value * quantity) STORED
);

CREATE INDEX idx_denominations_session ON session_cash_denominations (session_id, count_type);


-- =============================================================================
-- Required change to Sales_Transactions: add FK constraints for session/terminal.
-- Columns may already exist (declared nullable in 05_core_tables.sql); only add
-- the FK constraints here if they are missing.
-- =============================================================================
ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS pos_session_id UUID,
    ADD COLUMN IF NOT EXISTS terminal_id    UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_transactions_pos_session_id_fkey'
      AND table_name = 'sales_transactions'
  ) THEN
    ALTER TABLE sales_transactions
      ADD CONSTRAINT sales_transactions_pos_session_id_fkey
        FOREIGN KEY (pos_session_id) REFERENCES pos_sessions(session_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_transactions_terminal_id_fkey'
      AND table_name = 'sales_transactions'
  ) THEN
    ALTER TABLE sales_transactions
      ADD CONSTRAINT sales_transactions_terminal_id_fkey
        FOREIGN KEY (terminal_id) REFERENCES pos_terminals(terminal_id);
  END IF;
END $$;

-- A transaction with no session_id = online/back-office transaction (allowed).
-- A POS transaction MUST have a session_id — enforced at application layer.
