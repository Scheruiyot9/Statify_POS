const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const { query } = require('../../config/database');
const env      = require('../../config/env');
const AppError = require('../../shared/AppError');

const signAccess = (payload) =>
  jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

const signRefresh = (payload) =>
  jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn });

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// Build the JWT payload: includes role, assigned branches, and permission codes
const buildTokenPayload = async (user) => {
  const [branchRes, permRes, planRes] = await Promise.all([
    query(`SELECT branch_id FROM user_branch_assignments WHERE user_id = $1`, [user.user_id]),
    query(
      `SELECT p.permission_code
         FROM role_permissions rp
         JOIN permissions p ON p.permission_id = rp.permission_id
         JOIN user_roles ur  ON ur.role_id = rp.role_id
        WHERE ur.user_id = $1`,
      [user.user_id]
    ),
    // Fetch plan feature flags for tenant users; super_admin has no company
    user.company_id
      ? query(
          `SELECT sp.has_finance, sp.has_api_access
             FROM companies c
             JOIN subscription_plans sp ON sp.plan_id = c.subscription_plan_id
            WHERE c.company_id = $1`,
          [user.company_id]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const plan = planRes.rows[0];
  return {
    userId:      user.user_id,
    companyId:   user.company_id,
    role:        user.role_name,
    branchIds:   branchRes.rows.map((r) => r.branch_id),
    permissions: permRes.rows.map((r) => r.permission_code),
    planFeatures: {
      hasFinance:   user.role_name === 'super_admin' ? true : (plan?.has_finance  ?? false),
      hasApiAccess: user.role_name === 'super_admin' ? true : (plan?.has_api_access ?? false),
    },
  };
};

const login = async ({ email, password }) => {
  const { rows } = await query(
    `SELECT u.user_id, u.company_id, u.password_hash, u.is_active,
            u.first_name, u.last_name,
            r.role_name
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles r        ON r.role_id  = ur.role_id
      WHERE u.email = $1
      LIMIT 1`,
    [email.toLowerCase().trim()]
  );

  const user = rows[0];
  if (!user) throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  if (!user.is_active) throw AppError.forbidden('Account is deactivated', 'ACCOUNT_INACTIVE');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  await query('UPDATE users SET last_login = now() WHERE user_id = $1', [user.user_id]);

  const payload      = await buildTokenPayload(user);
  const accessToken  = signAccess(payload);
  const refreshToken = signRefresh({ userId: user.user_id });

  // Store hashed refresh token for server-side revocation
  const expiresAt = new Date(Date.now() + parseDuration(env.jwt.refreshExpiresIn));
  await query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.user_id, hashToken(refreshToken), expiresAt]
  );

  return {
    accessToken,
    refreshToken,
    user: {
      userId:       user.user_id,
      firstName:    user.first_name,
      lastName:     user.last_name,
      role:         user.role_name,
      companyId:    user.company_id,
      branchIds:    payload.branchIds,
      planFeatures: payload.planFeatures,
    },
  };
};

const refresh = async (refreshToken) => {
  if (!refreshToken) throw AppError.unauthorized('Refresh token required', 'INVALID_REFRESH_TOKEN');

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Verify the session still exists and hasn't been revoked
  const { rows: sessionRows } = await query(
    `SELECT session_id FROM user_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(refreshToken)]
  );
  if (!sessionRows.length) {
    throw AppError.unauthorized('Session revoked or expired — please log in again', 'SESSION_REVOKED');
  }

  const { rows } = await query(
    `SELECT u.user_id, u.company_id, u.is_active, r.role_name
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles r        ON r.role_id  = ur.role_id
      WHERE u.user_id = $1 LIMIT 1`,
    [decoded.userId]
  );

  if (!rows.length || !rows[0].is_active)
    throw AppError.unauthorized('User not found or inactive', 'USER_INACTIVE');

  const p          = await buildTokenPayload(rows[0]);
  const accessToken = signAccess(p);
  return { accessToken };
};

const logout = async (refreshToken) => {
  if (!refreshToken) return;
  try {
    await query(
      `UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'logout'
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(refreshToken)]
    );
  } catch {
    // Non-fatal: token may already be expired/unknown
  }
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const { rows } = await query(
    'SELECT password_hash FROM users WHERE user_id = $1',
    [userId]
  );
  if (!rows.length) throw AppError.notFound('User');

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw AppError.badRequest('Current password is incorrect', 'WRONG_PASSWORD');

  const hash = await bcrypt.hash(newPassword, env.bcryptRounds);
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE user_id = $2', [hash, userId]);

  // Revoke all active sessions — force re-login everywhere after password change
  await query(
    `UPDATE user_sessions SET revoked_at = now(), revoked_reason = 'password_change'
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
};

// Convert JWT duration strings like '7d', '15m', '1h' to milliseconds
function parseDuration(str) {
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  const m = String(str).match(/^(\d+)([smhdw])$/);
  if (!m) return 7 * 86400000; // default 7 days
  return parseInt(m[1], 10) * (units[m[2]] || 86400000);
}

module.exports = { login, refresh, logout, changePassword };
