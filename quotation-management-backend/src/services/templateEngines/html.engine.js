const Handlebars = require('handlebars');
const ApiError = require('../../utils/ApiError');

const hbs = Handlebars.create();
hbs.registerHelper('eq', (a, b) => a === b);
hbs.registerHelper('gt', (a, b) => Number(a) > Number(b));
hbs.registerHelper('or', (a, b) => a || b);
hbs.registerHelper('not', (a) => !a);
// {{nl2br text}} - escapes first, then turns line breaks into <br>
hbs.registerHelper('nl2br', (text) => new hbs.SafeString(hbs.escapeExpression(text || '').replace(/\r?\n/g, '<br>')));

const render = (html, ctx) => {
  try {
    return hbs.compile(html, { strict: false })(ctx);
  } catch (err) {
    throw new ApiError(400, 'The HTML layout has a problem', [err.message]);
  }
};

module.exports = { render };
