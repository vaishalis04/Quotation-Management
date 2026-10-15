import { request, raw } from './client';

const json = (method, body) => ({ method, body });

export const auth = {
  login: (email, password) => request('/auth/login', json('POST', { email, password })),
  me: () => request('/auth/me'),
  users: () => request('/auth/users'),
  register: (data) => request('/auth/register', json('POST', data)),
  setActive: (id, is_active) => request(`/auth/users/${id}/active`, json('PATCH', { is_active })),
  changePassword: (currentPassword, newPassword) => request('/auth/change-password', json('PUT', { currentPassword, newPassword })),
};

export const meta = {
  states: () => request('/meta/states'),
  constants: () => request('/meta/constants'),
  gstRates: (date) => request('/meta/gst-rates', { query: { date } }),
  validateGstin: (gstin) => request('/meta/validate-gstin', { query: { gstin } }),
};

export const companies = {
  list: () => request('/companies'), // super admin
  me: () => request('/companies/me'),
  updateMe: (data) => request('/companies/me', json('PUT', data)),
  uploadLogo: (file) => { const f = new FormData(); f.append('logo', file); return request('/companies/me/logo', { method: 'POST', form: f }); },
};

const crud = (base) => ({
  list: (query) => request(base, { query }),
  get: (id) => request(`${base}/${id}`),
  create: (data) => request(base, json('POST', data)),
  update: (id, data) => request(`${base}/${id}`, json('PUT', data)),
  remove: (id) => request(`${base}/${id}`, { method: 'DELETE' }),
});

export const customers = crud('/customers');
export const items = { ...crud('/items'), categories: () => request('/items/categories') };
export const terms = crud('/terms-templates');

export const layouts = {
  ...crud('/quotation-templates'),
  upload: (form) => request('/quotation-templates', { method: 'POST', form }),
  createHtml: (data) => request('/quotation-templates/html', json('POST', data)),
  replaceFile: (id, file) => { const f = new FormData(); f.append('file', file); return request(`/quotation-templates/${id}/file`, { method: 'PUT', form: f }); },
  placeholders: () => request('/quotation-templates/placeholders'),
  sampleText: async (format) => (await raw(`/quotation-templates/samples/${format}`)).text(),
};

export const quotations = {
  ...crud('/quotations'),
  calculate: (data) => request('/quotations/calculate', json('POST', data)),
  setStatus: (id, status, reason) => request(`/quotations/${id}/status`, json('PATCH', { status, reason })),
  revise: (id) => request(`/quotations/${id}/revise`, { method: 'POST' }),
  duplicate: (id, customer_id) => request(`/quotations/${id}/duplicate`, json('POST', customer_id ? { customer_id } : {})),
  versions: (id) => request(`/quotations/${id}/versions`),
  activity: (id) => request(`/quotations/${id}/activity`),
};

export const reports = { summary: (query) => request('/reports/summary', { query }) };
