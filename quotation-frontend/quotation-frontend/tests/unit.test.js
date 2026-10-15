import { describe, it, expect } from 'vitest';
import { inr, fmtDate, addDays } from '../src/utils/format';
import { buildPayload, blankRow, blankCharge, formFromQuotation } from '../src/utils/quotationPayload';
import { contextFromPlaceholders, renderHtmlPreview } from '../src/utils/handlebarsPreview';

const baseForm = () => ({
  customer_id: '5', quote_date: '2026-10-14', valid_until: '', subject: '', reference_no: '', kind_attention: '', place_of_supply_state_code: '',
  gst_treatment: 'regular', price_mode: 'exclusive', round_off: true, discount_type: '', discount_value: '', terms: '', notes: '', template_id: '',
});
const row = (o = {}) => ({ ...blankRow(), name: 'Camera', quantity: '4', rate: '2850', ...o });

describe('format helpers', () => {
  it('groups digits the Indian way', () => {
    expect(inr(1234567.5)).toBe('12,34,567.50');
    expect(inr(29771)).toBe('29,771.00');
    expect(inr(-0.4)).toBe('-0.40');
    expect(inr(null)).toBe('');
  });
  it('formats dates without timezone shifting and adds days across month ends', () => {
    expect(fmtDate('2026-10-14')).toBe('14-10-2026');
    expect(addDays('2026-10-25', 15)).toBe('2026-11-09');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
  });
});

describe('buildPayload', () => {
  it('returns null until a customer and a complete item exist', () => {
    expect(buildPayload({ ...baseForm(), customer_id: '' }, [row()], [])).toBeNull();
    expect(buildPayload(baseForm(), [blankRow()], [])).toBeNull();
    expect(buildPayload(baseForm(), [row({ rate: '' })], [])).toBeNull();
  });

  it('sends numbers, not strings, and skips incomplete rows and charges', () => {
    const p = buildPayload(baseForm(), [row(), blankRow()], [{ ...blankCharge(), name: 'Freight', amount: '500' }, blankCharge()]);
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ name: 'Camera', quantity: 4, rate: 2850, gst_rate: 18 });
    expect(p.charges).toEqual([{ name: 'Freight', amount: 500, gst_rate: 18, hsn_sac: '' }]);
  });

  it('create omits optional fields; edit sends explicit nulls so they can be cleared', () => {
    const create = buildPayload(baseForm(), [row()], []);
    expect(create).not.toHaveProperty('valid_until');
    expect(create).not.toHaveProperty('template_id');
    expect(create).not.toHaveProperty('terms');
    const edit = buildPayload(baseForm(), [row()], [], { editing: true });
    expect(edit.valid_until).toBeNull();
    expect(edit.place_of_supply_state_code).toBeNull();
    expect(edit.template_id).toBeNull();
    expect(edit.terms).toBe('');
  });

  it('line and overall discounts only go out when complete', () => {
    const p = buildPayload({ ...baseForm(), discount_type: 'percent', discount_value: '5' }, [row({ discount_type: 'amount', discount_value: '500' }), row({ discount_type: 'percent', discount_value: '' })], []);
    expect(p.discount_type).toBe('percent');
    expect(p.discount_value).toBe(5);
    expect(p.items[0]).toMatchObject({ discount_type: 'amount', discount_value: 500 });
    expect(p.items[1]).not.toHaveProperty('discount_type');
    const none = buildPayload({ ...baseForm(), discount_type: 'percent', discount_value: '' }, [row()], []);
    expect(none.discount_type).toBeNull();
  });

  it('round trip: a saved quotation loads back into the form', () => {
    const q = { customer_id: 5, quote_date: '2026-10-14', valid_until: '2026-10-29', subject: 'S', gst_treatment: 'regular', price_mode: 'exclusive', round_off_enabled: true,
      discount_type: 'percent', discount_value: 5, terms: 'a\nb', notes: '', template_id: null, place_of_supply_state_code: '23',
      items: [{ item_id: 3, name: 'Cam', quantity: 4, rate: 2850, gst_rate: 18, discount_type: null, discount_value: null, unit: 'Nos' }],
      charges: [{ name: 'Install', rate: 3000, gst_rate: 18, hsn_sac: '995469' }] };
    const { form, rows, charges } = formFromQuotation(q);
    const p = buildPayload(form, rows, charges, { editing: true });
    expect(p.customer_id).toBe('5');
    expect(p.items[0]).toMatchObject({ item_id: '3', quantity: 4, rate: 2850 });
    expect(p.charges[0]).toMatchObject({ name: 'Install', amount: 3000, gst_rate: 18 });
    expect(p.discount_value).toBe(5);
    expect(p.place_of_supply_state_code).toBe('23');
  });
});

describe('HTML designer preview', () => {
  const ph = { tags: [{ tag: 'company.name', example: 'Sample Co' }, { tag: 'is_intra', example: true }, { tag: 'totals.grand_total', example: '29,771.00' }],
    loops: [{ loop: 'items', fields: [{ tag: 'sno', example: 1 }, { tag: 'name', example: 'Camera' }] }] };
  it('builds nested sample data from the placeholder list and renders it', () => {
    const ctx = contextFromPlaceholders(ph);
    expect(ctx.company.name).toBe('Sample Co');
    expect(ctx.items).toHaveLength(2);
    const out = renderHtmlPreview('<h1>{{company.name}}</h1>{{#each items}}<i>{{sno}}-{{name}}</i>{{/each}}{{#if is_intra}}CGST{{/if}}', ctx);
    expect(out.html).toBe('<h1>Sample Co</h1><i>1-Camera</i><i>2-Camera</i>CGST');
  });
  it('escapes HTML in values and reports template errors instead of throwing', () => {
    const ctx = { company: { name: '<script>x</script>' } };
    expect(renderHtmlPreview('{{company.name}}', ctx).html).toContain('&lt;script&gt;');
    expect(renderHtmlPreview('{{#each items}}', ctx).error).toBeTruthy();
  });
});
