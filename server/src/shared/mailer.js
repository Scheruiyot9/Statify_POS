const nodemailer = require('nodemailer');
const env = require('../config/env');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!env.email.host || !env.email.user) {
    return null; // SMTP not configured — dev fallback
  }

  _transporter = nodemailer.createTransport({
    host:   env.email.host,
    port:   env.email.port,
    secure: env.email.secure,
    auth: { user: env.email.user, pass: env.email.pass },
  });

  return _transporter;
}

async function sendMail({ to, subject, html, text }) {
  const transport = getTransporter();

  if (!transport) {
    // Dev fallback — log to console so developers can still test the flow
    console.log('\n📧 [MAILER — no SMTP configured]');
    console.log(`  To     : ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body   : ${text || html}\n`);
    return;
  }

  await transport.sendMail({ from: env.email.from, to, subject, html, text });
}

module.exports = { sendMail };
