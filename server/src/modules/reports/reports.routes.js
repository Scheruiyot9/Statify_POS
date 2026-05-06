const { Router } = require('express');
const { authenticate, attachTenant }           = require('../../middleware/auth.middleware');
const { verifyTenant, scopeTenant,
        requireTenantContext }                  = require('../../middleware/tenant.middleware');
const { requirePermission }                    = require('../../middleware/rbac.middleware');
const controller                               = require('./reports.controller');

const router = Router();
router.use(authenticate, attachTenant, verifyTenant, scopeTenant);

// Dashboard is accessible to all authenticated users including super_admin
// with no company context (returns platform-wide totals when tenantId is null)
router.get('/dashboard', controller.dashboard);

// Detailed sales reports require a tenant context + accountant role or above
router.get('/sales', requireTenantContext, requirePermission('view_reports'), controller.salesReport);

module.exports = router;
