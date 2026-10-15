import { raw } from './client';

/**
 * Shows "the design". HTML layouts come back as HTML and are shown directly.
 * Word / Excel layouts cannot be shown by a browser, so the same request is repeated with output=pdf
 * (needs LibreOffice on the server). If the server has none (501) the caller shows a hint + download button.
 *
 * Returns { kind: 'html', html } | { kind: 'pdf', url, native } | { kind: 'nopdf', native, message }
 */
export async function loadPreview(path, query = {}) {
  const res = await raw(path, { query });
  const type = res.headers.get('Content-Type') || '';
  if (type.includes('text/html')) return { kind: 'html', html: await res.text(), native: 'html' };

  try { await res.body?.cancel?.(); } catch { /* ignore */ }
  const native = type.includes('wordprocessingml') ? 'docx' : type.includes('spreadsheetml') ? 'xlsx' : 'file';
  try {
    const pdf = await raw(path, { query: { ...query, output: 'pdf' } });
    return { kind: 'pdf', url: URL.createObjectURL(await pdf.blob()), native };
  } catch (e) {
    if (e.status === 501) return { kind: 'nopdf', native, message: e.message };
    throw e;
  }
}

export const NATIVE_LABEL = { docx: 'Word', xlsx: 'Excel', html: 'HTML', file: 'file' };
