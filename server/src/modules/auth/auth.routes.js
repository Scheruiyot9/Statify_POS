const { Router }    = require('express');
const rateLimit     = require('express-rate-limit');
const Joi           = require('joi');
const controller    = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { validate }  = require('../../shared/validators/common.validators');

const router = Router();

// Strict rate limit on login to slow brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

// Moderate rate limit on refresh — prevents token probing without breaking normal use
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many refresh attempts. Try again shortly.' },
});

const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword:     Joi.string().min(8).required(),
});

// Public
router.post('/login',   loginLimiter,   validate(loginSchema), controller.login);
// Refresh token comes from httpOnly cookie — no body schema needed
router.post('/refresh', refreshLimiter, controller.refresh);

// Protected
router.post('/logout',          authenticate, controller.logout);
router.get('/me',               authenticate, controller.me);
router.patch('/change-password', authenticate, validate(changePasswordSchema), controller.changePassword);

module.exports = router;
