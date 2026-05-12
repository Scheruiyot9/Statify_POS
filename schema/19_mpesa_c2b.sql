-- Support for C2B (customer-initiated direct paybill/till payments).
-- 1. Make mpesa_receipt_number unique so duplicate C2B callbacks are idempotent.
-- 2. Extend payment_mode to allow 'c2b'.

-- Replace the plain index with a unique one for receipt dedup
DROP INDEX IF EXISTS idx_mpesa_txn_receipt;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpesa_txn_receipt
  ON mpesa_transactions (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL;

-- Enforce valid payment_mode values going forward
ALTER TABLE mpesa_transactions
  DROP CONSTRAINT IF EXISTS mpesa_txns_mode_check;
ALTER TABLE mpesa_transactions
  ADD CONSTRAINT mpesa_txns_mode_check
  CHECK (payment_mode IN ('stk_push', 'manual', 'c2b'));
