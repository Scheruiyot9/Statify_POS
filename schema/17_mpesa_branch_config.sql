-- Adds per-branch M-Pesa configuration support.
-- Each branch can now have its own Daraja shortcode / credentials.
-- Existing company-level configs are preserved (branch_id stays NULL).

ALTER TABLE mpesa_config
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(branch_id) ON DELETE CASCADE;

-- Drop the old single-company unique constraint
ALTER TABLE mpesa_config DROP CONSTRAINT IF EXISTS mpesa_config_company_id_key;

-- One company-wide (fallback) config per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpesa_config_company_default
  ON mpesa_config(company_id) WHERE branch_id IS NULL;

-- One config per branch per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpesa_config_branch_specific
  ON mpesa_config(company_id, branch_id) WHERE branch_id IS NOT NULL;
