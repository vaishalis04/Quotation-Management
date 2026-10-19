const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');
export const API_ORIGIN = new URL(BASE).origin;
const TOKEN_KEY = 'qm_token';
const SCOPE_KEY = 'qm_company_scope';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { } },
};

let token = store.get(TOKEN_KEY);
let companyScope = store.get(SCOPE_KEY);

export const getToken = () => token;
export const setToken = (t) => { token = t || null; store.set(TOKEN_KEY, token); };
export const getCompanyScope = () => companyScope;
export const setCompanyScope = (id) => { companyScope = id ? String(id) : null; store.set(SCOPE_KEY, companyScope); };

export class ApiError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const buildUrl = (path, query = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') params.append(k, v); });
  if (companyScope && !('companyId' in query)) params.append('companyId', companyScope);
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
};

const toApiError = async (res) => {
  let body = null;
  try { body = await res.clone().json(); } catch { }
  return new ApiError(body?.message || res.statusText || 'Request failed', res.status, body?.errors || []);
};

export async function raw(path, { method = 'GET', body, form, query } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const res = await fetch(buildUrl(path, query), { method, headers, body: payload });
  if (res.status === 401 && token) window.dispatchEvent(new Event('qm:unauthorized'));
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function request(path, opts) {
  const res = await raw(path, opts);
  const json = await res.json();
  return json.data;
}

export const filenameFrom = (res, fallback) => {
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : fallback;
};

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFrom(path, opts, fallbackName = 'download') {
  const res = await raw(path, opts);
  const name = filenameFrom(res, fallbackName);
  saveBlob(await res.blob(), name);
  return name;
}
