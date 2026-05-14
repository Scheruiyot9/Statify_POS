-- =============================================================================
-- 26. Purchase Orders, GRNs, and company counters
-- =============================================================================

-- PO and GRN sequence counters on companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS po_counter  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grn_counter INTEGER NOT NULL DEFAULT 0;

-- ── Purchase Orders ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
  po_id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID          NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  branch_id           UUID          NOT NULL REFERENCES branches(branch_id),
  supplier_id         UUID          NOT NULL REFERENCES suppliers(supplier_id),
  po_number           VARCHAR(30)   NOT NULL,
  order_date          DATE          NOT NULL DEFAULT CURRENT_DATE,
  expected_date       DATE,
  status              VARCHAR(25)   NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','partially_received','received','cancelled')),
  subtotal            NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  created_by_user_id  UUID          REFERENCES users(user_id),
  approved_by_user_id UUID          REFERENCES users(user_id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (company_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  poi_id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id               UUID           NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
  product_id          UUID           NOT NULL REFERENCES products(product_id),
  description         TEXT,
  quantity_ordered    NUMERIC(12,3)  NOT NULL,
  quantity_received   NUMERIC(12,3)  NOT NULL DEFAULT 0,
  unit_cost           NUMERIC(15,4)  NOT NULL,
  tax_rate            NUMERIC(5,2)   NOT NULL DEFAULT 0,
  line_total          NUMERIC(15,2)  NOT NULL,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_company    ON purchase_orders (company_id, status);
CREATE INDEX IF NOT EXISTS idx_poi_po        ON purchase_order_items (po_id);

-- ── Goods Received Notes ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grns (
  grn_id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID          NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  branch_id            UUID          NOT NULL REFERENCES branches(branch_id),
  po_id                UUID          NOT NULL REFERENCES purchase_orders(po_id),
  supplier_id          UUID          NOT NULL REFERENCES suppliers(supplier_id),
  grn_number           VARCHAR(30)   NOT NULL,
  received_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  status               VARCHAR(10)   NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted')),
  subtotal             NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes                TEXT,
  received_by_user_id  UUID          REFERENCES users(user_id),
  posted_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (company_id, grn_number)
);

CREATE TABLE IF NOT EXISTS grn_items (
  grni_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id            UUID          NOT NULL REFERENCES grns(grn_id) ON DELETE CASCADE,
  poi_id            UUID          NOT NULL REFERENCES purchase_order_items(poi_id),
  product_id        UUID          NOT NULL REFERENCES products(product_id),
  quantity_received NUMERIC(12,3) NOT NULL,
  unit_cost         NUMERIC(15,4) NOT NULL,
  line_total        NUMERIC(15,2) NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grn_company ON grns (company_id, status);
CREATE INDEX IF NOT EXISTS idx_grni_grn    ON grn_items (grn_id);
CREATE INDEX IF NOT EXISTS idx_grni_poi    ON grn_items (poi_id);
