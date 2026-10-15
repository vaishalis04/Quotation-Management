const { body } = require('express-validator');
const { validate } = require('./common.validation');
const { QUOTATION_STATUS, PRICE_MODES, GST_TREATMENTS, DISCOUNT_TYPES } = require('../config/constants');
const { isValidStateCode } = require('../config/states');

// Structure only - the money rules (slabs, discount limits, decimals) live in the calculator
const shape = (isCreate) => [
  body('customer_id').if(() => isCreate).notEmpty().withMessage('customer_id is required'),
  body('quote_date').optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('quote_date must be YYYY-MM-DD'),
  body('valid_until').optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('valid_until must be YYYY-MM-DD'),
  body('place_of_supply_state_code').optional({ values: 'falsy' }).custom(isValidStateCode).withMessage('Invalid place_of_supply_state_code'),
  body('gst_treatment').optional().isIn(GST_TREATMENTS),
  body('price_mode').optional().isIn(PRICE_MODES),
  body('discount_type').optional({ values: 'null' }).isIn(DISCOUNT_TYPES),
  body('items').if(() => isCreate).isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items').optional().isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.quantity').optional().isNumeric().withMessage('quantity must be a number'),
  body('items.*.discount_type').optional({ values: 'null' }).isIn(DISCOUNT_TYPES),
  body('charges').optional().isArray().withMessage('charges must be an array'),
  validate,
];

const createRules = shape(true);
const updateRules = shape(false);
const calculateRules = shape(true);

const statusRules = [
  body('status').isIn(Object.values(QUOTATION_STATUS).filter((s) => s !== 'revised')).withMessage('Invalid status'),
  body('reason').optional().isString().isLength({ max: 500 }),
  validate,
];

module.exports = { createRules, updateRules, calculateRules, statusRules };
