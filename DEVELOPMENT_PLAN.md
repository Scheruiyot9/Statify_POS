# Statify POS — Development Plan (Phase 2)

**Date:** 2026-05-13  
**Status:** Planning — no code written yet

---

## 1. Module Separation: POS vs Finance

Statify has two distinct product surfaces. They share the same codebase and database but are gated separately by subscription plan.

### POS Core Module
Everything a business needs to sell, manage stock, and handle customers at the counter.

| Feature | Current Status |
|---|---|
| Authentication & RBAC | ✅ Done |
| Multi-tenancy & Branches | ✅ Done |
| Product Catalog | ✅ Done |
| Inventory Management | ✅ Done |
| Customer Management (groups, loyalty, credit) | ✅ Done |
| Sales Transactions (multi-item, split payment) | ✅ Done |
| POS Terminal (sessions, terminals, offline queue) | ✅ Done |
| M-Pesa Integration (STK Push, C2B, manual) | ✅ Done |
| Tax Templates | ✅ Done |
| Sales Returns — Backend | ✅ Done |
| Sales Returns — Frontend | ⚠️ Partial (view/approve only) |
| Basic Reporting (sales summary, dashboard) | ✅ Done |
| Shift Reconciliation | ✅ Done |

### Finance Module *(subscription add-on)*
Everything a business needs for bookkeeping, procurement, and financial visibility.

| Feature | Current Status |
|---|---|
| Chart of Accounts | ❌ Not started |
| Bank Accounts | ❌ Not started |
| Supplier Management | ❌ Not started |
| Purchase Orders & GRNs | ❌ Not started |
| Accounts Payable Payments | ❌ Not started |
| AR Aging Report | ❌ Not started |
| AP Aging Report | ❌ Not started |
| Profit & Loss Statement | ❌ Not started |
| Balance Sheet | ❌ Not started |

**Design rule:** Any route, page, or sidebar item that belongs to the Finance module must check `company.plan.has_finance` before rendering. A company without the Finance add-on sees Finance items greyed out in the sidebar with an "Upgrade" prompt.

---

## 2. Pricing Plan — Revised

### Current Problem
The existing `subscription_plans` table likely has a flat tier structure (e.g., Basic / Standard / Premium) that bundles everything together. This doesn't give the business a good upsell path and doesn't cleanly separate POS from Finance.

### Proposed Plan Structure

#### Base POS Plans

| Plan | Target Customer | Branches | Users | Products | Price Idea |
|---|---|---|---|---|---|
| **Trial** | Any new signup | 1 | 2 | 50 | Free, 14 days |
| **Starter** | Solo shop, kiosk | 1 | 3 | Unlimited | Low monthly |
| **Growth** | Small chain | 3 | 15 | Unlimited | Mid monthly |
| **Enterprise** | Large chain / franchise | Unlimited | Unlimited | Unlimited | Custom |

#### Finance Module Add-On
Available to **Growth** and **Enterprise** plans only (not Starter — Starter businesses are unlikely to need double-entry bookkeeping).

| Add-On | What It Unlocks |
|---|---|
| **Finance** | Chart of Accounts, Bank Accounts, Suppliers, Purchase Orders, GRNs, AP Payments, Aging Reports, P&L, Balance Sheet |

**Why an add-on rather than a separate tier?**
A business on Growth may not need Finance immediately. Making it an optional add-on lets them subscribe to POS first and upgrade Finance later — two upsell moments instead of one.

### Plan Feature Matrix

| Feature | Trial | Starter | Growth | Growth + Finance | Enterprise | Enterprise + Finance |
|---|---|---|---|---|---|---|
| POS Terminal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sales & Inventory | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| M-Pesa | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Returns | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Customers & Loyalty | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Basic Reports (Sales, Dashboard) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-branch | ❌ | ❌ (1) | ✅ (up to 3) | ✅ | ✅ | ✅ |
| Suppliers & Purchasing | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Chart of Accounts | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Bank Accounts | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| AP Payments | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Aging & Financial Reports | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| API Access | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| White-label / Custom Domain | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

### Schema Change Needed

The current `subscription_plans` table needs two new boolean columns:

```
has_finance    BOOLEAN DEFAULT false
has_api_access BOOLEAN DEFAULT false
```

The `companies` table will inherit these via their active plan. All Finance module endpoints check `req.company.plan.has_finance === true` and return `403 Upgrade required` if not.

---

## 3. Sidebar Navigation Architecture

### Problem with the Current Sidebar
As features grow, a flat sidebar list becomes unwieldy. Super admins especially need to see both platform-level controls and tenant-level features without switching contexts.

### Proposed Sidebar Structure

#### Standard Tenant User (all roles)

Sidebar items are shown based on the user's role capabilities AND the company's plan. Finance items are shown but greyed/locked if `has_finance` is false.

```
📊 Dashboard

── POS ──────────────────────────
  🖥️  POS Terminal           (cashier+)
  🧾  Sales                  (cashier+)
  ↩️  Returns                (cashier+)
  🕐  Shifts                 (cashier+)

── Inventory ────────────────────
  📦  Products               (inventory_manager+)
  🗂️  Inventory              (inventory_manager+)

── Customers ────────────────────
  👥  Customers              (cashier+)

── Finance ──────────────────────  ← collapsed if !has_finance, shows lock icon
  🏭  Suppliers              (inventory_manager+)
  🛒  Purchases              (inventory_manager+)
  💳  Payments               (accountant+)
  📒  Chart of Accounts      (accountant+)
  🏦  Bank Accounts          (accountant+)

── Reports ──────────────────────
  📈  Sales Reports          (accountant+)
  📉  Aging Reports          (accountant+)     ← locked if !has_finance
  💰  Financial Reports      (company_admin)   ← locked if !has_finance

── Settings ─────────────────────
  ⚙️  Settings               (company_admin)
  👤  Users & Roles          (company_admin)
  💳  Subscription           (company_admin)
  📱  M-Pesa                 (company_admin)
```

Each group heading is collapsible. The active group expands by default. Finance group shows an "Upgrade to unlock" tooltip when `has_finance` is false rather than hiding the items entirely — this creates the upsell awareness.

#### Super Admin Sidebar

The super admin manages the platform itself, not a specific company. Their sidebar has a separate set of groups:

```
📊 Platform Overview

── Companies ────────────────────
  🏢  All Companies
  ➕  Onboard New Company

── Subscriptions ────────────────
  📋  Subscription Plans
  🔄  Plan Changes & Upgrades
  💰  Billing Overview

── Users ────────────────────────
  👥  All Platform Users
  🔒  Roles & Permissions

── Platform Settings ────────────
  ⚙️  Feature Flags
  🌐  System Configuration
  📣  Announcements

── POS View ─────────────────────  ← impersonate a company to see their POS view
  🏭  Switch to Company Context  (dropdown: select company → enters their tenant view)

── Finance View ─────────────────  ← visible only while in a company context
  (same Finance group as tenant sidebar above, shown when impersonating)

── Reports ──────────────────────
  📈  Platform Revenue
  📊  Usage Analytics
  🔔  Alerts & Anomalies
```

**Key design decision:** Super admins should be able to "enter" a company's context (existing `X-Company-ID` header mechanism) and see the full sidebar as that company's admin would. When in a company context, the sidebar shows a "Company: [Name]" banner at the top and an "Exit Company" button. This way the super admin never needs a completely different navigation — they slide into the tenant view.

### Collapsible Group Implementation

Each sidebar group has:
- A header row (icon + label + chevron)
- Child items shown/hidden when the group is toggled
- Last-open state persisted to `localStorage` per user
- Active-route detection: the group containing the active route auto-expands on load

---

## 4. Feature Work: Sales Returns Completion

### What is missing from Returns

The backend is **100% complete**. The frontend gaps are:

| Gap | Detail |
|---|---|
| Create Return flow | No UI to initiate a return; backend `POST /returns` is ready but unreachable from the UI |
| Refunded status | After approval, there is no "mark as refunded" step — the status machine stops at `approved` |
| Return receipt | No printable/exportable receipt after processing a refund |
| POS terminal returns | Cashiers cannot start a return from the POS screen |

### Create Return — Flow Design

**Entry points:**
- Sales page → row action → "Create Return"
- Returns page → "New Return" button

**Steps:**
1. **Find Sale** — search by transaction number; show sale summary (date, total, items, payment method)
2. **Select Items** — checkbox each line; enter `qty_to_return` (capped at returnable amount shown); pick condition per item (Resellable / Damaged / Expired / Other); pick return reason
3. **Refund Method** — select payment method; enter amount (must match total refund); reference number for non-cash; store credit option
4. **Review & Submit** — summary of what is returned and how refunded; submit → system generates RTN number

### Refunded Status

After an `approved` return, a manager or cashier confirms that the money/credit was actually given to the customer. This moves status to `refunded` and timestamps it.

New endpoint needed: `PATCH /returns/:id/refund`

---

## 5. Feature Work: Suppliers & Purchasing

*(Finance module — requires `has_finance`)*

### Supplier
A supplier is a vendor from whom the business procures goods. Key fields: name, code (auto-generated), contact, phone, email, address, KRA PIN, payment terms (days), credit limit, currency.

### Purchase Order (PO)
A formal order sent to a supplier before goods arrive. Statuses: `draft → sent → partial → received → cancelled`.

A PO has line items: product, quantity ordered, unit cost, tax rate, line total.

### Goods Received Note (GRN)
When goods arrive, a GRN is created against the PO. Each GRN line records actual quantity received. On GRN confirmation, inventory is incremented automatically. PO status updates to `partial` or `received` depending on fulfillment.

### Supplier Credit Note
When goods are returned to a supplier, a credit note is issued. It reduces the outstanding AP balance on the related PO.

### Workflow
```
Supplier created
  └─ PO drafted (add products, costs, expected date)
       └─ PO sent to supplier (status: sent)
            └─ Goods arrive → GRN created and confirmed
                 ├─ Inventory updated (automatic)
                 ├─ PO status updated (partial / received)
                 └─ Invoice payable created → settled via Payments
```

---

## 6. Feature Work: Accounts Payable Payments

*(Finance module — requires `has_finance`)*

### Bank Accounts
The company's actual accounts: KCB Current, Equity Bank, M-Pesa Till, Petty Cash, etc. Each has an opening balance and a running current balance updated as payments are made or received.

### Supplier Payments
Recording that money was sent to a supplier. A payment can settle one or many POs (allocation). Modes: bank transfer, M-Pesa B2B, cash, cheque. On recording, bank account balance decreases and PO `amount_paid` increases.

---

## 7. Feature Work: Chart of Accounts

*(Finance module — requires `has_finance`)*

A hierarchical list of accounts that classify every financial transaction. Seeded automatically when a company enables the Finance module.

**Default accounts seeded:**

| Code | Name | Type |
|---|---|---|
| 1000 | Cash & Bank | Asset |
| 1100 | Accounts Receivable | Asset |
| 1200 | Inventory | Asset |
| 2000 | Accounts Payable | Liability |
| 3000 | Owner's Equity | Equity |
| 4000 | Sales Revenue | Revenue |
| 4100 | Sales Returns & Allowances | Revenue (contra) |
| 5000 | Cost of Goods Sold | Expense |
| 6000 | Operating Expenses | Expense |

Companies can add sub-accounts under any parent (e.g., 6100 Rent, 6200 Salaries under 6000).

---

## 8. Feature Work: Key Reports

### AR Aging *(Finance module)*
Shows customers with outstanding credit balances bucketed by how long overdue:
- Current
- 1–30 days
- 31–60 days
- 61–90 days
- 90+ days

**Data source:** `customers.credit_balance` + last credit payment date.  
**Filters:** branch, as-of date.  
**Export:** Excel.

### AP Aging *(Finance module)*
Same bucket structure for outstanding supplier PO balances.

**Data source:** `purchase_orders.balance_due` vs `order_date + supplier.payment_terms_days`.  
**Filters:** supplier, branch, as-of date.

### Profit & Loss *(Finance module)*
For a selected date range:
- **Revenue:** net sales (voided excluded) minus returns
- **COGS:** cost of goods received (from GRNs), prorated to what was sold
- **Gross Profit** = Revenue − COGS
- **Operating Expenses:** from CoA expense accounts
- **Net Profit** = Gross Profit − Operating Expenses

### Balance Sheet *(Finance module)*
Snapshot at a selected date:
- **Assets:** bank account balances + inventory value + AR balance
- **Liabilities:** outstanding AP (PO balances due)
- **Equity** = Assets − Liabilities

### Sales Report *(POS Core — already built)*
Existing sales summary: filterable by date, branch, product, customer. Already complete.

---

## 9. Implementation Sequence

```
Phase 2A — Complete Returns (POS Core, no schema change)
  A1  Create Return UI (4-step modal) .................... frontend only
  A2  PATCH /returns/:id/refund endpoint ................. backend + frontend
  A3  Return receipt modal ............................... frontend only
  A4  Returns from POS terminal .......................... frontend only

Phase 2B — Subscription Plan Upgrade
  B1  Add has_finance, has_api_access to subscription_plans
  B2  Finance-gate middleware (403 if plan lacks feature)
  B3  Sidebar collapse/group/lock UI implementation
  B4  Upgrade prompt for locked Finance features

Phase 2C — Suppliers & Purchasing (Finance)
  C1  Suppliers schema migration (21_suppliers.sql)
  C2  PO + PO Items schema (22_purchases.sql)
  C3  GRN schema + inventory trigger (23_grn.sql)
  C4  Supplier Credit Notes schema (24_supplier_credit_notes.sql)
  C5  Suppliers API module
  C6  Purchases API module (PO lifecycle)
  C7  GRN API module
  C8  Suppliers frontend page
  C9  Purchase Orders frontend page + GRN modal

Phase 2D — Payments & Bank Accounts (Finance)
  D1  Bank Accounts schema (25_bank_accounts.sql)
  D2  Supplier Payments schema (26_supplier_payments.sql)
  D3  Bank Accounts API
  D4  Supplier Payments API
  D5  Payments frontend page
  D6  Bank Accounts in Settings

Phase 2E — Chart of Accounts (Finance)
  E1  CoA schema + seed (27_chart_of_accounts.sql)
  E2  CoA API
  E3  CoA frontend page (tree view)

Phase 2F — Financial Reports (Finance)
  F1  AR Aging endpoint + UI tab
  F2  AP Aging endpoint + UI tab
  F3  P&L endpoint + UI tab
  F4  Balance Sheet endpoint + UI tab
```

---

## 10. Decisions Log

| # | Question | Decision |
|---|---|---|
| 1 | COGS tracking method | **Periodic (monthly)** — no unit_cost stored at sale time; COGS calculated from GRN data at period end |
| 2 | Multi-currency | **KES only** for now; currency field on supplier is informational |
| 3 | Returns from POS terminal | **Back-office only** — cashiers do not initiate returns from the POS screen |
| 4 | Credit note offset AP | **Automatic** — credit note confirmation reduces PO `amount_paid` and AP balance immediately |
| 5 | Email/PDF POs | **Later** — out of scope for current phases |
| 6 | PO approval workflow | **Yes, introduce approval** — large POs (above a company-configured threshold) require company_admin approval before being sent |
| 7 | Finance add-on availability | **Growth and Enterprise only** — Starter does not get Finance module |
