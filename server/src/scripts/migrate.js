/**
 * Database migration runner.
 * Executes schema SQL files in dependency order.
 *
 * Usage:  node src/scripts/migrate.js
 *
 * For a FRESH deployment use schema_complete.sql — one file, all tables merged.
 * The legacy incremental files are kept for reference but no longer needed.
 */
require('dotenv').config();
const path   = require('path');
const fs     = require('fs');
const { pool } = require('../config/database');

const SCHEMA_DIR = path.resolve(__dirname, '../../../schema');

const FILES_IN_ORDER = [
  'schema_complete.sql',
  '15_customer_id_fields.sql',   // adds kra_pin, id_number; safe to re-run (IF NOT EXISTS)
  '16_mpesa.sql',                // mpesa_config + mpesa_transactions; safe to re-run (IF NOT EXISTS)
  '17_mpesa_branch_config.sql', // adds branch_id to mpesa_config; partial unique indexes
  '18_mpesa_checkout_unique.sql', // unique index on checkout_request_id for ON CONFLICT dedup
  '19_mpesa_c2b.sql',             // unique receipt index + c2b payment_mode
  '20_stk_sessions.sql',          // persisted STK sessions for server-restart resilience
  '21_subscription_plans_v2.sql', // has_finance, has_api_access, sort_order; upsert canonical tiers
  '22_returns_refunded_status.sql', // refunded_by_user_id, refunded_at, refund_notes on returns
  '23_chart_of_accounts.sql',      // accounts table (CoA)
  '24_bank_accounts.sql',          // bank_accounts table
  '25_suppliers.sql',              // suppliers table
  '26_purchase_orders.sql',        // purchase_orders, purchase_order_items, grns, grn_items + company counters
  '27_supplier_payments.sql',      // supplier_payments table (AP payments)
];

async function migrate() {
  const client = await pool.connect();
  console.log('🗃️  Running migrations…\n');

  try {
    for (const file of FILES_IN_ORDER) {
      const filePath = path.join(SCHEMA_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`  ⚠  ${file} not found — skipping`);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`  ✓  ${file}`);
    }

    console.log('\n✅ All migrations applied successfully.\n');
  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    console.error(err.detail || err.hint || '');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
