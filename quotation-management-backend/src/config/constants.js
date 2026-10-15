module.exports = {
  ROLES: {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'company_admin',
    MANAGER: 'manager',   // can approve/send/accept quotations and manage masters
    SALES: 'sales',       // can create and edit own draft quotations
  },

  BUSINESS_TYPES: ['cctv', 'security', 'it', 'electrical', 'other'],

  ITEM_TYPES: ['product', 'service'],

  QUOTATION_STATUS: {
    DRAFT: 'draft',
    SENT: 'sent',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
    REVISED: 'revised',     // set automatically on the OLD version when a revision is created
    CANCELLED: 'cancelled',
  },

  // status -> statuses it may move to (REVISED is only set by the revise action)
  STATUS_TRANSITIONS: {
    draft: ['sent', 'cancelled'],
    sent: ['accepted', 'rejected', 'expired', 'cancelled'],
    accepted: ['cancelled'],
    rejected: [],
    expired: [],
    revised: [],
    cancelled: [],
  },

  PRICE_MODES: ['exclusive', 'inclusive'],
  GST_TREATMENTS: ['regular', 'no_gst'], // no_gst = composition dealer / exempt supply (bill of supply, no tax shown)
  DISCOUNT_TYPES: ['percent', 'amount'],

  // GST slabs valid for quotations dated on/after GST 2.0 (22 Sep 2025), plus the special low rates.
  // Override with GST_ALLOWED_RATES=0,5,18,40 if the Council changes things again.
  GST_RATES_CURRENT: (process.env.GST_ALLOWED_RATES
    ? process.env.GST_ALLOWED_RATES.split(',').map(Number)
    : [0, 0.1, 0.25, 1, 1.5, 3, 5, 18, 40]),
  // Extra slabs that were legal before GST 2.0 - allowed only for quotes dated before the cut-over
  GST_RATES_LEGACY_EXTRA: [7.5, 12, 28],
  GST_2_EFFECTIVE_DATE: '2025-09-22',

  TEMPLATE_FORMATS: ['docx', 'xlsx', 'html'],

  TIMEZONE: process.env.APP_TIMEZONE || 'Asia/Kolkata',

  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};
