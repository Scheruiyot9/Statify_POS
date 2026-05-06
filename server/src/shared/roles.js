// Roles that can see all branches in a company without explicit branch assignment
const COMPANY_WIDE_ROLES = ['super_admin', 'company_admin', 'accountant', 'inventory_manager'];

const isCompanyWide = (role) => COMPANY_WIDE_ROLES.includes(role);

/**
 * Build a WHERE clause fragment + params array for branch scoping.
 * tableAlias is the SQL alias prefix for branch_id (default 'st').
 */
function branchScope(role, companyId, branchIds, tableAlias = 'st') {
  if (isCompanyWide(role)) {
    return { clause: '', params: [companyId] };
  }
  const ids = branchIds && branchIds.length
    ? branchIds
    : ['00000000-0000-0000-0000-000000000000'];
  return { clause: `AND ${tableAlias}.branch_id = ANY($2)`, params: [companyId, ids] };
}

/**
 * Resolve which branchId to use for a request, enforcing access control.
 * opts.from: array of sources to check in order (default: query then body)
 * opts.required: throw if not found (default true)
 */
function resolveBranchId(req, { from = ['query', 'body'], required = true } = {}) {
  let branchId;
  for (const source of from) {
    branchId = source === 'query' ? req.query?.branchId : req.body?.branchId;
    if (branchId) break;
  }
  if (!branchId) branchId = req.user.branchIds?.[0];

  if (!branchId) {
    if (required) {
      const AppError = require('./AppError');
      throw AppError.badRequest('branchId is required');
    }
    return null;
  }

  if (!isCompanyWide(req.user.role) && !req.user.branchIds?.includes(branchId)) {
    const AppError = require('./AppError');
    throw AppError.forbidden('You do not have access to this branch');
  }

  return branchId;
}

module.exports = { COMPANY_WIDE_ROLES, isCompanyWide, branchScope, resolveBranchId };
