process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:'; process.env.JWT_SECRET = 't'; process.env.NODE_ENV = 'test';
const test = require('node:test'); const assert = require('node:assert/strict'); const request = require('supertest');
const app = require('../server');
const { sequelize, Company, User, Item } = require('../src/models');
const { backfillItemMasters } = require('../src/services/catalogueMaster.service');
const api = request(app); const S = {}; const au = (t) => ({ Authorization: `Bearer ${t}` });
const post = (url, body, t = S.admin) => api.post(`/api/v1${url}`).set(au(t)).send(body);
const put = (url, body, t = S.admin) => api.put(`/api/v1${url}`).set(au(t)).send(body);

test.before(async () => {
  await sequelize.sync({ force: true });
  const c = await Company.create({ name: 'X', business_type: 'cctv', state_code: '23', state: 'MP', gstin: '23AAAAA0000A1Z5', quote_prefix: 'QT' });
  await User.create({ name: 'A', email: 'a@x.com', password: 'Admin@12345', role: 'company_admin', company_id: c.id });
  await User.create({ name: 'S', email: 's@x.com', password: 'Sales@12345', role: 'sales', company_id: c.id });
  const l = async (e, p) => (await api.post('/api/v1/auth/login').send({ email: e, password: p })).body.data.token;
  S.admin = await l('a@x.com', 'Admin@12345'); S.sales = await l('s@x.com', 'Sales@12345'); S.company = c.id;
});

test('product > company > category masters and items linked to them', async () => {
  let r = await post('/catalogue-masters/products', { name: 'Camera' }); assert.equal(r.status, 201); const cam = r.body.data.id;
  r = await post('/catalogue-masters/products', { name: ' camera ' }); assert.equal(r.status, 400); // duplicate (case / spaces ignored)
  r = await post('/catalogue-masters/products', { name: 'Cable' }); const cable = r.body.data.id;
  assert.equal((await post('/catalogue-masters/products', { name: 'Nope' }, S.sales)).status, 403);
  assert.ok((await post('/catalogue-masters/products', { name: '' })).status >= 400);

  r = await post('/catalogue-masters/companies', { product_id: cam, name: 'CP Plus' }); assert.equal(r.status, 201); const cp = r.body.data.id;
  assert.ok((await post('/catalogue-masters/companies', { name: 'No product' })).status >= 400);
  // category under the company, and one directly under a product (no company)
  r = await post('/catalogue-masters/categories', { product_id: cam, brand_id: cp, name: 'ip 4mp dome color view with audio' }); assert.equal(r.status, 201); const cat = r.body.data.id;
  r = await post('/catalogue-masters/categories', { product_id: cable, name: '5 core' }); assert.equal(r.status, 201); const core = r.body.data.id;
  r = await post('/catalogue-masters/categories', { product_id: cable, brand_id: cp, name: 'wrong parent' }); assert.equal(r.status, 422);

  // item from ids: names are copied, full name is built
  r = await post('/items', { product_id: cam, brand_id: cp, category_id: cat, rate: 3000, gst_rate: 18 });
  assert.equal(r.status, 201, JSON.stringify(r.body)); const item = r.body.data;
  assert.equal(item.name, 'Camera ip 4mp dome color view with audio CP Plus');
  assert.deepEqual([item.product, item.brand, item.category], ['Camera', 'CP Plus', 'ip 4mp dome color view with audio']);
  // product only, and product + category without a company
  r = await post('/items', { product_id: cam, name: 'Camera box', rate: 100, gst_rate: 18 }); assert.equal(r.status, 201); assert.equal(r.body.data.brand_id, null);
  r = await post('/items', { product_id: cable, category_id: core, rate: 50, gst_rate: 18 }); assert.equal(r.body.data.name, 'Cable 5 core');
  // rules
  assert.equal((await post('/items', { product_id: cable, brand_id: cp, rate: 1, gst_rate: 18 })).status, 422); // company of another product
  assert.equal((await post('/items', { product_id: cam, category_id: core, rate: 1, gst_rate: 18 })).status, 422); // category of another product
  assert.equal((await post('/items', { product_id: cam, category_id: cat, rate: 1, gst_rate: 18 })).status, 422); // company category used without the company
  // plain item (old API style): becomes its own product; names create the masters
  r = await post('/items', { name: 'CCTV Installation', rate: 3000, gst_rate: 18, category: 'Service' }); assert.equal(r.status, 201);
  assert.equal(r.body.data.product, 'CCTV Installation'); assert.ok(r.body.data.product_id);
  r = await post('/items', { product: 'NVR', brand: 'Prama', category: '4', rate: 1, gst_rate: 18 }); assert.equal(r.body.data.name, 'NVR 4 Prama');

  // tree
  r = await api.get('/api/v1/catalogue-masters/tree').set(au(S.sales)); assert.equal(r.status, 200);
  const camera = r.body.data.products.find((p) => p.name === 'Camera');
  assert.equal(camera.item_count, 2); assert.equal(camera.companies[0].name, 'CP Plus'); assert.equal(camera.companies[0].categories[0].item_count, 1);
  assert.equal(r.body.data.products.find((p) => p.name === 'Cable').categories[0].name, '5 core'); // no-company category

  // changing the product clears a company that belongs to the old one
  r = await put(`/items/${item.id}`, { product_id: cable, category_id: core }); assert.equal(r.status, 200);
  assert.equal(r.body.data.brand_id, null); assert.equal(r.body.data.product, 'Cable');
  // updates that do not mention masters leave them alone
  r = await put(`/items/${item.id}`, { rate: 3100 }); assert.equal(r.body.data.product, 'Cable'); assert.equal(r.body.data.category, '5 core');

  // renaming rebuilds automatic names
  r = await post('/items', { product_id: cam, brand_id: cp, category_id: cat, rate: 3000, gst_rate: 18 }); const i2 = r.body.data.id;
  await put(`/catalogue-masters/companies/${cp}`, { name: 'CP PLUS' });
  r = await api.get(`/api/v1/items/${i2}`).set(au(S.admin)); assert.equal(r.body.data.brand, 'CP PLUS'); assert.equal(r.body.data.name, 'Camera ip 4mp dome color view with audio CP PLUS');

  // delete rules
  assert.equal((await api.delete(`/api/v1/catalogue-masters/products/${cam}`).set(au(S.admin))).status, 409);
  assert.equal((await api.delete(`/api/v1/catalogue-masters/categories/${cat}`).set(au(S.admin))).status, 409); // i2 uses it
  r = await post('/catalogue-masters/categories', { product_id: cam, name: 'spare' }); 
  assert.equal((await api.delete(`/api/v1/catalogue-masters/categories/${r.body.data.id}`).set(au(S.admin))).status, 200);
});

test('backfill links older items (text only) to masters, and is repeatable', async () => {
  await Item.create({ company_id: S.company, name: 'Old Thing', rate: 1, gst_rate: 18, category: 'Misc', brand: 'Acme' });
  await Item.create({ company_id: S.company, name: 'Old Camera', product: 'Camera', brand: 'cp plus', rate: 1, gst_rate: 18 });
  assert.ok((await backfillItemMasters()) >= 2); assert.equal(await backfillItemMasters(), 0);
  const o = await Item.findOne({ where: { name: 'Old Thing' } }); assert.ok(o.product_id && o.brand_id && o.category_id); assert.equal(o.product, 'Old Thing');
  const c = await Item.findOne({ where: { name: 'Old Camera' } }); assert.equal(c.brand, 'CP PLUS'); // matched the existing company, ignoring case
});
test.after(async () => { await sequelize.close(); });
