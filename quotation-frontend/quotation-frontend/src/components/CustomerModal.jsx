import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/endpoints';
import { API_ORIGIN } from '../api/client';
import { useMeta } from '../context/MetaContext';
import { useToast } from '../context/ToastContext';
import CrudModal from './CrudModal';

const BLANK = { name: '', contact_person: '', phone: '', email: '', gstin: '', pan: '', billing_address: '', city: '', state_code: '',
  pincode: '', shipping_address: '', shipping_state_code: '', notes: '', logo_file: '' };

// logo_file: '' = untouched, a File = upload it on save, 'remove' = delete the current logo on save
function LogoPicker({ value, setValue, current }) {
  const preview = useMemo(() => (value instanceof File ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const shown = preview || (value === 'remove' || !current ? null : `${API_ORIGIN}/uploads/${current}`);
  return (
    <div className="inline">
      {shown ? <img className="logo-preview" src={shown} alt="Customer logo" /> : <span className="muted small">No logo</span>}
      <label className="btn sm" style={{ cursor: 'pointer' }}>
        {shown ? 'Change logo' : 'Choose logo'}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Customer logo file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setValue(f); e.target.value = ''; }} />
      </label>
      {shown && <button type="button" className="btn ghost sm" onClick={() => setValue(value instanceof File ? '' : 'remove')}>Remove</button>}
    </div>
  );
}

/**
 * Add / edit a customer (with optional logo). Used by the Customers page and straight from the quotation form.
 *  customer - null/undefined to add, or the customer to edit
 *  onClose(saved)  - called when the dialog closes
 *  onSaved(customer) - called with the saved customer (after the logo, if any, is uploaded)
 */
export default function CustomerModal({ customer, onClose, onSaved }) {
  const { states } = useMeta();
  const { notify } = useToast();
  const isNew = !customer;

  const stateOptions = useMemo(() => [{ value: '', label: '— select —' }, ...states.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))], [states]);

  // typing a GSTIN fills the state from it; a wrong checksum is flagged before saving
  const checkGstin = async (value, values, setValues) => {
    if (!value) return;
    try {
      const r = await api.meta.validateGstin(value);
      if (!r.valid) { notify('This GSTIN is not valid (check the characters)', 'error'); return; }
      setValues((s) => ({ ...s, gstin: r.gstin, state_code: r.state_code }));
    } catch { /* the server validates again on save */ }
  };

  const fields = [
    { name: 'name', label: 'Customer / company name', required: true, wide: true },
    { name: 'contact_person', label: 'Contact person' },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'gstin', label: 'GSTIN', hint: 'Leave empty for an unregistered customer', onBlur: checkGstin },
    { name: 'pan', label: 'PAN' },
    { name: 'billing_address', label: 'Billing address', type: 'textarea', wide: true, rows: 2 },
    { name: 'city', label: 'City' },
    { name: 'state_code', label: 'State', type: 'select', options: stateOptions, hint: 'Decides CGST+SGST vs IGST' },
    { name: 'pincode', label: 'Pincode' },
    { name: 'shipping_state_code', label: 'Delivery / site state', type: 'select', options: stateOptions, hint: 'If different from billing' },
    { name: 'shipping_address', label: 'Delivery / site address', type: 'textarea', wide: true, rows: 2 },
    {
      name: 'logo_file', label: 'Customer logo (optional)', wide: true,
      hint: 'PNG, JPG or WEBP. Shown on quotation designs that use {{customer.logo_data_uri}}.',
      render: ({ value, setValue }) => <LogoPicker value={value} setValue={setValue} current={customer?.logo} />,
    },
  ];

  const save = async (values) => {
    const { logo_file: logo, ...rest } = values;
    const body = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]));
    body.name = values.name;
    let saved = isNew ? await api.customers.create(body) : await api.customers.update(customer.id, body);
    try {
      if (logo instanceof File) saved = await api.customers.uploadLogo(saved.id, logo);
      else if (logo === 'remove' && customer?.logo) saved = await api.customers.removeLogo(saved.id);
    } catch (e) {
      notify(`Customer saved, but the logo could not be uploaded: ${e.message}`, 'error');
    }
    onSaved?.(saved);
    return saved;
  };

  const initial = isNew ? BLANK : Object.fromEntries(Object.keys(BLANK).map((k) => [k, customer[k] ?? '']));

  return <CrudModal title={isNew ? 'Add customer' : 'Edit customer'} fields={fields} initial={{ ...initial, logo_file: '' }} onSave={save} onClose={onClose} />;
}
