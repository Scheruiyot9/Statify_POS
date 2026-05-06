const { Router } = require('express');
const { authenticate, attachTenant }           = require('../../middleware/auth.middleware');
const { verifyTenant, scopeTenant,
        requireTenantContext }                  = require('../../middleware/tenant.middleware');
const { requirePermission }                    = require('../../middleware/rbac.middleware');
const controller                               = require('./products.controller');

const router = Router();
router.use(authenticate, attachTenant, verifyTenant, scopeTenant, requireTenantContext);

// ── Read (open to all authenticated tenant users — cashiers browse products) ──
router.get('/categories',                            controller.listCategories);
router.get('/',                                      controller.list);
router.get('/:id',                                   controller.getOne);

// ── Writes require inventory_manager or above ─────────────────────────────────
router.post('/categories',           requirePermission('manage_products'), controller.createCategory);
router.put('/categories/:id',        requirePermission('manage_products'), controller.updateCategory);
router.post('/',                     requirePermission('manage_products'), controller.create);
router.put('/:id',                   requirePermission('manage_products'), controller.update);
router.delete('/:id',                requirePermission('manage_products'), controller.remove);
router.get('/:id/branch-pricing',    requirePermission('manage_products'), controller.listBranchPricing);
router.put('/:id/branch-pricing',    requirePermission('manage_products'), controller.upsertBranchPricing);

module.exports = router;
