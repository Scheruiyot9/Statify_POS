-- =============================================================================
-- 27. Supplier (AP) Payments
-- =============================================================================

CREATE TABLE IF NOT EXISTS supplier_payments (
  payment_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID          NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  branch_id           UUID          NOT NULL REFERENCES branches(branch_id),
  supplier_id         UUID          NOT NULL REFERENCES suppliers(supplier_id),
  bank_account_id     UUID          REFERENCES bank_accounts(bank_account_id),
  po_id               UUID          REFERENCES purchase_orders(po_id),
  payment_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  amount              NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  payment_method      VARCHAR(20)   NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer','cash','cheque','mpesa','other')),
  reference_number    VARCHAR(100),
  notes               TEXT,
  is_void             BOOLEAN       NOT NULL DEFAULT FALSE,
  voided_at           TIMESTAMPTZ,
  voided_by_user_id   UUID          REFERENCES users(user_id),
  created_by_user_id  UUID          REFERENCES users(user_id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spay_company_supplier ON supplier_payments (company_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_spay_company_date     ON supplier_payments (company_id, payment_date DESC);
