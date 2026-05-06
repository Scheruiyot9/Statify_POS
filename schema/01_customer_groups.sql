-- =============================================================================
-- P0.1 — Customer Groups
-- Referenced by Customers.customer_group_id but never defined in original design.
-- Groups drive: pricing tiers, tax exemptions, credit limits, and discount rules.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Customer_Groups
-- Scoped per company. Used for B2B credit terms, pricing tiers, tax exemptions.
-- -----------------------------------------------------------------------------
CREATE TABLE customer_groups (
    group_id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID            NOT NULL REFERENCES companies(company_id),
    group_name          VARCHAR(100)    NOT NULL,
    description         TEXT,

    -- Pricing behaviour
    -- A group can have a fixed discount applied automatically at checkout.
    -- This works alongside Product_Branch_Pricing and Discount_Rules.
    default_discount_type   VARCHAR(10)     CHECK (default_discount_type IN ('percentage', 'fixed', 'none')) DEFAULT 'none',
    default_discount_value  NUMERIC(10, 4)  NOT NULL DEFAULT 0,

    -- Tax exemption: some B2B/NGO customers are VAT-exempt
    is_tax_exempt       BOOLEAN         NOT NULL DEFAULT FALSE,
    tax_exemption_ref   VARCHAR(100),           -- exemption certificate number

    -- Credit (B2B only)
    allows_credit       BOOLEAN         NOT NULL DEFAULT FALSE,
    credit_limit        NUMERIC(15, 2)  NOT NULL DEFAULT 0,
    payment_terms_days  SMALLINT        NOT NULL DEFAULT 0,  -- 0 = cash on delivery

    -- Loyalty points multiplier (hooks into future loyalty module)
    points_multiplier   NUMERIC(5, 2)   NOT NULL DEFAULT 1.00,

    is_system_group     BOOLEAN         NOT NULL DEFAULT FALSE,  -- e.g. "Walk-in", "Wholesale" — cannot be deleted
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT uq_group_name_per_company UNIQUE (company_id, group_name)
);

-- Every company needs at least one default group for walk-in/anonymous customers.
-- Application layer must seed a "Walk-in" group (is_system_group = TRUE) when a
-- company is created.

-- Index: most queries filter by company then join to customers
CREATE INDEX idx_customer_groups_company ON customer_groups (company_id, is_active);


-- =============================================================================
-- Required change to existing Customers table (from original design §3.1)
-- Add FK constraint that was implied but missing, and a loyalty points balance.
-- Run AFTER customer_groups exists.
-- =============================================================================

-- customer_group_id was already declared in Customers, just add the FK if missing:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_customers_group'
      AND table_name = 'customers'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT fk_customers_group
        FOREIGN KEY (customer_group_id) REFERENCES customer_groups(group_id);
  END IF;
END $$;

-- Add extended columns if not already present (05_core_tables may pre-define some)
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS loyalty_points_balance  INTEGER       NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS credit_balance          NUMERIC(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS date_of_birth           DATE,
    ADD COLUMN IF NOT EXISTS gender                  VARCHAR(10),
    ADD COLUMN IF NOT EXISTS notes                   TEXT,
    ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now();
    ADD COLUMN IF NOT EXISTS deleted_at              TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by              UUID;

-- Indexes (IF NOT EXISTS safe via CREATE INDEX IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_customers_company_phone ON customers (company_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_company_email ON customers (company_id, email);
CREATE INDEX IF NOT EXISTS idx_customers_company_code  ON customers (company_id, customer_code);
