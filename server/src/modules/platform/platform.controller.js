const svc = require('./platform.service');

const r = (res, data, status = 200) => res.status(status).json({ success: true, data });

// Overview
const stats          = async (req, res) => r(res, await svc.platformStats());

// Subscription Plans
const listPlans      = async (req, res) => r(res, await svc.listPlans());
const createPlan     = async (req, res) => r(res, await svc.createPlan(req.body), 201);
const updatePlan     = async (req, res) => r(res, await svc.updatePlan(req.params.id, req.body));
const deletePlan     = async (req, res) => r(res, await svc.deletePlan(req.params.id));

// Companies
const companies           = async (req, res) => r(res, await svc.listAllCompanies(req.query));
const changeCompanyPlan   = async (req, res) => r(res, await svc.changeCompanyPlan(req.params.id, req.body.plan_id));
const changeCompanyStatus = async (req, res) => r(res, await svc.changeCompanyStatus(req.params.id, req.body.status));

// People
const users          = async (req, res) => r(res, await svc.listAllUsers(req.query));
const branches       = async (req, res) => r(res, await svc.listAllBranches(req.query));

// POS Activity
const terminals      = async (req, res) => r(res, await svc.listAllTerminals(req.query));
const sessions       = async (req, res) => r(res, await svc.listAllSessions(req.query));
const sales          = async (req, res) => r(res, await svc.listAllSales(req.query));

// Catalog
const products       = async (req, res) => r(res, await svc.listAllProducts(req.query));
const inventory      = async (req, res) => r(res, await svc.listAllInventory(req.query));

// CRM
const customers      = async (req, res) => r(res, await svc.listAllCustomers(req.query));
const paymentMethods = async (req, res) => r(res, await svc.listAllPaymentMethods(req.query));

module.exports = {
  stats,
  listPlans, createPlan, updatePlan, deletePlan,
  companies, changeCompanyPlan, changeCompanyStatus,
  users, branches,
  terminals, sessions, sales,
  products, inventory,
  customers, paymentMethods,
};
