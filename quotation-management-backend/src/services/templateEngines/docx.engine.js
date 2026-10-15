const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ApiError = require('../../utils/ApiError');

const explain = (err) => {
  const list = err?.properties?.errors;
  if (Array.isArray(list) && list.length) {
    return list.map((e) => e.properties?.explanation || e.message).slice(0, 10);
  }
  return [err.message];
};

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// walks a.b.c using OWN properties only, so a tag like {constructor.name} can never reach JS internals
const getPath = (obj, parts) => {
  let cur = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object' || !has(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
};

// docxtemplater's default parser does not understand {company.name}. This one does, and - like the default -
// looks in the innermost loop item first, then outwards, so {company.name} also works inside {#items}...{/items}.
const parser = (tag) => {
  const t = tag.trim();
  if (t === '.') return { get: (scope) => scope };
  const parts = t.split('.');
  return {
    get(scope, context) {
      const list = context && Array.isArray(context.scopeList) ? context.scopeList : [scope];
      const start = context && typeof context.num === 'number' ? context.num : list.length - 1;
      for (let i = start; i >= 0; i--) {
        const s = list[i];
        if (s !== null && typeof s === 'object' && has(s, parts[0])) return getPath(s, parts);
      }
      return undefined;
    },
  };
};

// buffer: the uploaded .docx with {tags}; ctx: formatted context
const render = (buffer, ctx) => {
  try {
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,   // {#items} ... {/items} works across paragraphs and table rows
      linebreaks: true,      // \n in values becomes a line break
      parser,
      nullGetter: () => '',  // missing values print nothing instead of "undefined"
    });
    doc.render(ctx);
    return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (err) {
    throw new ApiError(400, 'The Word layout has a problem in its {tags}', explain(err));
  }
};

module.exports = { render };
