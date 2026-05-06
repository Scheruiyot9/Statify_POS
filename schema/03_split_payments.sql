-- =============================================================================
-- P0.3 — Split / Multi-Tender Payments
-- The original design stores payment_method as a plain VARCHAR on
-- Sales_Transactions. This breaks two real-world scenarios:
--   1. Customer pays part cash, part card ("split tender")
--   2. Audit trail needs the reference number (M-Pesa code, card last-4, etc.)
--
-- Fix: drop the scalar field, replace with a child table.
-- Sales_Transactions keeps: subtotal, tax_amount, discount_amount, total_amount.
-- Transaction_Payments records how that total was collected.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Transaction_Payments
-- Each row = one payment leg within a transaction.
-- A cash-only sale has exactly 1 row. A split tender has 2+.
-- Sum of amount_tendered across all legs = total_amount on the transaction
-- (enforced by application/trigger, not DB constraint, to allow in-progress state).
-- -----------------------------------------------------------------------------
CREATE TABLE transaction_payments (
    payment_id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id          UUID            NOT NULL REFERENCES sales_transactions(transaction_id),
    payment_method_id       UUID            NOT NULL REFERENCES payment_methods(payment_method_id),

    -- How much the customer offered for this leg
    amount_tendered         NUMERIC(15, 2)  NOT NULL CHECK (amount_tendered > 0),

    -- Applied amount may differ from tendered on cash (change given back)
    amount_applied          NUMERIC(15, 2)  NOT NULL CHECK (amount_applied > 0),

    -- Cash change is only meaningful on cash-type legs
    change_given            NUMERIC(15, 2)  NOT NULL DEFAULT 0 CHECK (change_given >= 0),

    -- Reference for non-cash: M-Pesa transaction code, card approval code, cheque number, etc.
    reference_number        VARCHAR(100),

    -- For card payments: last 4 digits displayed on receipt (never full PAN — PCI DSS)
    card_last_four          CHAR(4),
    card_type               VARCHAR(20),    -- Visa / Mastercard / Amex

    -- For mobile money: phone number that paid (masked on receipt)
    mobile_phone_masked     VARCHAR(20),    -- e.g. 07****89

    -- Sequence within the transaction (for display order on receipt)
    sequence_no             SMALLINT        NOT NULL DEFAULT 1,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT chk_change_only_on_cash
        CHECK (change_given = 0 OR card_last_four IS NULL)  -- change can't exist on card leg
);

CREATE INDEX idx_txn_payments_transaction ON transaction_payments (transaction_id);
CREATE INDEX idx_txn_payments_method      ON transaction_payments (payment_method_id);


-- =============================================================================
-- Required changes to Sales_Transactions
-- Remove the scalar payment_method column; it is now derived from
-- transaction_payments. Keep it temporarily as nullable for migration safety.
-- =============================================================================

-- Step 1: Ensure payment_method is nullable (already nullable in 05_core_tables.sql).
DO $$
BEGIN
  -- Only drop NOT NULL if column currently has it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_transactions'
      AND column_name = 'payment_method'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE sales_transactions ALTER COLUMN payment_method DROP NOT NULL;
  END IF;
END $$;

-- Step 2: Add convenience columns if not already present.
ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS amount_paid     NUMERIC(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS change_total    NUMERIC(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notes           TEXT,
    ADD COLUMN IF NOT EXISTS receipt_printed BOOLEAN        NOT NULL DEFAULT FALSE;


-- -----------------------------------------------------------------------------
-- Trigger: keep Sales_Transactions.amount_paid in sync after payment inserts
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_transaction_amount_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE sales_transactions
    SET
        amount_paid  = (SELECT COALESCE(SUM(amount_applied), 0)
                        FROM transaction_payments
                        WHERE transaction_id = NEW.transaction_id),
        change_total = (SELECT COALESCE(SUM(change_given), 0)
                        FROM transaction_payments
                        WHERE transaction_id = NEW.transaction_id),
        updated_at   = now()
    WHERE transaction_id = NEW.transaction_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_amount_paid ON transaction_payments;
CREATE TRIGGER trg_sync_amount_paid
AFTER INSERT OR UPDATE ON transaction_payments
FOR EACH ROW EXECUTE FUNCTION sync_transaction_amount_paid();


-- =============================================================================
-- Migration helper view: see payment breakdown per transaction
-- =============================================================================
CREATE OR REPLACE VIEW v_transaction_payment_summary AS
SELECT
    t.transaction_id,
    t.transaction_number,
    t.total_amount,
    t.amount_paid,
    t.change_total,
    (t.total_amount - t.amount_paid) AS balance_due,
    json_agg(
        json_build_object(
            'method',        pm.method_name,
            'amount_applied', tp.amount_applied,
            'amount_tendered',tp.amount_tendered,
            'change_given',   tp.change_given,
            'reference',      tp.reference_number
        ) ORDER BY tp.sequence_no
    ) AS payment_legs
FROM sales_transactions t
JOIN transaction_payments tp  ON tp.transaction_id = t.transaction_id
JOIN payment_methods      pm  ON pm.payment_method_id = tp.payment_method_id
GROUP BY t.transaction_id, t.transaction_number, t.total_amount, t.amount_paid, t.change_total;
