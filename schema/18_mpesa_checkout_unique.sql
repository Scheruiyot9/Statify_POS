-- Prevent duplicate callback inserts for the same STK push.
-- NULL checkout_request_id values (manual entries) are allowed to repeat.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpesa_txns_checkout_unique
ON mpesa_transactions (checkout_request_id)
WHERE checkout_request_id IS NOT NULL;
