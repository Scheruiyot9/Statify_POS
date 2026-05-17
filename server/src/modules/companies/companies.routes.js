const { Router } = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole }  = require('../../middleware/rbac.middleware');
const controller       = require('./companies.controller');

const router = Router();

// Plans are visible to any authenticated user (needed for upgrade prompts)
router.get('/plans', authenticate, controller.listPlans);

// My company info — any authenticated user (for branding/logo in UI)
router.get('/mine', authenticate, controller.getMine);

// Loyalty settings — company_admin of their own tenant
router.get('/mine/loyalty',   authenticate, requireRole('company_admin'), controller.getLoyaltySettings);
router.patch('/mine/loyalty', authenticate, requireRole('company_admin'), controller.updateLoyaltySettings);

// Company profile (KRA PIN etc.) — company_admin
router.patch('/mine/profile', authenticate, requireRole('company_admin'), controller.updateMyProfile);

// All remaining routes are super_admin only — no tenant context required
router.use(authenticate, requireRole('super_admin'));

router.get('/',                 controller.list);
router.post('/',                controller.create);
router.get('/:id',              controller.getOne);
router.patch('/:id',            controller.update);
router.patch('/:id/status',     controller.updateStatus);
router.delete('/:id',           controller.remove);

module.exports = router;
