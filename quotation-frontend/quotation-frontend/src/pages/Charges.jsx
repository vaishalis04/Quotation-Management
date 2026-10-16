import { useState } from 'react';
import * as api from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../utils/hooks';
import { inr, today } from '../utils/format';
import { Spinner, Empty, ErrorBox } from '../components/ui';
import CrudModal from '../components/CrudModal';

const BLANK = { name: '', description: '', hsn_sac: '', default_amount: '', gst_rate: '18', is_active: true };

/** Master list of additional charges (installation, freight, commissioning...). Picked into quotations, still editable there. */
export default function Charges() {
  const { notify } = useToast();
  const [editing, setEditing] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api.charges.list({ active: 'all' }), []);
  const rates = useAsync(() => api.meta.gstRates(today()), []);

  const rateOptions = (current) => {
    const list = rates.data?.rates || [0, 5, 18, 40];
    const cur = Number(current);
    const all = list.includes(cur) || Number.isNaN(cur) ? list : [...list, cur].sort((a, b) => a - b);
    return all.map((r) => ({ value: String(r), label: `${r}%` }));
  };

  const fields = [
    { name: 'name', label: 'Charge name', required: true, wide: true },
    { name: 'description', label: 'Description (optional)', wide: true },
    { name: 'hsn_sac', label: 'HSN/SAC', hint: 'e.g. 995469 for installation services' },
    { name: 'default_amount', label: 'Default amount (₹)', type: 'number', step: 'any', hint: 'Can be changed on each quotation' },
    { name: 'gst_rate', label: 'GST %', type: 'select', options: rateOptions(editing && editing !== 'new' ? editing.gst_rate : BLANK.gst_rate) },
    { name: 'is_active', label: 'Active (shows in the quotation dropdown)', type: 'checkbox', wide: true },
  ];

  return (
    <>
      <div className="page-head"><h1>Additional charges</h1><button className="btn primary" onClick={() => setEditing('new')}>+ Add charge</button></div>
      <p className="muted small">Save freight, installation, commissioning and similar charges once, then pick them on any quotation. You can still change the amount or GST on the quotation itself.</p>
      <ErrorBox error={error} />
      {loading ? <Spinner /> : data?.length === 0 ? <Empty>No saved charges yet. Add installation, freight, etc. once and reuse them.</Empty> : (
        <div className="card">
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Name</th><th>HSN/SAC</th><th className="r">Default amount</th><th className="r">GST %</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data?.map((c) => (
                  <tr key={c.id} className={c.is_active ? '' : 'inactive'}>
                    <td><strong>{c.name}</strong>{c.description && <div className="muted small">{c.description}</div>}</td>
                    <td>{c.hsn_sac || '—'}</td>
                    <td className="r">₹{inr(c.default_amount)}</td>
                    <td className="r">{Number(c.gst_rate)}</td>
                    <td>{c.is_active ? 'Active' : 'Inactive'}</td>
                    <td className="nowrap">
                      <button className="btn sm" onClick={() => setEditing(c)}>Edit</button>{' '}
                      <button className="btn ghost sm" onClick={async () => { if (window.confirm('Delete this charge? Existing quotations are not affected.')) { await api.charges.remove(c.id); reload(); } }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editing && (
        <CrudModal title={editing === 'new' ? 'Add charge' : 'Edit charge'} fields={fields}
          initial={editing === 'new' ? BLANK : {
            name: editing.name, description: editing.description || '', hsn_sac: editing.hsn_sac || '',
            default_amount: String(Number(editing.default_amount)), gst_rate: String(Number(editing.gst_rate)), is_active: editing.is_active,
          }}
          onSave={(v) => (editing === 'new' ? api.charges.create(v) : api.charges.update(editing.id, v))}
          onClose={(saved) => { setEditing(null); if (saved) { notify('Saved'); reload(); } }} />
      )}
    </>
  );
}
