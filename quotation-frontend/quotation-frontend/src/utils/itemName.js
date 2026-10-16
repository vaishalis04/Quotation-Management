// Same rule as the server: Product + Category + Company -> "Camera ip 4mp dome color view with audio CP Plus".
// No company (local / third party) -> "Cable 5 core"; no category -> just the product.
const t = (s) => (s === null || s === undefined ? '' : String(s).trim());
export const composeItemName = ({ product, category, brand } = {}) => [t(product), t(category), t(brand)].filter(Boolean).join(' ');
export const norm = (s) => t(s).toLowerCase();
export const uniqueTexts = (list) => {
  const seen = new Map();
  list.forEach((x) => { const k = norm(x); if (k && !seen.has(k)) seen.set(k, t(x)); });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
};
