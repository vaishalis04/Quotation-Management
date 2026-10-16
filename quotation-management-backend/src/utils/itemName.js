// Full name printed on a quotation: Product + Category + Company, e.g.
//   Camera + "ip 4mp dome color view with audio" + "CP Plus" -> "Camera ip 4mp dome color view with audio CP Plus"
// A local / third-party item has no company ("Cable 5 core"); an item with no category is just the product ("Camera box").
const t = (s) => (s === null || s === undefined ? '' : String(s).trim());

const composeItemName = ({ product, category, brand } = {}) => [t(product), t(category), t(brand)].filter(Boolean).join(' ');

module.exports = { composeItemName };
