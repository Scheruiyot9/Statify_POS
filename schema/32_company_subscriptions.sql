-- Subscription history ledger — one row per subscription period recorded
CREATE TABLE IF NOT EXISTS company_subscriptions (
  subscription_id  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID           NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  plan_id          UUID           NOT NULL REFERENCES subscription_plans(plan_id),
  start_date       DATE           NOT NULL,
  end_date         DATE           NOT NULL,
  recorded_by      UUID           REFERENCES users(user_id),
  notes            TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT chk_sub_dates CHECK (end_date > start_date)
);

-- Add columns introduced after initial table creation (idempotent)
ALTER TABLE company_subscriptions
  ADD COLUMN IF NOT EXISTS period      VARCHAR(20)   NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2);

-- Add check constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_sub_period' AND conrelid = 'company_subscriptions'::regclass
  ) THEN
    ALTER TABLE company_subscriptions
      ADD CONSTRAINT chk_sub_period CHECK (period IN ('monthly','quarterly','semi_annual','annual','biennial','custom'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_subs_company ON company_subscriptions (company_id, end_date DESC);
CREATE INDEX IF NOT EXISTS idx_company_subs_end     ON company_subscriptions (end_date);
