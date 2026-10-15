// Indian digit grouping: 1234567.5 -> "12,34,567.50"
export const inr = (value, decimals = 2) => {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '';
  const fixed = Number(value).toFixed(decimals);
  const negative = fixed.startsWith('-');
  const [intPart, dec] = fixed.replace('-', '').split('.');
  const grouped = intPart.length <= 3 ? intPart : `${intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${intPart.slice(-3)}`;
  return `${negative ? '-' : ''}${grouped}${dec ? `.${dec}` : ''}`;
};

export const pad = (n) => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const addDays = (isoDate, days) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

// '2026-10-14' -> '14-10-2026' (no timezone shifting)
export const fmtDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v || '';
};

export const uid = () => Math.random().toString(36).slice(2, 10);
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
