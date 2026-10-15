/**
 * Excel layouts use {{double.brace}} tags in cells.
 *  - A row containing {{items.xxx}}, {{charges.xxx}}, {{tax_summary.xxx}} or {{terms.xxx}} is the "repeat row":
 *    it is copied once per entry (formatting included). With no entries the row is removed.
 *  - A cell that is exactly one tag receives the real number/date value (so Excel can still sum it);
 *    a cell with text around the tag ("Total: {{totals.grand_total}}") receives the formatted text.
 */
const ExcelJS = require('exceljs');
const ApiError = require('../../utils/ApiError');

const LOOPS = ['items', 'charges', 'tax_summary', 'terms'];
const TAG = /\{\{\s*([\w.]+)\s*\}\}/g;
const LOOP_TAG = new RegExp(`\\{\\{\\s*(${LOOPS.join('|')})\\.`);
const MONEY_FIELDS = new Set(['rate', 'gross', 'discount', 'taxable', 'cgst', 'sgst', 'igst', 'tax', 'total', 'amount',
  'line_discount', 'total_discount', 'round_off', 'grand_total']);

const getPath = (obj, p) => p.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

const cellText = (cell) => {
  const v = cell.value;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
  return '';
};

const fillCell = (cell, lookup) => {
  const text = cellText(cell);
  if (!text || !text.includes('{{')) return;

  const whole = /^\s*\{\{\s*([\w.]+)\s*\}\}\s*$/.exec(text);
  if (whole) {
    const hit = lookup(whole[1]);
    if (hit.raw === undefined) { cell.value = ''; return; }
    cell.value = hit.raw;
    const field = whole[1].split('.').pop();
    if (typeof hit.raw === 'number' && MONEY_FIELDS.has(field) && (!cell.numFmt || cell.numFmt === 'General')) {
      cell.numFmt = '#,##0.00';
    }
    return;
  }
  cell.value = text.replace(TAG, (_m, p) => {
    const hit = lookup(p);
    return hit.formatted === undefined || hit.formatted === null ? '' : String(hit.formatted);
  });
};

const render = async (buffer, { formatted, raw }) => {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (err) {
    throw new ApiError(400, 'The Excel layout could not be read', [err.message]);
  }

  const globalLookup = (p) => ({ formatted: getPath(formatted, p), raw: getPath(raw, p) });

  wb.eachSheet((ws) => {
    // 1. find repeat rows
    const loopRows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      let loop = null;
      row.eachCell({ includeEmpty: false }, (cell) => {
        const m = LOOP_TAG.exec(cellText(cell));
        if (m) loop = m[1];
      });
      if (loop) loopRows.push({ rowNumber, loop });
    });

    // 2. expand bottom-up so earlier row numbers stay valid
    loopRows.sort((a, b) => b.rowNumber - a.rowNumber).forEach(({ rowNumber, loop }) => {
      const fRows = formatted[loop] || [];
      const rRows = raw[loop] || [];
      if (fRows.length === 0) { ws.spliceRows(rowNumber, 1); return; }
      if (fRows.length > 1) ws.duplicateRow(rowNumber, fRows.length - 1, true);
      fRows.forEach((fRow, i) => {
        const lookup = (p) => (p.startsWith(`${loop}.`)
          ? { formatted: getPath(fRow, p.slice(loop.length + 1)), raw: getPath(rRows[i], p.slice(loop.length + 1)) }
          : globalLookup(p));
        ws.getRow(rowNumber + i).eachCell({ includeEmpty: false }, (cell) => fillCell(cell, lookup));
      });
    });

    // 3. everything else
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => fillCell(cell, globalLookup)));
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
};

module.exports = { render };
