const { body } = require('express-validator');
const { validate } = require('./common.validation');
const { isValidGstin, stateCodeFromGstin, normalizeGstin } = require('../utils/gstin');
const { isValidStateCode } = require('../config/states');
const { BUSINESS_TYPES } = require('../config/constants');

const optionalGstin = body('gstin').optional({ values: 'falsy' }).custom((v, { req }) => {
  if (!isValidGstin(v)) throw new Error('GSTIN is not valid (check the 15 characters and checksum)');
  const stateCode = req.body.state_code;
  if (stateCode && stateCodeFromGstin(v) !== String(stateCode).padStart(2, '0')) {
    throw new Error('GSTIN state code does not match state_code');
  }
  return true;
});
const optionalPan = body('pan').optional({ values: 'falsy' }).trim().toUpperCase().matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/).withMessage('PAN is not valid');
const optionalStateCode = (field) =>
  body(field).optional({ values: 'falsy' }).custom((v) => isValidStateCode(v)).withMessage(`${field} is not a valid GST state code`);

const companyRules = [
  body('name').optional().trim().notEmpty().withMessage('Company name cannot be empty'),
  body('business_type').optional().isIn(BUSINESS_TYPES).withMessage(`business_type must be one of ${BUSINESS_TYPES.join(', ')}`),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Valid email is required'),
  optionalGstin, optionalPan, optionalStateCode('state_code'),
  body('quote_prefix').optional().trim().matches(/^[A-Za-z0-9-]{1,20}$/).withMessage('quote_prefix: letters, digits and - only (max 20)'),
  body('quote_number_padding').optional().isInt({ min: 1, max: 8 }).withMessage('quote_number_padding must be 1-8'),
  body('default_validity_days').optional().isInt({ min: 0, max: 365 }).withMessage('default_validity_days must be 0-365'),
  body('default_gst_treatment').optional().isIn(['regular', 'no_gst']),
  body('default_price_mode').optional().isIn(['exclusive', 'inclusive']),
  validate,
];

const createCompanyRules = [
  body('name').trim().notEmpty().withMessage('Company name is required'),
  ...companyRules.slice(1, -1),
  body('admin_name').optional().trim().notEmpty(),
  body('admin_email').optional().isEmail().withMessage('Valid admin_email is required'),
  body('admin_password').optional().isLength({ min: 8 }).withMessage('admin_password must be at least 8 characters'),
  validate,
];

const customerRules = [
  body('name').if((v, { req }) => req.method === 'POST' || req.body.name !== undefined).trim().notEmpty().withMessage('Customer name is required'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Valid email is required'),
  optionalGstin, optionalPan, optionalStateCode('state_code'), optionalStateCode('shipping_state_code'),
  validate,
];

const itemRules = [
  body('name').if((v, { req }) => req.method === 'POST' || req.body.name !== undefined).trim().notEmpty().withMessage('Item name is required'),
  body('item_type').optional().isIn(['product', 'service']).withMessage("item_type must be 'product' or 'service'"),
  body('rate').optional().isFloat({ min: 0 }).withMessage('rate must be 0 or more'),
  body('cost_price').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('cost_price must be 0 or more'),
  body('gst_rate').optional().isFloat({ min: 0, max: 100 }).withMessage('gst_rate must be between 0 and 100'),
  body('hsn_sac').optional({ values: 'falsy' }).matches(/^[0-9]{4,8}$/).withMessage('HSN/SAC must be 4 to 8 digits'),
  validate,
];

const termsRules = [
  body('name').if((v, { req }) => req.method === 'POST' || req.body.name !== undefined).trim().notEmpty().withMessage('Name is required'),
  body('content').if((v, { req }) => req.method === 'POST' || req.body.content !== undefined).trim().notEmpty().withMessage('Content is required'),
  body('business_type').optional().isIn(BUSINESS_TYPES),
  validate,
];

module.exports = { companyRules, createCompanyRules, customerRules, itemRules, termsRules, normalizeGstin };
