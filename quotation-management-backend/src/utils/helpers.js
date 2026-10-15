const moment = require('moment-timezone');
const { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT, TIMEZONE } = require('../config/constants');

const getPagination = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || DEFAULT_PAGE, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  return { page, limit, offset: (page - 1) * limit };
};

const paginationMeta = (count, page, limit) => ({
  total: count,
  page,
  limit,
  totalPages: Math.ceil(count / limit) || 1,
});

// Company scoping: super_admin may pass ?companyId=, everyone else is locked to their own company
const getCompanyId = (req) => {
  if (req.user.role === 'super_admin') {
    return req.query.companyId || req.body?.companyId || null;
  }
  return req.user.company_id;
};

const todayStr = () => moment().tz(TIMEZONE).format('YYYY-MM-DD');

const safeJSONParse = (str, fallback = {}) => {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return fallback;
  }
};

// Indian financial year (1 Apr - 31 Mar): '2026-10-14' -> '2026-27', '2027-02-01' -> '2026-27'
const financialYearOf = (dateStr) => {
  const m = moment(dateStr, 'YYYY-MM-DD', true);
  const y = m.month() >= 3 ? m.year() : m.year() - 1; // month() is 0-based: 3 = April
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

// Copy only the keys that were actually sent
const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
};

const blankToNull = (v) => (v === '' || v === undefined ? null : v);

module.exports = { getPagination, paginationMeta, getCompanyId, todayStr, safeJSONParse, financialYearOf, pick, blankToNull };
