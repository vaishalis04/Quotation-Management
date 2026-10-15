const cron = require('node-cron');
const { expireOverdue } = require('./quotation.service');
const { TIMEZONE } = require('../config/constants');

// every night at 00:10 India time: "sent" quotations past their validity become "expired"
const startExpiryScheduler = () => {
  const run = () => expireOverdue().then((n) => n && console.log(`⏳ ${n} quotation(s) expired`)).catch((e) => console.error('Expiry job failed:', e.message));
  run();
  cron.schedule('10 0 * * *', run, { timezone: TIMEZONE });
};

module.exports = { startExpiryScheduler };
