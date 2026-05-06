const authService = require('./auth.service');
const env         = require('../../config/env');
const { ok }      = require('../../shared/response');

const COOKIE_NAME = 'rt';
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   env.nodeEnv === 'production',
  sameSite: 'lax',
  path:     '/api/v1/auth',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

const login = async (req, res) => {
  const result = await authService.login(req.body);
  // Send refresh token as httpOnly cookie; access token in body
  res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTS);
  ok(res, { accessToken: result.accessToken, user: result.user });
};

const refresh = async (req, res) => {
  const refreshToken = req.cookies?.[COOKIE_NAME];
  const result = await authService.refresh(refreshToken);
  ok(res, result);
};

const logout = async (req, res) => {
  const refreshToken = req.cookies?.[COOKIE_NAME];
  await authService.logout(refreshToken);
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: 0 });
  ok(res, { message: 'Logged out successfully' });
};

const me = (req, res) => {
  ok(res, { user: req.user });
};

const changePassword = async (req, res) => {
  await authService.changePassword(req.user.userId, req.body);
  // Invalidate the current refresh token cookie after password change
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: 0 });
  ok(res, { message: 'Password updated successfully. Please log in again.' });
};

module.exports = { login, refresh, logout, me, changePassword };
