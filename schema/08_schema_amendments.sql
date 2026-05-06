-- =============================================================================
-- 08_schema_amendments.sql
-- Adds domain column to companies, payment_status to sales_transactions,
-- updated_at to branches, and consolidates soft-delete columns with IF NOT
-- EXISTS guards so this file is safe to run even if 07_soft_deletes.sql was
-- already applied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Companies — add plain `domain` column alongside legacy `domain_name`
-- -----------------------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS domain TEXT;

-- Back-fill: copy any existing domain_name values into the new column
UPDATE companies
  SET domain = domain_name
  WHERE domain IS NULL AND domain_name IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Branches — add updated_at (required by update / soft-delete operations)
-- -----------------------------------------------------------------------------
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- -----------------------------------------------------------------------------
-- Sales Transactions — track payment collection status independently of the
-- transaction lifecycle status.
-- Values: 'pending' | 'paid' | 'partial' | 'refunded'
-- -----------------------------------------------------------------------------
ALTER TABLE sales_transactions
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50)
    NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('pending', 'paid', 'partial', 'refunded'));

-- Back-fill existing rows
UPDATE sales_transactions SET payment_status = 'paid'     WHERE status = 'completed';
UPDATE sales_transactions SET payment_status = 'refunded' WHERE status IN ('void', 'refund');

CREATE INDEX IF NOT EXISTS idx_txn_payment_status
  ON sales_transactions (company_id, payment_status);

-- -----------------------------------------------------------------------------
-- Soft-delete columns — IF NOT EXISTS guards make this idempotent alongside
-- 07_soft_deletes.sql.  Using TIMESTAMPTZ for consistency with the rest of the
-- schema; a plain TIMESTAMP column added earlier is automatically compatible.
-- -----------------------------------------------------------------------------

-- Users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID;

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (company_id) WHERE deleted_at IS NULL;

-- Products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID;

CREATE INDEX IF NOT EXISTS idx_products_active
  ON products (company_id) WHERE deleted_at IS NULL;

-- Customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID;

CREATE INDEX IF NOT EXISTS idx_customers_active
  ON customers (company_id) WHERE deleted_at IS NULL;

-- Branches
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID;

CREATE INDEX IF NOT EXISTS idx_branches_active
  ON branches (company_id) WHERE deleted_at IS NULL;
