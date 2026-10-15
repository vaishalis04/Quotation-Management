// GSTIN = 2 state digits + 10 char PAN + entity digit + 'Z' + checksum char
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const checksumChar = (first14) => {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    if (value < 0) return null;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
};

const normalizeGstin = (g) => (g ? String(g).trim().toUpperCase() : null);

const isValidGstin = (gstin) => {
  const g = normalizeGstin(gstin);
  if (!g || !FORMAT.test(g)) return false;
  return checksumChar(g.slice(0, 14)) === g[14];
};

const stateCodeFromGstin = (gstin) => {
  const g = normalizeGstin(gstin);
  return g && g.length >= 2 ? g.slice(0, 2) : null;
};

module.exports = { isValidGstin, normalizeGstin, stateCodeFromGstin, checksumChar };
