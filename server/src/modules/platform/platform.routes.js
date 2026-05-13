const { Router }      = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole }  = require('../../middleware/rbac.middleware');
const ctrl             = require('./platform.controller');

const router = Router();

// All platform routes: authenticated super_admin only — no tenant context needed
router.use(authenticate, requireRole('super_admin'));

// ── Overview ──────────────────────────────────────────────────────────────────
router.get('/stats',           ctrl.stats);

// ── Subscription Plans ────────────────────────────────────────────────────────
router.get('/plans',           ctrl.listPlans);
router.post('/plans',          ctrl.createPlan);
router.patch('/plans/:id',     ctrl.updatePlan);
router.delete('/plans/:id',    ctrl.deletePlan);

// ── Companies ────────────────────────────────────────────────────────────────
router.get('/companies',                    ctrl.companies);
router.patch('/companies/:id/plan',         ctrl.changeCompanyPlan);
router.patch('/companies/:id/status',       ctrl.changeCompanyStatus);

// ── People ───────────────────────────────────────────────────────────────────
router.get('/users',           ctrl.users);
router.get('/branches',        ctrl.branches);

// ── POS Activity ─────────────────────────────────────────────────────────────
router.get('/terminals',       ctrl.terminals);
router.get('/sessions',        ctrl.sessions);
router.get('/sales',           ctrl.sales);

// ── Catalog ───────────────────────────────────────────────────────────────────
router.get('/products',        ctrl.products);
router.get('/inventory',       ctrl.inventory);

// ── CRM ──────────────────────────────────────────────────────────────────────
router.get('/customers',       ctrl.customers);
router.get('/payment-methods', ctrl.paymentMethods);

module.exports = router;
