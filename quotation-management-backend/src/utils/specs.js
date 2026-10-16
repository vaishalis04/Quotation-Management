// Custom item labels ("Pixels: 4MP", "Lens type: 2.8mm"...). Stored as a JSON array of { label, value }.
// Returns a clean array, or null when nothing usable was sent (so an empty editor clears the field).
const MAX_SPECS = 50;

const cleanSpecs = (input) => {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const s of input) {
    if (!s || typeof s !== 'object') continue;
    const label = String(s.label ?? '').trim().slice(0, 100);
    const value = String(s.value ?? '').trim().slice(0, 255);
    if (!label) continue; // a value without a label means nothing
    out.push({ label, value });
    if (out.length >= MAX_SPECS) break;
  }
  return out.length ? out : null;
};

// [{label,value}] -> "Pixels: 4MP\nLens type: 2.8mm"
const specsToText = (specs) => (Array.isArray(specs) ? specs.filter((s) => s && s.label).map((s) => (s.value ? `${s.label}: ${s.value}` : s.label)).join('\n') : '');

module.exports = { cleanSpecs, specsToText };
