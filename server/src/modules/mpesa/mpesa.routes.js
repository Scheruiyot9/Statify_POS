const { Router } = require('express');
const { authenticate, attachTenant }     = require('../../middleware/auth.middleware');
const { verifyTenant, scopeTenant,
        requireTenantContext }           = require('../../middleware/tenant.middleware');
const { requireRole }                   = require('../../middleware/rbac.middleware');
const controller                        = require('./mpesa.controller');

const router = Router();

// ── Public — Daraja sends callbacks here, no auth token ───────────────────────
// Must be registered before the authenticate middleware block below.
router.post('/callback', controller.callback);

// ── All other routes require authentication + tenant context ──────────────────
router.use(authenticate, attachTenant, verifyTenant, scopeTenant, requireTenantContext);

// Config — company_admin only
router.get('/config',  requireRole('company_admin'), controller.getConfig);
router.post('/config', requireRole('company_admin'), controller.saveConfig);

// Transaction list — accountant and above
router.get('/transactions', requireRole('accountant'), controller.list);

// Cashier operations
router.post('/stk-push',                         requireRole('cashier'), controller.stkPush);
router.get('/stk-status/:checkoutRequestId',     requireRole('cashier'), controller.stkStatus);
router.post('/manual',                           requireRole('cashier'), controller.manualEntry);
router.get('/unlinked',                          requireRole('cashier'), controller.unlinked);
router.patch('/:id/link-sale',                   requireRole('cashier'), controller.linkToSale);

module.exports = router;
