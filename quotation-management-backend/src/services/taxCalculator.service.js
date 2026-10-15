/**
 * Quotation calculation engine - the single source of truth for every figure.
 *
 * All arithmetic is done with decimal.js (never JS floats). Money is rounded HALF_UP to 2 decimals.
 *
 * Order of operations (same as a GST tax invoice):
 *   1. line amount        = round2(qty x rate)
 *   2. line discount      (percent or amount)                      -> net_line
 *   3. overall discount   (percent or amount of sum(net_line))     -> split across lines in proportion,
 *                          using largest-remainder so the shares add up to the paisa
 *   4. taxable value      exclusive mode: net_line - overall share
 *                         inclusive mode: round2( (net_line - share) / (1 + rate/100) )
 *   5. GST per line       intra-state : CGST = SGST = round2(taxable x rate/200)   (always equal halves)
 *                         inter-state : IGST        = round2(taxable x rate/100)
 *   6. additional charges (freight, installation...) are taxed like lines but are NOT discounted
 *   7. totals, then round-off of the grand total to the nearest rupee (optional)
 *
 * GST is always charged on the value AFTER discount (Sec. 15 CGST Act: discount shown on the invoice reduces value).
 */
const Decimal = require('decimal.js');
const ApiError = require('../utils/ApiError');
const { amountInWords } = require('../utils/numberToWords');

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const ZERO = new D(0);
const HUNDRED = new D(100);

const r2 = (x) => new D(x).toDecimalPlaces(2, D.ROUND_HALF_UP);
const num = (x) => Number(new D(x).toFixed(2));

const toDec = (value, field, label, { min = 0, maxDp = null } = {}) => {
  if (value === null || value === undefined || value === '') {
    throw new ApiError(400, `${label}: ${field} is required`);
  }
  let d;
  try { d = new D(value); } catch (e) { throw new ApiError(400, `${label}: ${field} must be a number`); }
  if (!d.isFinite()) throw new ApiError(400, `${label}: ${field} must be a number`);
  if (d.lt(min)) throw new ApiError(400, `${label}: ${field} cannot be less than ${min}`);
  if (maxDp !== null && d.decimalPlaces() > maxDp) {
    throw new ApiError(400, `${label}: ${field} can have at most ${maxDp} decimal places`);
  }
  return d;
};

// Split `total` (Decimal, 2dp) across `weights` (Decimal[]) in whole paise, largest remainder first.
const allocate = (total, weights) => {
  const totalPaise = total.times(100).toDecimalPlaces(0);
  const weightSum = weights.reduce((a, w) => a.plus(w), ZERO);
  if (totalPaise.isZero() || weightSum.isZero()) return weights.map(() => ZERO);

  const exact = weights.map((w) => totalPaise.times(w).div(weightSum));
  const floors = exact.map((x) => x.floor());
  let leftover = totalPaise.minus(floors.reduce((a, f) => a.plus(f), ZERO)).toNumber();

  const order = exact
    .map((x, i) => ({ i, frac: x.minus(floors[i]) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);

  const paise = floors.slice();
  for (let k = 0; leftover > 0 && k < order.length; k++, leftover--) paise[order[k].i] = paise[order[k].i].plus(1);
  return paise.map((p) => p.div(100));
};

const lineDiscount = (gross, type, value, label) => {
  if (!type || value === undefined || value === null || value === '' || new D(value).isZero()) return ZERO;
  const v = toDec(value, 'discount_value', label);
  if (type === 'percent') {
    if (v.gt(100)) throw new ApiError(400, `${label}: discount percent cannot exceed 100`);
    return r2(gross.times(v).div(HUNDRED));
  }
  if (type === 'amount') {
    if (v.gt(gross)) throw new ApiError(400, `${label}: discount amount cannot exceed the line amount`);
    return r2(v);
  }
  throw new ApiError(400, `${label}: discount_type must be 'percent' or 'amount'`);
};

/**
 * @param {object} input
 *  price_mode      'exclusive' | 'inclusive'            (default exclusive)
 *  gst_treatment   'regular' | 'no_gst'                 (default regular)
 *  supply_type     'intra' | 'inter'                    (required when regular)
 *  discount_type / discount_value                       overall discount (optional)
 *  round_off       boolean                              (default true)
 *  items[]   { quantity, rate, discount_type, discount_value, gst_rate, hsn_sac }
 *  charges[] { name, amount, gst_rate, hsn_sac }
 * @param {object} [options] { allowedRates: number[] }
 */
const calculateQuotation = (input, options = {}) => {
  const priceMode = input.price_mode || 'exclusive';
  const treatment = input.gst_treatment || 'regular';
  const supplyType = input.supply_type;
  const roundOff = input.round_off !== false;
  const items = Array.isArray(input.items) ? input.items : [];
  const charges = Array.isArray(input.charges) ? input.charges : [];

  if (!['exclusive', 'inclusive'].includes(priceMode)) throw new ApiError(400, "price_mode must be 'exclusive' or 'inclusive'");
  if (!['regular', 'no_gst'].includes(treatment)) throw new ApiError(400, "gst_treatment must be 'regular' or 'no_gst'");
  if (treatment === 'regular' && !['intra', 'inter'].includes(supplyType)) {
    throw new ApiError(400, "supply_type must be 'intra' or 'inter'");
  }
  if (items.length === 0) throw new ApiError(400, 'At least one item is required');

  const taxed = treatment === 'regular';
  const inclusive = priceMode === 'inclusive' && taxed; // nothing to carve out when no GST is charged
  const checkRate = (rate, label) => {
    const r = toDec(rate ?? 0, 'gst_rate', label);
    if (r.gt(100)) throw new ApiError(400, `${label}: gst_rate cannot exceed 100`);
    if (options.allowedRates && !options.allowedRates.includes(Number(r))) {
      throw new ApiError(400, `${label}: GST rate ${r} is not a valid slab (allowed: ${options.allowedRates.join(', ')})`);
    }
    return r;
  };

  // ---- 1 & 2: line amount and line discount
  const lines = items.map((it, idx) => {
    const label = `Item ${idx + 1}`;
    const qty = toDec(it.quantity, 'quantity', label, { maxDp: 3 });
    if (qty.lte(0)) throw new ApiError(400, `${label}: quantity must be greater than 0`);
    const rate = toDec(it.rate, 'rate', label, { maxDp: 4 });
    const gross = r2(qty.times(rate));
    const lineDisc = lineDiscount(gross, it.discount_type, it.discount_value, label);
    const gstRate = taxed ? checkRate(it.gst_rate, label) : ZERO;
    return { qty, rate, gross, lineDisc, net: gross.minus(lineDisc), gstRate, hsn_sac: it.hsn_sac || null, kind: 'item' };
  });

  // ---- 3: overall discount, shared across items in proportion to their net value
  const base = lines.reduce((a, l) => a.plus(l.net), ZERO);
  let overall = ZERO;
  if (input.discount_type && input.discount_value !== undefined && input.discount_value !== null && input.discount_value !== '') {
    const v = toDec(input.discount_value, 'discount_value', 'Overall discount');
    if (input.discount_type === 'percent') {
      if (v.gt(100)) throw new ApiError(400, 'Overall discount percent cannot exceed 100');
      overall = r2(base.times(v).div(HUNDRED));
    } else if (input.discount_type === 'amount') {
      if (v.gt(base)) throw new ApiError(400, 'Overall discount cannot exceed the total of all items');
      overall = r2(v);
    } else {
      throw new ApiError(400, "Overall discount_type must be 'percent' or 'amount'");
    }
  }
  const shares = allocate(overall, lines.map((l) => l.net));
  lines.forEach((l, i) => { l.share = shares[i]; l.entered = l.net.minus(shares[i]); });

  // ---- additional charges (never discounted)
  const chargeLines = charges.map((c, idx) => {
    const label = `Charge ${idx + 1}`;
    const amount = r2(toDec(c.amount, 'amount', label));
    const gstRate = taxed ? checkRate(c.gst_rate, label) : ZERO;
    return {
      name: c.name, qty: new D(1), rate: amount, gross: amount, lineDisc: ZERO, share: ZERO, net: amount, entered: amount,
      gstRate, hsn_sac: c.hsn_sac || null, kind: 'charge',
    };
  });

  // ---- 4 & 5: taxable value and GST
  const finish = (l) => {
    l.taxable = inclusive ? r2(l.entered.div(HUNDRED.plus(l.gstRate).div(HUNDRED))) : l.entered;
    l.cgst_rate = ZERO; l.sgst_rate = ZERO; l.igst_rate = ZERO;
    l.cgst = ZERO; l.sgst = ZERO; l.igst = ZERO;
    if (taxed && l.gstRate.gt(0)) {
      if (supplyType === 'intra') {
        const half = l.gstRate.div(2);
        l.cgst_rate = half; l.sgst_rate = half;
        l.cgst = r2(l.taxable.times(l.gstRate).div(200));
        l.sgst = l.cgst; // always equal halves
      } else {
        l.igst_rate = l.gstRate;
        l.igst = r2(l.taxable.times(l.gstRate).div(HUNDRED));
      }
    }
    l.tax = l.cgst.plus(l.sgst).plus(l.igst);
    l.total = l.taxable.plus(l.tax);
    return l;
  };
  lines.forEach(finish);
  chargeLines.forEach(finish);

  // ---- 7: totals
  const sum = (arr, f) => arr.reduce((a, l) => a.plus(f(l)), ZERO);
  const all = [...lines, ...chargeLines];
  const taxableTotal = sum(all, (l) => l.taxable);
  const cgst = sum(all, (l) => l.cgst);
  const sgst = sum(all, (l) => l.sgst);
  const igst = sum(all, (l) => l.igst);
  const taxTotal = cgst.plus(sgst).plus(igst);
  const beforeRound = taxableTotal.plus(taxTotal);
  const grand = roundOff ? beforeRound.toDecimalPlaces(0, D.ROUND_HALF_UP) : beforeRound;

  // ---- HSN/SAC-wise tax summary (grouped by code + rate)
  const groups = new Map();
  all.forEach((l) => {
    const key = `${l.hsn_sac || ''}|${l.gstRate.toString()}`;
    if (!groups.has(key)) {
      groups.set(key, { hsn_sac: l.hsn_sac || '', gst_rate: l.gstRate, taxable: ZERO, cgst: ZERO, sgst: ZERO, igst: ZERO, tax: ZERO,
        cgst_rate: l.cgst_rate, sgst_rate: l.sgst_rate, igst_rate: l.igst_rate });
    }
    const g = groups.get(key);
    g.taxable = g.taxable.plus(l.taxable); g.cgst = g.cgst.plus(l.cgst); g.sgst = g.sgst.plus(l.sgst);
    g.igst = g.igst.plus(l.igst); g.tax = g.tax.plus(l.tax);
  });

  const outLine = (l) => ({
    quantity: Number(l.qty.toString()),
    rate: Number(l.rate.toString()),
    gross_amount: num(l.gross),
    line_discount: num(l.lineDisc),
    overall_discount_share: num(l.share),
    taxable_amount: num(l.taxable),
    gst_rate: Number(l.gstRate.toString()),
    cgst_rate: Number(l.cgst_rate.toString()), cgst_amount: num(l.cgst),
    sgst_rate: Number(l.sgst_rate.toString()), sgst_amount: num(l.sgst),
    igst_rate: Number(l.igst_rate.toString()), igst_amount: num(l.igst),
    tax_amount: num(l.tax),
    line_total: num(l.total),
  });

  return {
    price_mode: priceMode,
    gst_treatment: treatment,
    supply_type: taxed ? supplyType : null,
    items: lines.map(outLine),
    charges: chargeLines.map(outLine),
    tax_summary: [...groups.values()].map((g) => ({
      hsn_sac: g.hsn_sac, gst_rate: Number(g.gst_rate.toString()), taxable_amount: num(g.taxable),
      cgst_rate: Number(g.cgst_rate.toString()), cgst_amount: num(g.cgst),
      sgst_rate: Number(g.sgst_rate.toString()), sgst_amount: num(g.sgst),
      igst_rate: Number(g.igst_rate.toString()), igst_amount: num(g.igst),
      tax_amount: num(g.tax),
    })),
    totals: {
      items_gross: num(sum(lines, (l) => l.gross)),
      line_discount_total: num(sum(lines, (l) => l.lineDisc)),
      overall_discount: num(overall),
      items_taxable: num(sum(lines, (l) => l.taxable)),
      charges_taxable: num(sum(chargeLines, (l) => l.taxable)),
      taxable_amount: num(taxableTotal),
      cgst_amount: num(cgst),
      sgst_amount: num(sgst),
      igst_amount: num(igst),
      tax_amount: num(taxTotal),
      total_before_round: num(beforeRound),
      round_off: num(grand.minus(beforeRound)),
      grand_total: num(grand),
      amount_in_words: amountInWords(num(grand)),
    },
  };
};

module.exports = { calculateQuotation, allocate, D, r2 };
