-- ─────────────────────────────────────────────────────────────────────────────
-- 07_soft_deletes.sql
-- Adds non-destructive delete support to key entities.
-- deleted_at IS NULL = active record; deleted_at IS NOT NULL = soft-deleted.
-- deleted_by stores the user_id of who performed the deletion (UUID, no FK
-- to avoid circular dependency concerns on the users table itself).
-- Partial indexes keep queries on active records fast.
-- ─────────────────────────────────────────────────────────────────────────────

-- Products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_products_active
  ON products (company_id) WHERE deleted_at IS NULL;

-- Customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_customers_active
  ON customers (company_id) WHERE deleted_at IS NULL;

-- Users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (company_id) WHERE deleted_at IS NULL;

-- Branches
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_branches_active
  ON branches (company_id) WHERE deleted_at IS NULL;
