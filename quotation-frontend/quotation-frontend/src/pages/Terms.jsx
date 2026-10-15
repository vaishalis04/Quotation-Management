import { useState } from 'react';
import * as api from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../utils/hooks';
import { Spinner, Empty, ErrorBox } from '../components/ui';
import CrudModal from '../components/CrudModal';

const BLANK = { name: '', business_type: 'other', content: '', is_default: false };

export default function Terms() {
  const { notify } = useToast();
  const [editing, setEditing] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api.terms.list({}), []);

  const fields = [
    { name: 'name', label: 'Name', required: true },
    { name: 'business_type', label: 'Business', type: 'select', options: ['cctv', 'security', 'it', 'electrical', 'other'].map((v) => ({ value: v, label: v.toUpperCase() })) },
    { name: 'content', label: 'Terms (one per line)', type: 'textarea', rows: 8, wide: true, required: true },
    { name: 'is_default', label: 'Use as default for new quotations', type: 'checkbox', wide: true },
  ];

  return (
    <>
      <div className="page-head"><h1>Terms & conditions</h1><button className="btn primary" onClick={() => setEditing('new')}>+ Add template</button></div>
      <ErrorBox error={error} />
      {loading ? <Spinner /> : data?.length === 0 ? <Empty>No templates yet. Add warranty, payment and installation terms once and reuse them.</Empty> : (
        <div className="cards-grid">
          {data?.map((t) => (
            <div className="card" key={t.id}>
              <h3>{t.name} {t.is_default && <span className="badge st-accepted">Default</span>}</h3>
              <ol className="terms">{t.content.split(/\r?\n/).filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ol>
              <button className="btn sm" onClick={() => setEditing(t)}>Edit</button>{' '}
              <button className="btn ghost sm" onClick={async () => { if (window.confirm('Delete this template?')) { await api.terms.remove(t.id); reload(); } }}>Delete</button>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <CrudModal title={editing === 'new' ? 'Add terms template' : 'Edit terms template'} fields={fields}
          initial={editing === 'new' ? BLANK : { name: editing.name, business_type: editing.business_type, content: editing.content, is_default: editing.is_default }}
          onSave={(v) => (editing === 'new' ? api.terms.create(v) : api.terms.update(editing.id, v))}
          onClose={(saved) => { setEditing(null); if (saved) { notify('Saved'); reload(); } }} />
      )}
    </>
  );
}
