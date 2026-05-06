-- =============================================================================
-- P0.6 – Shift Pay-Mode Amounts
-- Tracks per-payment-method opening and closing floats for each POS session.
-- Run AFTER 05_core_tables.sql and 02_pos_sessions.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS session_pay_mode_amounts (
    amount_id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID            NOT NULL REFERENCES pos_sessions(session_id) ON DELETE CASCADE,
    payment_method_id   UUID            NOT NULL REFERENCES payment_methods(payment_method_id),
    count_type          VARCHAR(10)     NOT NULL CHECK (count_type IN ('opening', 'closing')),
    amount              NUMERIC(15, 2)  NOT NULL DEFAULT 0,
    CONSTRAINT uq_session_paymode_type UNIQUE (session_id, payment_method_id, count_type)
);

CREATE INDEX IF NOT EXISTS idx_session_pay_mode ON session_pay_mode_amounts (session_id, count_type);
