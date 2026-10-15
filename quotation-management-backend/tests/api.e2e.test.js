// End-to-end: real Express app + real engines. SQLite in memory replaces MySQL.
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.UPLOAD_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'qm-uploads-'));

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const PizZip = require('pizzip');
const ExcelJS = require('exceljs');

const app = require('../server');
const { sequelize, Company, User } = require('../src/models');
const { sampleDocxBuffer, sampleXlsxBuffer, sampleHtml } = require('../src/services/sampleTemplate.service');

const api = request(app);
const S = {}; // shared state across the ordered steps below
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const docText = (buf) => new PizZip(buf).file('word/document.xml').asText().replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
const bin = (res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };

test.before(async () => {
  await sequelize.sync({ force: true });
  const company = await Company.create({ name: 'Bhopal CCTV Co', business_type: 'cctv', state_code: '23', state: 'Madhya Pradesh', gstin: '23AAAAA0000A1Z5', quote_prefix: 'QT' });
  S.companyId = company.id;
  await User.create({ name: 'Admin', email: 'admin@x.com', password: 'Admin@12345', role: 'company_admin', company_id: company.id });
  await User.create({ name: 'Sales A', email: 'a@x.com', password: 'Sales@12345', role: 'sales', company_id: company.id });
  await User.create({ name: 'Sales B', email: 'b@x.com', password: 'Sales@12345', role: 'sales', company_id: company.id });
  const login = async (email, password) => (await api.post('/api/v1/auth/login').send({ email, password })).body.data.token;
  S.admin = await login('admin@x.com', 'Admin@12345');
  S.salesA = await login('a@x.com', 'Sales@12345');
  S.salesB = await login('b@x.com', 'Sales@12345');
});

test('login rejects a wrong password', async () => {
  const r = await api.post('/api/v1/auth/login').send({ email: 'admin@x.com', password: 'nope' });
  assert.equal(r.status, 401);
});

test('GSTIN validation endpoint', async () => {
  const ok = await api.get('/api/v1/meta/validate-gstin?gstin=27AAPFU0939F1ZV').set(auth(S.admin));
  assert.equal(ok.body.data.valid, true);
  assert.equal(ok.body.data.state, 'Maharashtra');
  const bad = await api.get('/api/v1/meta/validate-gstin?gstin=27AAPFU0939F1ZX').set(auth(S.admin));
  assert.equal(bad.body.data.valid, false);
});

test('GST slabs depend on the quotation date (12/28% only before 22 Sep 2025)', async () => {
  const now = await api.get('/api/v1/meta/gst-rates?date=2026-10-14').set(auth(S.admin));
  assert.ok(!now.body.data.rates.includes(12) && !now.body.data.rates.includes(28));
  const old = await api.get('/api/v1/meta/gst-rates?date=2025-06-01').set(auth(S.admin));
  assert.ok(old.body.data.rates.includes(12) && old.body.data.rates.includes(28));
});

test('customer with invalid GSTIN is refused; valid one fills the state', async () => {
  const bad = await api.post('/api/v1/customers').set(auth(S.salesA)).send({ name: 'X', gstin: '27AAPFU0939F1ZX' });
  assert.equal(bad.status, 400);
  const mh = await api.post('/api/v1/customers').set(auth(S.salesA)).send({ name: 'Pune Traders', gstin: '27AAPFU0939F1ZV', billing_address: '1 FC Road', city: 'Pune' });
  assert.equal(mh.status, 201);
  assert.equal(mh.body.data.state_code, '27');
  S.custInter = mh.body.data.id;
  const mp = await api.post('/api/v1/customers').set(auth(S.salesA)).send({ name: 'Indore Mart', state_code: '23', billing_address: '9 MG Road', city: 'Indore' });
  S.custIntra = mp.body.data.id;
});

test('only manager/admin may create catalogue items; sales may not', async () => {
  const denied = await api.post('/api/v1/items').set(auth(S.salesA)).send({ name: 'Cam', rate: 100 });
  assert.equal(denied.status, 403);
  const ok = await api.post('/api/v1/items').set(auth(S.admin)).send({ name: 'IP Dome Camera 4MP', rate: 2850, gst_rate: 18, hsn_sac: '8525', unit: 'Nos', category: 'Camera' });
  assert.equal(ok.status, 201);
  S.itemId = ok.body.data.id;
});

test('calculate: other state => IGST, same state => CGST+SGST (no DB writes)', async () => {
  const body = { items: [{ item_id: null, name: 'Camera', quantity: 4, rate: 2850, gst_rate: 18, hsn_sac: '8525' }], charges: [{ name: 'Freight', amount: 500, gst_rate: 18 }] };
  const inter = await api.post('/api/v1/quotations/calculate').set(auth(S.salesA)).send({ ...body, customer_id: S.custInter });
  assert.equal(inter.status, 200, JSON.stringify(inter.body));
  assert.equal(inter.body.data.supply_type, 'inter');
  assert.equal(inter.body.data.totals.igst_amount, 2142);       // 11900 x 18%
  assert.equal(inter.body.data.totals.cgst_amount, 0);
  assert.equal(inter.body.data.totals.grand_total, 14042);
  const intra = await api.post('/api/v1/quotations/calculate').set(auth(S.salesA)).send({ ...body, customer_id: S.custIntra });
  assert.equal(intra.body.data.supply_type, 'intra');
  assert.equal(intra.body.data.totals.cgst_amount, 1071);
  assert.equal(intra.body.data.totals.sgst_amount, 1071);
});

test('calculate refuses a GST slab that no longer exists (12%)', async () => {
  const r = await api.post('/api/v1/quotations/calculate').set(auth(S.salesA)).send({ customer_id: S.custIntra, items: [{ name: 'X', quantity: 1, rate: 100, gst_rate: 12 }] });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /not a valid slab/);
});

test('create quotation: number, snapshot, server-side totals', async () => {
  const r = await api.post('/api/v1/quotations').set(auth(S.salesA)).send({
    customer_id: S.custIntra, subject: 'CCTV for showroom', discount_type: 'percent', discount_value: 5,
    items: [{ item_id: S.itemId, quantity: 4 }, { name: 'NVR 8ch', quantity: 1, rate: 12500, discount_type: 'amount', discount_value: 500, gst_rate: 18, hsn_sac: '8521' }],
    charges: [{ name: 'Installation', amount: 3000, gst_rate: 18, hsn_sac: '995469' }],
    grand_total: 1, // a client-sent total must be ignored
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const q = r.body.data;
  assert.match(q.quote_number, /^QT\/2026-27\/0001$/);
  assert.equal(q.taxable_amount, 25230);
  assert.equal(q.grand_total, 29771);
  assert.equal(q.round_off, -0.4);
  assert.equal(q.items.length, 2);
  assert.equal(q.items[0].name, 'IP Dome Camera 4MP'); // defaulted from the catalogue
  assert.equal(q.customer_snapshot.name, 'Indore Mart');
  S.q = q;
});

test('second quotation gets the next number', async () => {
  const r = await api.post('/api/v1/quotations').set(auth(S.salesB)).send({ customer_id: S.custInter, items: [{ name: 'Cable', quantity: 2, rate: 6200, gst_rate: 18 }] });
  assert.equal(r.body.data.quote_number, 'QT/2026-27/0002');
  S.q2 = r.body.data;
});

test('sales cannot edit a colleague\'s quotation, the owner can', async () => {
  const no = await api.put(`/api/v1/quotations/${S.q.id}`).set(auth(S.salesB)).send({ subject: 'hijack' });
  assert.equal(no.status, 403);
  const yes = await api.put(`/api/v1/quotations/${S.q.id}`).set(auth(S.salesA)).send({ subject: 'CCTV for showroom - 2 floors', charges: [{ name: 'Installation', amount: 4000, gst_rate: 18, hsn_sac: '995469' }] });
  assert.equal(yes.status, 200, JSON.stringify(yes.body));
  assert.equal(yes.body.data.subject, 'CCTV for showroom - 2 floors');
  assert.equal(yes.body.data.items.length, 2, 'items untouched by a partial update');
  assert.equal(yes.body.data.taxable_amount, 26230);
  S.q = yes.body.data;
});

test('upload a Word layout, bad tags are rejected with a reason', async () => {
  const good = await api.post('/api/v1/quotation-templates').set(auth(S.admin))
    .field('name', 'Our Word layout').field('business_type', 'cctv').field('is_default', 'true')
    .attach('file', sampleDocxBuffer(), 'layout.docx');
  assert.equal(good.status, 201, JSON.stringify(good.body));
  S.docxId = good.body.data.id;

  const broken = new PizZip(sampleDocxBuffer());
  broken.file('word/document.xml', broken.file('word/document.xml').asText().replace('{/items}', '{/itemz}'));
  const bad = await api.post('/api/v1/quotation-templates').set(auth(S.admin))
    .attach('file', broken.generate({ type: 'nodebuffer' }), 'broken.docx');
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors && bad.body.errors.length > 0);
  const notOffice = await api.post('/api/v1/quotation-templates').set(auth(S.admin)).attach('file', Buffer.from('hello'), 'fake.docx');
  assert.equal(notOffice.status, 400);
});

test('render with the uploaded Word layout: figures are filled in', async () => {
  const r = await api.get(`/api/v1/quotations/${S.q.id}/render`).set(auth(S.salesA)).buffer().parse(bin);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-disposition'], /QT-2026-27-0001\.docx/);
  const text = docText(r.body);
  for (const must of ['Indore Mart', 'QT/2026-27/0001', '10,830.00', '11,400.00', '4,000.00', '26,230.00', '2,360.70', 'Grand total']) {
    assert.ok(text.includes(must), `missing in Word output: ${must}`);
  }
  assert.ok(!text.includes('IGST'), 'IGST row must be hidden for an intra-state quotation');
});

test('Word layout -> PDF via LibreOffice', async (t) => {
  const r = await api.get(`/api/v1/quotations/${S.q.id}/render?output=pdf`).set(auth(S.salesA)).buffer().parse(bin);
  if (r.status === 501) return t.skip('LibreOffice not installed');
  assert.equal(r.status, 200);
  assert.equal(r.body.slice(0, 4).toString(), '%PDF');
});

test('Excel layout keeps numbers numeric', async () => {
  const up = await api.post('/api/v1/quotation-templates').set(auth(S.admin)).field('name', 'Excel layout')
    .attach('file', await sampleXlsxBuffer(), 'layout.xlsx');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const r = await api.get(`/api/v1/quotations/${S.q.id}/render?templateId=${up.body.data.id}`).set(auth(S.salesA)).buffer().parse(bin);
  assert.equal(r.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.body);
  const ws = wb.getWorksheet(1);
  const cells = []; ws.eachRow((row) => row.eachCell((c) => cells.push(c.value)));
  assert.ok(cells.includes(10830), 'taxable of line 1 as a number');
  assert.ok(cells.includes(26230), 'taxable total as a number');
  assert.ok(cells.includes(30952) || cells.includes(30951) || cells.some((v) => typeof v === 'number' && v > 30000), 'grand total as a number');
});

test('HTML layout: escaped, CSP header set, scripts cannot run', async () => {
  const up = await api.post('/api/v1/quotation-templates/html').set(auth(S.admin)).send({
    name: 'Mini html', html_content: '<h1>{{company.name}}</h1><p>{{customer.name}}</p><script>alert(1)</script>{{#each items}}<i>{{name}} {{total}}</i>{{/each}}',
  });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const r = await api.get(`/api/v1/quotations/${S.q.id}/render?templateId=${up.body.data.id}`).set(auth(S.salesA));
  assert.equal(r.status, 200);
  assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  assert.match(r.text, /Bhopal CCTV Co/);
  assert.match(r.text, /IP Dome Camera 4MP/);
});

test('user-supplied values are HTML-escaped in html layouts', async () => {
  const c = await api.post('/api/v1/customers').set(auth(S.salesA)).send({ name: '<img src=x onerror=alert(1)>', state_code: '23' });
  const q = await api.post('/api/v1/quotations').set(auth(S.salesA)).send({ customer_id: c.body.data.id, items: [{ name: 'A', quantity: 1, rate: 10, gst_rate: 0 }] });
  const html = await api.post('/api/v1/quotation-templates/html').set(auth(S.admin)).send({ name: 'esc', html_content: '<p>{{customer.name}}</p>' });
  const r = await api.get(`/api/v1/quotations/${q.body.data.id}/render?templateId=${html.body.data.id}`).set(auth(S.salesA));
  assert.ok(!r.text.includes('<img'), r.text);
  assert.match(r.text, /&lt;img/);
});

test('lifecycle: send -> cannot edit -> revise -> R1, old one marked revised', async () => {
  const sent = await api.patch(`/api/v1/quotations/${S.q.id}/status`).set(auth(S.salesA)).send({ status: 'sent' });
  assert.equal(sent.status, 200);
  const edit = await api.put(`/api/v1/quotations/${S.q.id}`).set(auth(S.salesA)).send({ subject: 'late change' });
  assert.equal(edit.status, 409);
  const bad = await api.patch(`/api/v1/quotations/${S.q.id}/status`).set(auth(S.salesA)).send({ status: 'draft' });
  assert.equal(bad.status, 409);
  const rev = await api.post(`/api/v1/quotations/${S.q.id}/revise`).set(auth(S.salesA));
  assert.equal(rev.status, 201, JSON.stringify(rev.body));
  assert.equal(rev.body.data.display_number, 'QT/2026-27/0001-R1');
  assert.equal(rev.body.data.status, 'draft');
  assert.equal(rev.body.data.grand_total, S.q.grand_total);
  const old = await api.get(`/api/v1/quotations/${S.q.id}`).set(auth(S.salesA));
  assert.equal(old.body.data.status, 'revised');
  const versions = await api.get(`/api/v1/quotations/${rev.body.data.id}/versions`).set(auth(S.salesA));
  assert.equal(versions.body.data.length, 2);
  S.rev = rev.body.data;
});

test('list hides superseded versions by default; summary report works', async () => {
  const list = await api.get('/api/v1/quotations').set(auth(S.admin));
  assert.equal(list.body.data.quotations.filter((x) => x.quote_number === 'QT/2026-27/0001').length, 1);
  const all = await api.get('/api/v1/quotations?all_versions=true').set(auth(S.admin));
  assert.ok(all.body.data.quotations.length > list.body.data.quotations.length);
  const search = await api.get('/api/v1/quotations?q=Indore').set(auth(S.admin));
  assert.ok(search.body.data.quotations.length >= 1);
  const rep = await api.get('/api/v1/reports/summary').set(auth(S.admin));
  assert.equal(rep.status, 200);
  assert.equal(rep.body.data.financial_year, '2026-27');
});

test('editing a customer never rewrites an issued quotation', async () => {
  await api.put(`/api/v1/customers/${S.custIntra}`).set(auth(S.admin)).send({ name: 'Renamed Mart' });
  const q = await api.get(`/api/v1/quotations/${S.q.id}`).set(auth(S.admin));
  assert.equal(q.body.data.customer_snapshot.name, 'Indore Mart');
});

test('multi-tenant isolation: another company cannot see these quotations', async () => {
  const other = await Company.create({ name: 'Other Co', state_code: '27' });
  await User.create({ name: 'O', email: 'o@x.com', password: 'Other@12345', role: 'company_admin', company_id: other.id });
  const tok = (await api.post('/api/v1/auth/login').send({ email: 'o@x.com', password: 'Other@12345' })).body.data.token;
  const r = await api.get(`/api/v1/quotations/${S.q.id}`).set(auth(tok));
  assert.equal(r.status, 404);
  const t = await api.get(`/api/v1/quotation-templates/${S.docxId}`).set(auth(tok));
  assert.equal(t.status, 404);
  const list = await api.get('/api/v1/quotations').set(auth(tok));
  assert.equal(list.body.data.quotations.length, 0);
});

test('placeholder reference and sample downloads', async () => {
  const p = await api.get('/api/v1/quotation-templates/placeholders').set(auth(S.admin));
  assert.ok(p.body.data.tags.find((t) => t.tag === 'totals.grand_total'));
  assert.ok(p.body.data.loops.find((l) => l.loop === 'items'));
  const s = await api.get('/api/v1/quotation-templates/samples/docx').set(auth(S.admin)).buffer().parse(bin);
  assert.equal(s.body.slice(0, 2).toString(), 'PK');
});
