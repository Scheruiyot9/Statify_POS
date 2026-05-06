const { Router } = require('express');
const { authenticate, attachTenant }           = require('../../middleware/auth.middleware');
const { verifyTenant, scopeTenant,
        requireTenantContext }                  = require('../../middleware/tenant.middleware');
const { requireRole }                          = require('../../middleware/rbac.middleware');
const controller                               = require('./users.controller');

const router = Router();
router.use(authenticate, attachTenant, verifyTenant, scopeTenant, requireTenantContext);

// ── Roles list — branch_manager+ (needed when assigning roles to new users) ───
router.get('/roles', requireRole('branch_manager'), controller.roles);

// ── User management ───────────────────────────────────────────────────────────
router.get('/',                    requireRole('branch_manager'), controller.list);
router.post('/',                   requireRole('company_admin'),  controller.create);
router.put('/:id',                 requireRole('company_admin'),  controller.update);
router.post('/:id/reset-password', requireRole('company_admin'),  controller.resetPwd);
router.delete('/:id',              requireRole('company_admin'),  controller.remove);

module.exports = router;
