-- =============================================================================
-- 15_customer_id_fields.sql
-- Adds KRA PIN and National ID Number to customers.
-- Unique per company (NULL values are excluded from uniqueness check).
-- Removes gender (column kept in DB for data safety; application layer ignores it).
-- =============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS kra_pin   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS id_number VARCHAR(30);

-- Unique within a company, ignoring NULLs and soft-deleted records
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_kra_pin
  ON customers (company_id, kra_pin)
  WHERE kra_pin IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_id_number
  ON customers (company_id, id_number)
  WHERE id_number IS NOT NULL AND deleted_at IS NULL;
