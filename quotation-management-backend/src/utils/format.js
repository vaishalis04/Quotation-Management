// Indian digit grouping: 1234567.5 -> "12,34,567.50"
const formatINR = (value, decimals = 2) => {
  if (value === null || value === undefined || value === '') return '';
  const fixed = Number(value).toFixed(decimals);
  const negative = fixed.startsWith('-');
  const [intPart, decPart] = fixed.replace('-', '').split('.');
  let grouped;
  if (intPart.length <= 3) grouped = intPart;
  else grouped = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + intPart.slice(-3);
  return `${negative ? '-' : ''}${grouped}${decPart ? '.' + decPart : ''}`;
};

// quantity: drop trailing zeros (2.000 -> "2", 1.5 -> "1.5")
const formatQty = (value) => {
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
};

// rate like 9 or 2.5 (no trailing zeros)
const formatPercent = (value) => String(parseFloat(Number(value).toFixed(3)));

const formatDate = (d) => {
  if (!d) return '';
  // plain DATE strings (YYYY-MM-DD) are formatted without any timezone shifting
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
};

module.exports = { formatINR, formatQty, formatPercent, formatDate };
