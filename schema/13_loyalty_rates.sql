-- =============================================================================
-- Migration 13: Per-company loyalty points configuration
-- Replaces the hardcoded POINTS_EARN_RATE / POINTS_REDEEM_RATE constants in
-- sales.service.js with columns on the companies table so each tenant can
-- configure their own rates.
-- =============================================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS points_earn_rate   NUMERIC(10,4) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS points_redeem_rate NUMERIC(10,4) NOT NULL DEFAULT 0.10;

COMMENT ON COLUMN companies.points_earn_rate   IS 'Currency units spent to earn 1 loyalty point (e.g. 10 = spend 10 to get 1 point)';
COMMENT ON COLUMN companies.points_redeem_rate IS 'Currency value of 1 loyalty point on redemption (e.g. 0.10 = 1 point worth 0.10)';
