import { useMemo, useState } from 'react';
import * as api from '../api/endpoints';
import { useMeta } from '../context/MetaContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounced } from '../utils/hooks';
import { Spinner, Empty, Pagination, ErrorBox } from '../components/ui';
import CrudModal from '../components/CrudModal';

const BLANK = { name: '', contact_person: '', phone: '', email: '', gstin: '', pan: '', billing_address: '', city: '', state_code: '',
  pincode: '', shipping_address: '', shipping_state_code: '', notes: '' };

export default function Customers() {
  const { states } = useMeta();
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | customer
  const q = useDebounced(search);
  const { data, loading, error, reload } = useAsync(() => api.customers.list({ q, page, limit: 20 }), [q, page]);

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
  ];

  const save = (values) => {
    const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]));
    body.name = values.name;
    return editing === 'new' ? api.customers.create(body) : api.customers.update(editing.id, body);
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { const r = await api.customers.remove(c.id); notify('Customer removed'); reload(); return r; } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-head"><h1>Customers</h1><button className="btn primary" onClick={() => setEditing('new')}>+ Add customer</button></div>
      <div className="card filters"><input className="input" placeholder="Search name, GSTIN, phone…" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} /></div>
      <div className="card">
        <ErrorBox error={error} />
        {loading ? <Spinner /> : data?.customers.length === 0 ? <Empty>No customers yet.</Empty> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Contact</th><th>GSTIN</th><th>State</th><th>City</th><th /></tr></thead>
            <tbody>
              {data?.customers.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td><td>{c.contact_person}<div className="muted small">{c.phone}</div></td>
                  <td>{c.gstin || <span className="muted">Unregistered</span>}</td><td>{c.state}</td><td>{c.city}</td>
                  <td className="r nowrap"><button className="btn sm" onClick={() => setEditing(c)}>Edit</button>{' '}<button className="btn ghost sm" onClick={() => remove(c)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>
      {editing && (
        <CrudModal title={editing === 'new' ? 'Add customer' : 'Edit customer'} fields={fields}
          initial={editing === 'new' ? BLANK : Object.fromEntries(Object.keys(BLANK).map((k) => [k, editing[k] ?? '']))}
          onSave={save} onClose={(saved) => { setEditing(null); if (saved) { notify('Customer saved'); reload(); } }} />
      )}
    </>
  );
}
