-- =============================================================================
-- 25. Suppliers
-- =============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID          NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  supplier_name   VARCHAR(100)  NOT NULL,
  contact_person  VARCHAR(100),
  email           VARCHAR(150),
  phone           VARCHAR(30),
  address         TEXT,
  tax_pin         VARCHAR(50),
  payment_terms   INTEGER       NOT NULL DEFAULT 30,
  credit_limit    NUMERIC(15,2),
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  account_id      UUID          REFERENCES accounts(account_id),
  currency        VARCHAR(3)    NOT NULL DEFAULT 'KES',
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers (company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name    ON suppliers (company_id, supplier_name);
