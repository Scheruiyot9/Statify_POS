-- =============================================================================
-- 21. Subscription Plans v2
--     Adds has_finance, has_api_access, sort_order to subscription_plans.
--     Upserts the canonical plan tiers: Trial, Starter, Growth, Enterprise.
-- =============================================================================

-- Add new feature-flag columns if they don't already exist
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS has_finance    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_api_access BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sort_order     SMALLINT NOT NULL DEFAULT 0;

-- Upsert canonical plan tiers.
-- -1 for max_users / max_branches means "unlimited".
INSERT INTO subscription_plans
  (plan_name, price, annual_price, billing_cycle, max_users, max_branches,
   has_finance, has_api_access, trial_days, sort_order,
   features_json)
VALUES
  ('Trial',      0,     0,      'monthly',  2,  1, FALSE, FALSE, 14, 0,
   '{"pos":true,"finance":false,"api":false}'),
  ('Starter',    999,   9990,   'monthly',  3,  1, FALSE, FALSE, 14, 1,
   '{"pos":true,"finance":false,"api":false}'),
  ('Growth',     2999,  29990,  'monthly', 15,  3, TRUE,  FALSE, 14, 2,
   '{"pos":true,"finance":true,"api":false}'),
  ('Enterprise', 7999,  79990,  'monthly', -1, -1, TRUE,  TRUE,  30, 3,
   '{"pos":true,"finance":true,"api":true,"custom":true}')
ON CONFLICT (plan_name) DO UPDATE
  SET price          = EXCLUDED.price,
      annual_price   = EXCLUDED.annual_price,
      max_users      = EXCLUDED.max_users,
      max_branches   = EXCLUDED.max_branches,
      has_finance    = EXCLUDED.has_finance,
      has_api_access = EXCLUDED.has_api_access,
      sort_order     = EXCLUDED.sort_order,
      features_json  = EXCLUDED.features_json;

-- Deactivate legacy plan names that no longer exist in the new structure
UPDATE subscription_plans
  SET is_active = FALSE
WHERE plan_name IN ('Basic', 'Professional')
  AND plan_name NOT IN ('Trial','Starter','Growth','Enterprise');
