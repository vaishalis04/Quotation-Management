// Instant preview while designing an HTML layout, without saving. The sample data comes from the server's
// placeholder list (same tags and example values the real renderer uses); the final check still happens on save.
import Handlebars from 'handlebars';

const hbs = Handlebars.create();
hbs.registerHelper('eq', (a, b) => a === b);
hbs.registerHelper('gt', (a, b) => Number(a) > Number(b));
hbs.registerHelper('or', (a, b) => a || b);
hbs.registerHelper('not', (a) => !a);
hbs.registerHelper('nl2br', (text) => new hbs.SafeString(hbs.escapeExpression(text || '').replace(/\r?\n/g, '<br>')));

export function contextFromPlaceholders({ tags = [], loops = [] }) {
  const ctx = {};
  tags.forEach(({ tag, example }) => {
    const parts = tag.split('.');
    let o = ctx;
    parts.slice(0, -1).forEach((p) => { o[p] = o[p] || {}; o = o[p]; });
    o[parts[parts.length - 1]] = example;
  });
  loops.forEach(({ loop, fields }) => {
    const row = Object.fromEntries(fields.map((f) => [f.tag, f.example]));
    ctx[loop] = [row, { ...row, sno: Number(row.sno || 1) + 1 }];
  });
  return ctx;
}

// returns { html } or { error }
export function renderHtmlPreview(source, ctx) {
  try { return { html: hbs.compile(source)(ctx) }; } catch (e) { return { error: e.message }; }
}
