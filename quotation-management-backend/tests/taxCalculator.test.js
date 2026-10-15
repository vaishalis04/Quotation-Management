const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateQuotation, allocate, D } = require('../src/services/taxCalculator.service');
const { isValidGstin } = require('../src/utils/gstin');
const { amountInWords } = require('../src/utils/numberToWords');
const { formatINR } = require('../src/utils/format');

const base = { supply_type: 'intra', items: [{ quantity: 1, rate: 100, gst_rate: 18 }] };

test('simple intra-state 18%: CGST = SGST = 9', () => {
  const r = calculateQuotation(base);
  assert.equal(r.totals.taxable_amount, 100);
  assert.equal(r.totals.cgst_amount, 9);
  assert.equal(r.totals.sgst_amount, 9);
  assert.equal(r.totals.igst_amount, 0);
  assert.equal(r.totals.grand_total, 118);
});

test('inter-state uses IGST only', () => {
  const r = calculateQuotation({ ...base, supply_type: 'inter' });
  assert.equal(r.totals.igst_amount, 18);
  assert.equal(r.totals.cgst_amount, 0);
});

test('CGST and SGST are always equal, even on odd-paise tax', () => {
  // 33.33 x 18% = 5.9994 -> CGST 3.00 SGST 3.00 (never 2.99/3.00)
  const r = calculateQuotation({ supply_type: 'intra', items: [{ quantity: 1, rate: 33.33, gst_rate: 18 }] });
  assert.equal(r.items[0].cgst_amount, r.items[0].sgst_amount);
});

test('line discount percent is applied BEFORE GST', () => {
  const r = calculateQuotation({ supply_type: 'intra', items: [{ quantity: 2, rate: 1000, discount_type: 'percent', discount_value: 10, gst_rate: 18 }] });
  assert.equal(r.items[0].gross_amount, 2000);
  assert.equal(r.items[0].line_discount, 200);
  assert.equal(r.items[0].taxable_amount, 1800);
  assert.equal(r.items[0].tax_amount, 324);
  assert.equal(r.totals.grand_total, 2124);
});

test('overall discount is shared across lines and adds up exactly', () => {
  const r = calculateQuotation({
    supply_type: 'intra', discount_type: 'amount', discount_value: 100,
    items: [
      { quantity: 1, rate: 333.33, gst_rate: 18 },
      { quantity: 1, rate: 333.33, gst_rate: 18 },
      { quantity: 1, rate: 333.34, gst_rate: 18 },
    ],
  });
  const shares = r.items.reduce((a, i) => a + i.overall_discount_share, 0);
  assert.equal(Number(shares.toFixed(2)), 100);
  assert.equal(r.totals.overall_discount, 100);
  assert.equal(r.totals.taxable_amount, 900);
});

test('largest-remainder allocation sums to the paisa', () => {
  const out = allocate(new D('0.10'), [new D(1), new D(1), new D(1)]);
  assert.equal(out.reduce((a, x) => a.plus(x), new D(0)).toString(), '0.1');
});

test('mixed GST rates across lines + HSN summary', () => {
  const r = calculateQuotation({
    supply_type: 'intra',
    items: [
      { quantity: 4, rate: 2500, gst_rate: 18, hsn_sac: '8525' },
      { quantity: 1, rate: 1000, gst_rate: 5, hsn_sac: '8544' },
      { quantity: 2, rate: 500, gst_rate: 18, hsn_sac: '8525' },
    ],
  });
  assert.equal(r.tax_summary.length, 2);
  const cam = r.tax_summary.find((s) => s.hsn_sac === '8525');
  assert.equal(cam.taxable_amount, 11000);
  assert.equal(cam.cgst_amount, 990);
  assert.equal(r.totals.tax_amount, 1980 + 50);
});

test('tax-inclusive pricing: 118 incl 18% => taxable 100, tax 18', () => {
  const r = calculateQuotation({ price_mode: 'inclusive', supply_type: 'inter', items: [{ quantity: 1, rate: 118, gst_rate: 18 }] });
  assert.equal(r.items[0].taxable_amount, 100);
  assert.equal(r.items[0].igst_amount, 18);
  assert.equal(r.totals.grand_total, 118);
});

test('additional charges are taxed but not discounted', () => {
  const r = calculateQuotation({
    supply_type: 'intra', discount_type: 'percent', discount_value: 10,
    items: [{ quantity: 1, rate: 1000, gst_rate: 18 }],
    charges: [{ name: 'Installation', amount: 500, gst_rate: 18, hsn_sac: '995469' }],
  });
  assert.equal(r.totals.overall_discount, 100);
  assert.equal(r.charges[0].taxable_amount, 500);
  assert.equal(r.totals.taxable_amount, 1400);
  assert.equal(r.totals.tax_amount, 252);
  assert.equal(r.totals.grand_total, 1652);
});

test('no_gst treatment charges no tax, even when a rate is passed', () => {
  const r = calculateQuotation({ gst_treatment: 'no_gst', price_mode: 'inclusive', items: [{ quantity: 3, rate: 100, gst_rate: 18 }] });
  assert.equal(r.totals.tax_amount, 0);
  assert.equal(r.totals.grand_total, 300);
});

test('round-off goes to nearest rupee and is reported', () => {
  const r = calculateQuotation({ supply_type: 'intra', items: [{ quantity: 1, rate: 99.99, gst_rate: 18 }] });
  // 99.99 + 9.00 + 9.00 (9.0 rounds from 8.9991) = 117.99 -> 118.00
  assert.equal(r.totals.total_before_round, 117.99);
  assert.equal(r.totals.grand_total, 118);
  assert.equal(r.totals.round_off, 0.01);
  const off = calculateQuotation({ round_off: false, supply_type: 'intra', items: [{ quantity: 1, rate: 99.99, gst_rate: 18 }] });
  assert.equal(off.totals.grand_total, 117.99);
});

test('floating-point trap: 0.1 x 3 and 1.1 x 3 are exact', () => {
  const r = calculateQuotation({ supply_type: 'intra', round_off: false, items: [{ quantity: 3, rate: 1.1, gst_rate: 0 }] });
  assert.equal(r.totals.grand_total, 3.3);
});

test('validation errors', () => {
  assert.throws(() => calculateQuotation({ supply_type: 'intra', items: [] }), /At least one item/);
  assert.throws(() => calculateQuotation({ supply_type: 'intra', items: [{ quantity: 0, rate: 1, gst_rate: 18 }] }), /greater than 0/);
  assert.throws(() => calculateQuotation({ supply_type: 'intra', items: [{ quantity: 1, rate: 100, discount_type: 'amount', discount_value: 150, gst_rate: 18 }] }), /cannot exceed/);
  assert.throws(() => calculateQuotation({ items: [{ quantity: 1, rate: 1, gst_rate: 18 }] }), /supply_type/);
  assert.throws(() => calculateQuotation({ supply_type: 'intra', items: [{ quantity: 1, rate: 1, gst_rate: 12 }] }, { allowedRates: [0, 5, 18, 40] }), /not a valid slab/);
});

test('GSTIN checksum', () => {
  assert.equal(isValidGstin('27AAPFU0939F1ZV'), true);
  assert.equal(isValidGstin('27AAPFU0939F1ZX'), false);
  assert.equal(isValidGstin('123'), false);
});

test('amount in words (Indian system)', () => {
  assert.equal(amountInWords(118), 'Rupees One Hundred Eighteen Only');
  assert.equal(amountInWords(123456.5), 'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only');
  assert.equal(amountInWords(10000000), 'Rupees One Crore Only');
  assert.equal(amountInWords(0.05), 'Five Paise Only');
});

test('Indian number formatting', () => {
  assert.equal(formatINR(1234567.5), '12,34,567.50');
  assert.equal(formatINR(999), '999.00');
  assert.equal(formatINR(100000), '1,00,000.00');
  assert.equal(formatINR(-1234.5), '-1,234.50');
});
