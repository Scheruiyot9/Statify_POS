const svc = require('./companies.service');

const list = async (req, res) => {
  const result = await svc.listCompanies(req.query);
  res.json({ success: true, data: result });
};

const getOne = async (req, res) => {
  const company = await svc.getCompany(req.params.id);
  res.json({ success: true, data: company });
};

const create = async (req, res) => {
  const result = await svc.createCompany(req.body);
  res.status(201).json({ success: true, data: result });
};

const update = async (req, res) => {
  const company = await svc.updateCompany(req.params.id, req.body);
  res.json({ success: true, data: company });
};

const updateStatus = async (req, res) => {
  const company = await svc.updateSubscriptionStatus(req.params.id, req.body);
  res.json({ success: true, data: company });
};

const listPlans = async (_req, res) => {
  const plans = await svc.listSubscriptionPlans();
  res.json({ success: true, data: plans });
};

const getMine = async (req, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.json({ success: true, data: null });
  const company = await svc.getMyCompany(companyId);
  res.json({ success: true, data: company });
};

const getLoyaltySettings = async (req, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(400).json({ success: false, message: 'No company context' });
  const settings = await svc.getLoyaltySettings(companyId);
  res.json({ success: true, data: settings });
};

const updateLoyaltySettings = async (req, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(400).json({ success: false, message: 'No company context' });
  const settings = await svc.updateLoyaltySettings(companyId, req.body);
  res.json({ success: true, data: settings });
};

const updateMyProfile = async (req, res) => {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(400).json({ success: false, message: 'No company context' });
  const company = await svc.updateMyProfile(companyId, req.body);
  res.json({ success: true, data: company });
};

module.exports = { list, getOne, create, update, updateStatus, listPlans, getMine, updateMyProfile, getLoyaltySettings, updateLoyaltySettings };
