-- =============================================================================
-- P0.4 — Returns & Refunds
-- The original design marks status = 'refund' on Sales_Transactions but has no
-- dedicated entity. This is insufficient because:
--   1. A return may be partial (some items, not the whole transaction)
--   2. The refund method may differ from the original payment method
--   3. Some returned items go back to stock; others (damaged) do not
--   4. Returns need their own audit trail and approval workflow
--
-- Design decision: Returns are NOT voided transactions. A void is a same-day
-- cancellation before the drawer is closed. A return is a post-sale reversal,
-- possibly days later. They are modelled separately.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Return_Reasons
-- Configurable per company. Drives reporting ("why are customers returning?").
-- -----------------------------------------------------------------------------
CREATE TABLE return_reasons (
    reason_id       UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL REFERENCES companies(company_id),
    reason_code     VARCHAR(30)     NOT NULL,
    reason_name     VARCHAR(100)    NOT NULL,
    -- Controls whether inventory is automatically restocked on this reason
    restock_by_default  BOOLEAN     NOT NULL DEFAULT TRUE,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_return_reason_code UNIQUE (company_id, reason_code)
);

-- Seed these at company creation (is_system_reason = TRUE prevents deletion)
ALTER TABLE return_reasons ADD COLUMN IF NOT EXISTS is_system_reason BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_return_reasons_company ON return_reasons (company_id, is_active);


-- -----------------------------------------------------------------------------
-- Returns
-- Header record. One return can cover multiple items from one original transaction.
-- Cross-transaction returns (returning items from different original receipts) are
-- NOT supported in V1 — each return ties to exactly one source transaction.
-- -----------------------------------------------------------------------------
CREATE TABLE returns (
    return_id                   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  UUID            NOT NULL REFERENCES companies(company_id),
    branch_id                   UUID            NOT NULL REFERENCES branches(branch_id),

    -- Return number: human-readable, unique per company (e.g. "RTN-2024-00042")
    return_number               VARCHAR(50)     NOT NULL,

    -- Link back to the original sale
    original_transaction_id     UUID            NOT NULL REFERENCES sales_transactions(transaction_id),

    -- Who processed it and when
    processed_by_user_id        UUID            NOT NULL REFERENCES users(user_id),
    return_date                 TIMESTAMPTZ     NOT NULL DEFAULT now(),

    -- Approval: refunds above a threshold require manager sign-off (§5.2 workflow config)
    requires_approval           BOOLEAN         NOT NULL DEFAULT FALSE,
    approved_by_user_id         UUID            REFERENCES users(user_id),
    approved_at                 TIMESTAMPTZ,
    approval_notes              TEXT,

    -- POS session the return was processed on (null = back-office/online)
    pos_session_id              UUID            REFERENCES pos_sessions(session_id),

    -- Reason applies to the whole return; individual items can override at line level
    return_reason_id            UUID            REFERENCES return_reasons(reason_id),
    customer_notes              TEXT,   -- free-text from customer
    internal_notes              TEXT,   -- staff notes

    -- Financial summary (denormalised from return_items for fast reads)
    subtotal_refunded           NUMERIC(15, 2)  NOT NULL DEFAULT 0,
    tax_refunded                NUMERIC(15, 2)  NOT NULL DEFAULT 0,
    discount_adjusted           NUMERIC(15, 2)  NOT NULL DEFAULT 0,
    total_refunded              NUMERIC(15, 2)  NOT NULL DEFAULT 0,

    -- Status machine: pending → approved → refunded | rejected
    status  VARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'approved', 'refunded', 'rejected', 'partial')),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_return_number_per_company UNIQUE (company_id, return_number)
);

CREATE INDEX idx_returns_company_date       ON returns (company_id, return_date DESC);
CREATE INDEX idx_returns_branch             ON returns (branch_id, return_date DESC);
CREATE INDEX idx_returns_original_txn       ON returns (original_transaction_id);
CREATE INDEX idx_returns_status             ON returns (company_id, status);


-- -----------------------------------------------------------------------------
-- Return_Items
-- Line-level detail. Quantity returned can be less than quantity originally sold.
-- -----------------------------------------------------------------------------
CREATE TABLE return_items (
    return_item_id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id               UUID            NOT NULL REFERENCES returns(return_id) ON DELETE CASCADE,

    -- Must reference the specific line on the original transaction
    original_item_id        UUID            NOT NULL REFERENCES sales_transaction_items(item_id),
    product_id              UUID            NOT NULL REFERENCES products(product_id),

    quantity_returned       NUMERIC(12, 4)  NOT NULL CHECK (quantity_returned > 0),

    -- Prices captured at time of return (original sale price, not current price)
    unit_price_at_sale      NUMERIC(15, 4)  NOT NULL,
    unit_tax_at_sale        NUMERIC(15, 4)  NOT NULL DEFAULT 0,
    unit_discount_at_sale   NUMERIC(15, 4)  NOT NULL DEFAULT 0,
    line_refund_amount      NUMERIC(15, 2)  NOT NULL,

    -- Inventory disposition for this line (may differ from header reason's default)
    return_to_inventory     BOOLEAN         NOT NULL DEFAULT TRUE,
    item_condition          VARCHAR(20)     CHECK (item_condition IN ('resellable', 'damaged', 'expired', 'other')),

    -- Per-item reason override (e.g. header says "wrong item" but one line is "damaged")
    return_reason_id        UUID            REFERENCES return_reasons(reason_id),
    line_notes              TEXT
);

CREATE INDEX idx_return_items_return    ON return_items (return_id);
CREATE INDEX idx_return_items_product   ON return_items (product_id);


-- -----------------------------------------------------------------------------
-- Return_Refunds
-- Tracks how the money was actually returned to the customer.
-- Mirrors Transaction_Payments but for outgoing money.
-- A return may be refunded as: store credit, cash, back to card, or exchange.
-- -----------------------------------------------------------------------------
CREATE TABLE return_refunds (
    refund_id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id               UUID            NOT NULL REFERENCES returns(return_id) ON DELETE CASCADE,
    payment_method_id       UUID            NOT NULL REFERENCES payment_methods(payment_method_id),

    amount_refunded         NUMERIC(15, 2)  NOT NULL CHECK (amount_refunded > 0),
    reference_number        VARCHAR(100),   -- reversal auth code for card refunds

    -- For store credit: credit is added to the customer's balance instead of cash out
    issued_as_store_credit  BOOLEAN         NOT NULL DEFAULT FALSE,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_return_refunds_return ON return_refunds (return_id);


-- =============================================================================
-- Trigger: restock inventory when a return_item is inserted and
--          return_to_inventory = TRUE and the return is approved/refunded.
-- Called after returns.status changes to 'approved' or 'refunded'.
-- =============================================================================
CREATE OR REPLACE FUNCTION restock_returned_items()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Only restock when status transitions into approved/refunded
    IF (OLD.status NOT IN ('approved', 'refunded'))
       AND (NEW.status IN ('approved', 'refunded')) THEN

        UPDATE product_branch_inventory pbi
        SET quantity_available = pbi.quantity_available + ri.quantity_returned,
            last_updated       = now()
        FROM return_items ri
        WHERE ri.return_id           = NEW.return_id
          AND ri.return_to_inventory = TRUE
          AND pbi.product_id         = ri.product_id
          AND pbi.branch_id          = NEW.branch_id;

    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restock_on_return_approval ON returns;
CREATE TRIGGER trg_restock_on_return_approval
AFTER UPDATE OF status ON returns
FOR EACH ROW EXECUTE FUNCTION restock_returned_items();


-- =============================================================================
-- Required change to Sales_Transactions:
-- The original status = 'refund' was a flag, not a proper link.
-- Add an explicit FK so the original transaction knows it has been (partially)
-- returned, and track the returned totals for quick "amount outstanding" queries.
-- =============================================================================
ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS total_returned NUMERIC(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS return_status  VARCHAR(20)    DEFAULT 'none';

-- Trigger: keep sales_transactions.total_returned in sync when a return is refunded
CREATE OR REPLACE FUNCTION sync_transaction_return_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('refunded', 'approved') THEN
        UPDATE sales_transactions st
        SET total_returned = (
                SELECT COALESCE(SUM(r2.total_refunded), 0)
                FROM returns r2
                WHERE r2.original_transaction_id = NEW.original_transaction_id
                  AND r2.status IN ('approved', 'refunded')
            ),
            return_status = CASE
                WHEN (SELECT COALESCE(SUM(r2.total_refunded), 0)
                      FROM returns r2
                      WHERE r2.original_transaction_id = NEW.original_transaction_id
                        AND r2.status IN ('approved', 'refunded'))
                     >= st.total_amount THEN 'full'
                WHEN (SELECT COALESCE(SUM(r2.total_refunded), 0)
                      FROM returns r2
                      WHERE r2.original_transaction_id = NEW.original_transaction_id
                        AND r2.status IN ('approved', 'refunded'))
                     > 0 THEN 'partial'
                ELSE 'none'
            END,
            updated_at = now()
        WHERE st.transaction_id = NEW.original_transaction_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_return_totals ON returns;
CREATE TRIGGER trg_sync_return_totals
AFTER UPDATE OF status ON returns
FOR EACH ROW EXECUTE FUNCTION sync_transaction_return_totals();
