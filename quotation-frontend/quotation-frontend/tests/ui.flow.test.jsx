import { describe, it, expect, inject, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { MetaProvider } from '../src/context/MetaContext';
import { ToastProvider } from '../src/context/ToastContext';
import * as client from '../src/api/client';

const fx = inject('fixtures');
const WAIT = { timeout: 25000 };

const renderApp = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <ToastProvider><AuthProvider><MetaProvider><AppRoutes /></MetaProvider></AuthProvider></ToastProvider>
  </MemoryRouter>
);

describe.skipIf(!fx)('UI flows against the real backend', () => {
  beforeEach(() => { cleanup(); client.setToken(fx.token); });

  it('logs in through the form and lands on the dashboard', async () => {
    client.setToken(null);
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(screen.getByLabelText(/email/i), fx.email);
    await user.type(screen.getByLabelText(/password/i), fx.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' }, WAIT)).toBeInTheDocument();
    expect(await screen.findByText(/recent quotations/i, {}, WAIT)).toBeInTheDocument();
  });

  it('shows the server error for a wrong password', async () => {
    client.setToken(null);
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(screen.getByLabelText(/email/i), fx.email);
    await user.type(screen.getByLabelText(/password/i), 'nope-nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert', {}, WAIT)).toHaveTextContent(/invalid email or password/i);
  });

  it('BUILD: fills the quotation, sees live server totals, saves, then SEES the design and DOWNLOADS it', async () => {
    const user = userEvent.setup();
    renderApp('/quotations/new');
    expect(await screen.findByRole('heading', { name: /new quotation/i }, WAIT)).toBeInTheDocument();

    // customer
    const customerSelect = screen.getByLabelText('Customer');
    await screen.findByRole('option', { name: new RegExp(fx.customer.name) }, WAIT);
    await user.selectOptions(customerSelect, String(fx.customer.id));

    // item: pick from the catalogue search
    await user.type(screen.getByLabelText('Item name'), fx.item.name.slice(0, 16));
    await user.click(await screen.findByText(fx.item.name, { selector: 'strong' }, WAIT));
    expect(screen.getByLabelText('Rate')).toHaveValue(2850); // catalogue rate filled in
    expect(screen.getByLabelText('HSN/SAC')).toHaveValue('8525');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '4' } });

    // live totals come from the server: 4 x 2850 = 11,400 + 18% (CGST 1,026 + SGST 1,026) = 13,452
    expect((await screen.findAllByText('13,452.00', {}, WAIT)).length).toBeGreaterThan(0);
    expect(screen.getByText(/intra-state/i)).toBeInTheDocument();
    expect(screen.getByText('CGST')).toBeInTheDocument();
    expect(screen.queryByText('IGST')).not.toBeInTheDocument();
    expect(screen.getByText(/Thirteen Thousand Four Hundred Fifty Two/i)).toBeInTheDocument();

    // add a charge and an overall discount: totals recalculate
    await user.click(screen.getByRole('button', { name: /add charge/i }));
    await user.type(screen.getByLabelText('Charge name'), 'Installation');
    fireEvent.change(screen.getByLabelText('Charge amount'), { target: { value: '3000' } });
    await user.selectOptions(screen.getByLabelText('Overall discount type'), 'percent');
    fireEvent.change(screen.getByLabelText('Overall discount value'), { target: { value: '5' } });
    // items 11,400 - 570 = 10,830 ; + 3,000 = 13,830 taxable ; GST 2,489.40 ; total 16,319.40 -> 16,319 (round off -0.40)
    expect((await screen.findAllByText('16,319.00', {}, WAIT)).length).toBeGreaterThan(0);
    expect(screen.getByText('-0.40')).toBeInTheDocument();

    // save
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(await screen.findByRole('heading', { name: /QT\/\d{4}-\d{2}\/\d{4}/ }, WAIT)).toBeInTheDocument();

    // SHOW: the design appears, rendered by the server, in a sandboxed frame
    const frame = await screen.findByTitle('Quotation design', {}, WAIT);
    expect(frame).toHaveAttribute('sandbox', '');
    // default design for this company: shared HTML design (seeded) -> figures + customer inside
    expect(frame.getAttribute('srcdoc')).toContain(fx.customer.name);
    expect(frame.getAttribute('srcdoc')).toContain('16,319.00');

    // DOWNLOAD: choose the Word design and download it
    const designSelect = screen.getByLabelText('Design');
    await user.selectOptions(designSelect, String(fx.docxLayout.id));
    await waitFor(() => expect(screen.getByRole('button', { name: /download word/i })).toBeInTheDocument(), WAIT);

    const blobs = []; const names = [];
    URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:dl'; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download); });
    await user.click(screen.getByRole('button', { name: /download word/i }));
    await waitFor(() => expect(names.length).toBe(1), WAIT);
    click.mockRestore();
    expect(names[0]).toMatch(/\.docx$/);
    expect(blobs[0].size).toBeGreaterThan(1000);
  });

  it('Details tab shows the saved figures; status buttons follow the allowed moves', async () => {
    const user = userEvent.setup();
    renderApp(`/quotations/${fx.quotation.id}`);
    await screen.findByTitle('Quotation design', {}, WAIT);
    expect(screen.getByRole('button', { name: /mark as sent/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create revision/i })).not.toBeInTheDocument(); // drafts are edited, not revised
    await user.click(screen.getByRole('tab', { name: /details/i }));
    expect((await screen.findAllByText('16,992.00', {}, WAIT)).length).toBeGreaterThan(0); // 11,400 + 3,000 installation = 14,400 + 18% GST
  });

  it('LIST: search finds the seeded quotation', async () => {
    const user = userEvent.setup();
    renderApp('/quotations');
    await user.type(await screen.findByPlaceholderText(/search number/i, {}, WAIT), `UI seeded quotation ${fx.stamp}`);
    expect(await screen.findByText(fx.customer.name, {}, WAIT)).toBeInTheDocument();
  });

  it('DESIGNER: live preview updates while typing; a broken template is reported; saving creates the design', async () => {
    const user = userEvent.setup();
    renderApp('/layouts');
    await user.click(await screen.findByRole('button', { name: /new html design/i }, WAIT));

    const editor = await screen.findByLabelText('HTML source', {}, WAIT);
    await waitFor(() => expect(editor.value).toContain('QUOTATION'), WAIT); // starter loaded
    const preview = () => screen.getByTitle('Design preview');
    await waitFor(() => expect(preview().getAttribute('srcdoc')).toContain('Sample Security Systems'), WAIT); // sample data filled in
    expect(preview()).toHaveAttribute('sandbox', '');

    fireEvent.change(editor, { target: { value: '<h1>Hello {{company.name}}</h1>{{#each items}}<i>{{name}}</i>{{/each}}' } });
    await waitFor(() => expect(preview().getAttribute('srcdoc')).toContain('Hello Sample Security Systems'), WAIT);

    fireEvent.change(editor, { target: { value: '{{#each items}}<i>{{name}}</i>' } }); // never closed
    expect(await screen.findByText(/parse error/i, {}, WAIT)).toBeInTheDocument();

    fireEvent.change(editor, { target: { value: '<h1>Hello {{company.name}}</h1>' } });
    const name = `Designer test ${fx.stamp}`;
    await user.type(screen.getByLabelText('Design name'), name);
    await user.click(screen.getByRole('button', { name: /save design/i }));
    expect(await screen.findByText(name, {}, WAIT)).toBeInTheDocument(); // appears in the list
  });

  it('DESIGNER: the server rejects an invalid design and the reason is shown', async () => {
    const user = userEvent.setup();
    renderApp('/layouts');
    await user.click(await screen.findByRole('button', { name: /new html design/i }, WAIT));
    const editor = await screen.findByLabelText('HTML source', {}, WAIT);
    await waitFor(() => expect(editor.value).toContain('QUOTATION'), WAIT);
    fireEvent.change(editor, { target: { value: '{{#each items}}<i>{{name}}</i>' } });
    await user.type(screen.getByLabelText('Design name'), 'Broken');
    await user.click(screen.getByRole('button', { name: /save design/i }));
    const alert = await screen.findByRole('alert', {}, WAIT);
    expect(alert).toHaveTextContent(/problem/i);
  });

  it('DESIGNS: preview of the uploaded Word design opens, tag reference lists tags', async () => {
    const user = userEvent.setup();
    renderApp('/layouts');
    const row = (await screen.findByText(fx.docxLayout.name, {}, WAIT)).closest('tr');
    await user.click(within(row).getByRole('button', { name: /preview/i }));
    expect(await screen.findByTitle('Quotation design', {}, WAIT)).toBeInTheDocument(); // PDF made from the Word file (LibreOffice)
    await user.click(screen.getByRole('button', { name: /close/i }));
    await user.click(screen.getByRole('button', { name: /tag reference/i }));
    expect(await screen.findByText('totals.grand_total', {}, WAIT)).toBeInTheDocument();
  });

  it('CUSTOMERS: GSTIN typed in the form fills the state', async () => {
    const user = userEvent.setup();
    renderApp('/customers');
    await user.click(await screen.findByRole('button', { name: /add customer/i }, WAIT));
    const gstin = screen.getByLabelText(/^GSTIN/);
    await user.type(gstin, '27AAPFU0939F1ZV');
    await user.tab();
    await waitFor(() => expect(screen.getByLabelText(/^State/)).toHaveValue('27'), WAIT);
  });
});
