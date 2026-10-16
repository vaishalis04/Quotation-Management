import { useState } from 'react';
import * as api from '../api/endpoints';
import { API_ORIGIN } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounced } from '../utils/hooks';
import { Spinner, Empty, Pagination, ErrorBox } from '../components/ui';
import CustomerModal from '../components/CustomerModal';

export default function Customers() {
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | customer
  const q = useDebounced(search);
  const { data, loading, error, reload } = useAsync(() => api.customers.list({ q, page, limit: 20 }), [q, page]);

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
                  <td>
                    <div className="inline nowrap">
                      {c.logo && <img src={`${API_ORIGIN}/uploads/${c.logo}`} alt="" style={{ height: 28, maxWidth: 70, objectFit: 'contain' }} />}
                      <strong>{c.name}</strong>
                    </div>
                  </td>
                  <td>{c.contact_person}<div className="muted small">{c.phone}</div></td>
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
        <CustomerModal customer={editing === 'new' ? null : editing}
          onClose={(saved) => { setEditing(null); if (saved) { notify('Customer saved'); reload(); } }} />
      )}
    </>
  );
}
