const { Router }      = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole }  = require('../../middleware/rbac.middleware');
const ctrl             = require('./platform.controller');

const router = Router();

// All platform routes: authenticated super_admin only — no tenant context needed
router.use(authenticate, requireRole('super_admin'));

router.get('/stats',           ctrl.stats);
router.get('/companies',       ctrl.companies);
router.get('/users',           ctrl.users);
router.get('/branches',        ctrl.branches);
router.get('/terminals',       ctrl.terminals);
router.get('/sessions',        ctrl.sessions);
router.get('/sales',           ctrl.sales);
router.get('/products',        ctrl.products);
router.get('/inventory',       ctrl.inventory);
router.get('/customers',       ctrl.customers);
router.get('/payment-methods', ctrl.paymentMethods);

module.exports = router;
