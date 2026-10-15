import { describe, it, expect, inject, beforeAll, vi } from 'vitest';
import * as client from '../src/api/client';
import * as api from '../src/api/endpoints';
import { loadPreview } from '../src/api/preview';

const fx = inject('fixtures');

describe.skipIf(!fx)('API client against the real backend', () => {
  beforeAll(() => { client.setToken(fx.token); });

  it('logs in and the token is used for later calls', async () => {
    client.setToken(null);
    const data = await api.auth.login(fx.email, fx.password);
    expect(data.token).toBeTruthy();
    client.setToken(data.token);
    expect((await api.auth.me()).user.email).toBe(fx.email);
  });

  it('turns a failed login into an ApiError with status and message', async () => {
    client.setToken(null);
    await expect(api.auth.login(fx.email, 'wrong')).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/invalid/i) });
    client.setToken(fx.token);
  });

  it('keeps field-level validation errors from the server', async () => {
    const err = await api.customers.create({ name: 'Bad', gstin: '27AAPFU0939F1ZX' }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.errors[0].field).toBe('gstin');
  });

  it('dispatches qm:unauthorized when the token is rejected', async () => {
    const handler = vi.fn();
    window.addEventListener('qm:unauthorized', handler);
    client.setToken('not-a-real-token');
    await expect(api.auth.me()).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalled();
    window.removeEventListener('qm:unauthorized', handler);
    client.setToken(fx.token);
  });

  it('/calculate returns the server figures the screen shows (same state: CGST + SGST)', async () => {
    const r = await api.quotations.calculate({ customer_id: fx.customer.id, items: [{ name: 'Camera', quantity: 4, rate: 2850, gst_rate: 18 }] });
    expect(r.supply_type).toBe('intra');
    expect(r.totals).toMatchObject({ taxable_amount: 11400, cgst_amount: 1026, sgst_amount: 1026, igst_amount: 0, grand_total: 13452 });
  });

  it('other-state customer gets IGST', async () => {
    const r = await api.quotations.calculate({ customer_id: fx.interCustomer.id, items: [{ name: 'Camera', quantity: 4, rate: 2850, gst_rate: 18 }] });
    expect(r.supply_type).toBe('inter');
    expect(r.totals.igst_amount).toBe(2052);
  });

  it('downloadFrom saves the Word file under the name the server chose', async () => {
    const created = []; const clicks = [];
    URL.createObjectURL = vi.fn((b) => { created.push(b); return 'blob:x'; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicks.push(this.download); });
    const name = await client.downloadFrom(`/quotations/${fx.quotation.id}/render`, { query: { templateId: fx.docxLayout.id } }, 'fallback.bin');
    click.mockRestore();
    expect(name).toMatch(/^QT-\d{4}-\d{2}-\d{4}\.docx$/);
    expect(clicks).toEqual([name]);
    expect(created[0].size).toBeGreaterThan(1000);
    expect(created[0].type).toContain('wordprocessingml');
  });

  it('preview of an HTML design returns the page with the customer filled in', async () => {
    const p = await loadPreview(`/quotations/${fx.quotation.id}/render`, { templateId: fx.htmlLayout.id });
    expect(p.kind).toBe('html');
    expect(p.html).toContain(fx.customer.name);
    expect(p.html).toContain('16,992.00'); // 4 x 2,850 + 3,000 installation + 18% GST
  });

  it('preview of a Word design becomes a PDF (or says LibreOffice is missing)', async () => {
    const p = await loadPreview(`/quotations/${fx.quotation.id}/render`, { templateId: fx.docxLayout.id });
    expect(['pdf', 'nopdf']).toContain(p.kind);
    expect(p.native).toBe('docx');
    if (p.kind === 'pdf') expect(p.url).toMatch(/^blob:/);
  });
});
