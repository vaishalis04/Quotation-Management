const ApiResponse = require("../utils/ApiResponse");
const { STATES } = require("../config/states");
const { BUSINESS_TYPES, QUOTATION_STATUS, STATUS_TRANSITIONS, GST_2_EFFECTIVE_DATE } = require("../config/constants");
const { allowedRatesFor } = require("../services/quotation.service");
const { isValidGstin, normalizeGstin, stateCodeFromGstin } = require("../utils/gstin");
const { getState } = require("../config/states");
const { todayStr } = require("../utils/helpers");

module.exports = {
  getStates: (req, res) => res.json(new ApiResponse(200, STATES)),

  getConstants: (req, res) =>
    res.json(new ApiResponse(200, {
      business_types: BUSINESS_TYPES,
      statuses: Object.values(QUOTATION_STATUS),
      status_transitions: STATUS_TRANSITIONS,
      gst_2_effective_date: GST_2_EFFECTIVE_DATE,
    })),

  // GST slabs allowed on a given quotation date (?date=YYYY-MM-DD, default today)
  getGstRates: (req, res) => {
    const date = req.query.date || todayStr();
    res.json(new ApiResponse(200, { date, rates: allowedRatesFor(date) }));
  },

  // for "enter GSTIN, auto-fill state" on a form
  validateGstin: (req, res) => {
    const gstin = normalizeGstin(req.query.gstin);
    const valid = isValidGstin(gstin);
    const state = valid ? getState(stateCodeFromGstin(gstin)) : null;
    res.json(new ApiResponse(200, { gstin, valid, state_code: state ? state.code : null, state: state ? state.name : null }));
  },
};
