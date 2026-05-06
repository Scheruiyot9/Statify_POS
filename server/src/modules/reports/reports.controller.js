const { getDashboard, getSalesReport } = require('./reports.service');

const dashboard = async (req, res) => {
  const companyId = req.tenantId || null;
  const { role, branchIds = [] } = req.user;
  const { period = '7d' } = req.query;
  const data = await getDashboard(companyId, role, branchIds, { period });
  res.json({ success: true, data });
};

const salesReport = async (req, res) => {
  const { role, branchIds = [] } = req.user;
  const { startDate, endDate, branchId } = req.query;
  const data = await getSalesReport(req.tenantId, role, branchIds, { startDate, endDate, branchId });
  res.json({ success: true, data });
};

module.exports = { dashboard, salesReport };
