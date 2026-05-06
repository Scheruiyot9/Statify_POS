const svc = require('./platform.service');

const stats          = async (req, res) => res.json({ success: true, data: await svc.platformStats() });
const companies      = async (req, res) => res.json({ success: true, data: await svc.listAllCompanies(req.query) });
const users          = async (req, res) => res.json({ success: true, data: await svc.listAllUsers(req.query) });
const branches       = async (req, res) => res.json({ success: true, data: await svc.listAllBranches(req.query) });
const terminals      = async (req, res) => res.json({ success: true, data: await svc.listAllTerminals(req.query) });
const sessions       = async (req, res) => res.json({ success: true, data: await svc.listAllSessions(req.query) });
const sales          = async (req, res) => res.json({ success: true, data: await svc.listAllSales(req.query) });
const products       = async (req, res) => res.json({ success: true, data: await svc.listAllProducts(req.query) });
const inventory      = async (req, res) => res.json({ success: true, data: await svc.listAllInventory(req.query) });
const customers      = async (req, res) => res.json({ success: true, data: await svc.listAllCustomers(req.query) });
const paymentMethods = async (req, res) => res.json({ success: true, data: await svc.listAllPaymentMethods(req.query) });

module.exports = { stats, companies, users, branches, terminals, sessions, sales, products, inventory, customers, paymentMethods };
