-- =============================================================================
-- 22. Returns — refunded status columns
--     Adds columns to record who confirmed physical refund and when.
-- =============================================================================

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS refunded_by_user_id UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS refunded_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_notes         TEXT;
