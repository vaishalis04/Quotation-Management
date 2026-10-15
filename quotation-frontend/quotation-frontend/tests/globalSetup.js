// Runs in plain Node BEFORE the tests. Needs the backend running (npm run seed && npm run dev there).
// Creates the records the UI tests use. If the backend is not reachable the integration tests are skipped.
const API = process.env.TEST_API_URL || 'http://localhost:5700/api/v1';
const EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@company.com';
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Admin@12345';

export default async function setup({ provide }) {
  try {
    const call = async (path, { method = 'GET', body, form, token } = {}) => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      if (body) headers['Content-Type'] = 'application/json';
      const res = await fetch(API + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
      const json = await res.json();
      if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.message}`);
      return json.data;
    };

    const { token } = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
    const stamp = Date.now();

    // company must know its state (23) so the customer below is "same state"
    await call('/companies/me', { method: 'PUT', token, body: { gstin: '23ABCDE1234F1Z8', state_code: '23' } });

    const customer = await call('/customers', { method: 'POST', token, body: { name: `UI Test Customer ${stamp}`, state_code: '23', billing_address: '1 Test Road', city: 'Indore' } });
    const interCustomer = await call('/customers', { method: 'POST', token, body: { name: `UI Pune Customer ${stamp}`, gstin: '27AAPFU0939F1ZV' } });
    const item = await call('/items', { method: 'POST', token, body: { name: `UI Dome Camera ${stamp}`, rate: 2850, gst_rate: 18, hsn_sac: '8525', unit: 'Nos', category: 'Camera' } });

    // a real Word design, uploaded the way a business would
    const sample = await fetch(`${API}/quotation-templates/samples/docx`, { headers: { Authorization: `Bearer ${token}` } });
    const docxForm = new FormData();
    docxForm.append('file', new Blob([await sample.arrayBuffer()], { type: 'application/octet-stream' }), 'ui-test.docx');
    docxForm.append('name', `UI Word design ${stamp}`);
    const docxLayout = await call('/quotation-templates', { method: 'POST', token, form: docxForm });

    const htmlLayout = await call('/quotation-templates/html', { method: 'POST', token, body: { name: `UI HTML design ${stamp}`, html_content: '<h1>{{company.name}}</h1><p>{{customer.name}}</p><b>{{totals.grand_total}}</b>' } });

    const quotation = await call('/quotations', { method: 'POST', token, body: {
      customer_id: customer.id, subject: `UI seeded quotation ${stamp}`,
      items: [{ item_id: item.id, quantity: 4 }], charges: [{ name: 'Installation', amount: 3000, gst_rate: 18 }],
    } });

    provide('fixtures', { api: API, email: EMAIL, password: PASSWORD, token, stamp, customer, interCustomer, item, docxLayout, htmlLayout, quotation });
  } catch (e) {
    console.warn(`\n[tests] Backend not ready (${e.message}). Integration tests will be skipped.\n`);
    provide('fixtures', null);
  }
}
