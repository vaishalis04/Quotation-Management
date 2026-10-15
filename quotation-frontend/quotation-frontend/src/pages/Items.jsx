import { useState } from 'react';
import * as api from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounced } from '../utils/hooks';
import { inr } from '../utils/format';
import { Spinner, Empty, Pagination, ErrorBox } from '../components/ui';
import CrudModal from '../components/CrudModal';

const BLANK = { item_type: 'product', category: '', sku: '', name: '', description: '', brand: '', model_no: '', hsn_sac: '', unit: 'Nos',
  rate: '', cost_price: '', gst_rate: '18', warranty: '' };

export default function Items() {
  const { canManage } = useAuth();
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useAsync(() => api.items.list({ q, category, page, limit: 20 }), [q, category, page]);
  const categories = useAsync(() => api.items.categories(), [data?.items?.length]);
  const rates = useAsync(() => api.meta.gstRates(), []);

  const fields = [
    { name: 'item_type', label: 'Type', type: 'select', options: [{ value: 'product', label: 'Product (HSN)' }, { value: 'service', label: 'Service (SAC)' }] },
    { name: 'category', label: 'Category', hint: 'e.g. Camera, NVR, Cable, Guard service, Laptop' },
    { name: 'name', label: 'Name', required: true, wide: true },
    { name: 'description', label: 'Description / specification', type: 'textarea', wide: true, rows: 2 },
    { name: 'brand', label: 'Brand' }, { name: 'model_no', label: 'Model no.' },
    { name: 'hsn_sac', label: 'HSN / SAC', hint: '4 to 8 digits - confirm with your CA' },
    { name: 'unit', label: 'Unit', hint: 'Nos, Box, Mtr, Month, Job…' },
    { name: 'rate', label: 'Selling rate (₹, excl. GST)', type: 'number', step: 'any', required: true },
    { name: 'cost_price', label: 'Cost price (₹, internal)', type: 'number', step: 'any', hidden: !canManage },
    { name: 'gst_rate', label: 'GST %', type: 'select', options: (rates.data?.rates || [0, 5, 18, 40]).map((r) => ({ value: String(r), label: `${r}%` })) },
    { name: 'sku', label: 'SKU / item code' }, { name: 'warranty', label: 'Warranty' },
  ];

  const save = (values) => {
    const body = { ...values };
    ['cost_price', 'sku', 'category', 'description', 'brand', 'model_no', 'hsn_sac', 'warranty'].forEach((k) => { if (body[k] === '') body[k] = null; });
    body.rate = Number(body.rate); body.gst_rate = Number(body.gst_rate);
    if (body.cost_price !== null && body.cost_price !== undefined) body.cost_price = Number(body.cost_price);
    return editing === 'new' ? api.items.create(body) : api.items.update(editing.id, body);
  };

  return (
    <>
      <div className="page-head"><h1>Items</h1>{canManage && <button className="btn primary" onClick={() => setEditing('new')}>+ Add item</button>}</div>
      <div className="card filters">
        <input className="input" placeholder="Search name, brand, model, HSN, SKU…" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <select className="input" value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} aria-label="Category">
          <option value="">All categories</option>{(categories.data || []).map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="card">
        <ErrorBox error={error} />
        {loading ? <Spinner /> : data?.items.length === 0 ? <Empty>No items yet. Add your products and services so quotations fill in quickly.</Empty> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Category</th><th>HSN/SAC</th><th>Unit</th><th className="r">Rate (₹)</th><th className="r">GST %</th>{canManage && <th />}</tr></thead>
            <tbody>
              {data?.items.map((it) => (
                <tr key={it.id}>
                  <td><strong>{it.name}</strong><div className="muted small">{it.brand} {it.model_no}</div></td><td>{it.category}</td><td>{it.hsn_sac}</td>
                  <td>{it.unit}</td><td className="r">{inr(it.rate)}</td><td className="r">{Number(it.gst_rate)}</td>
                  {canManage && <td className="r nowrap"><button className="btn sm" onClick={() => setEditing(it)}>Edit</button>{' '}
                    <button className="btn ghost sm" onClick={async () => { if (window.confirm(`Delete ${it.name}?`)) { try { await api.items.remove(it.id); notify('Item deleted'); reload(); } catch (e) { notify(e.message, 'error'); } } }}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>
      {editing && (
        <CrudModal title={editing === 'new' ? 'Add item' : 'Edit item'} fields={fields}
          initial={editing === 'new' ? BLANK : Object.fromEntries(Object.keys(BLANK).map((k) => [k, editing[k] === null || editing[k] === undefined ? '' : String(editing[k])]))}
          onSave={save} onClose={(saved) => { setEditing(null); if (saved) { notify('Item saved'); reload(); } }} />
      )}
    </>
  );
}
