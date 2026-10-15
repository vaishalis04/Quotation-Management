import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/endpoints';
import { downloadFrom } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebounced } from '../utils/hooks';
import { contextFromPlaceholders, renderHtmlPreview } from '../utils/handlebarsPreview';
import { Spinner, Empty, ErrorBox, Field } from '../components/ui';
import Modal from '../components/Modal';
import PreviewFrame from '../components/PreviewFrame';

const BUSINESS = ['cctv', 'security', 'it', 'electrical', 'other'];
const typeOptions = BUSINESS.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>);

export default function Layouts() {
  const { canManage, isSuper } = useAuth();
  const { notify } = useToast();
  const { data, loading, error, reload } = useAsync(() => api.layouts.list({ active: 'all' }), []);
  const [dialog, setDialog] = useState(null); // { type: 'upload' | 'designer' | 'meta' | 'preview' | 'tags', layout? }
  const replaceInput = useRef(null);
  const [replaceFor, setReplaceFor] = useState(null);

  const mayChange = (l) => canManage && (l.company_id !== null || isSuper);
  const close = (changed) => { setDialog(null); if (changed) reload(); };

  const run = async (fn, ok) => { try { await fn(); if (ok) notify(ok); reload(); } catch (e) { notify(e.message, 'error'); } };
  const starter = (format) => downloadFrom(`/quotation-templates/samples/${format}`, {}, `sample-quotation-layout.${format}`).catch((e) => notify(e.message, 'error'));

  const onReplace = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !replaceFor) return;
    try { await api.layouts.replaceFile(replaceFor.id, file); notify('Design file replaced'); reload(); } catch (err) { notify(`${err.message}${err.errors?.length ? ` — ${err.errors[0]}` : ''}`, 'error'); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Quotation designs</h1><p className="muted">Upload your own Word or Excel quotation, or design one in HTML. The calculated figures are filled into it automatically.</p></div>
        {canManage && (
          <div className="actions">
            <button className="btn primary" onClick={() => setDialog({ type: 'upload' })}>⬆ Upload Word / Excel design</button>
            <button className="btn" onClick={() => setDialog({ type: 'designer' })}>+ New HTML design</button>
          </div>
        )}
      </div>

      <section className="card">
        <h3>Start from a ready design</h3>
        <p className="muted small">Download one, change the logo, colours and columns in Word / Excel / a text editor, keep the {'{tags}'}, then upload it back.</p>
        <div className="actions">
          <button className="btn" onClick={() => starter('docx')}>⬇ Word starter</button>
          <button className="btn" onClick={() => starter('xlsx')}>⬇ Excel starter</button>
          <button className="btn" onClick={() => starter('html')}>⬇ HTML starter</button>
          <button className="btn ghost" onClick={() => setDialog({ type: 'tags' })}>📖 Tag reference (what can I put in my design?)</button>
        </div>
      </section>

      <section className="card">
        <ErrorBox error={error} />
        {loading ? <Spinner /> : data?.length === 0 ? <Empty>No designs yet. Upload yours or start from a ready design above.</Empty> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Format</th><th>For</th><th>Owner</th><th /></tr></thead>
            <tbody>
              {data?.map((l) => (
                <tr key={l.id} className={l.is_active ? '' : 'inactive'}>
                  <td><strong>{l.name}</strong>{l.is_default && <> <span className="badge st-accepted">Default</span></>}{!l.is_active && <> <span className="badge st-cancelled">Inactive</span></>}
                    {l.description && <div className="muted small">{l.description}</div>}</td>
                  <td><span className="badge st-draft">{l.format.toUpperCase()}</span></td>
                  <td>{l.business_type.toUpperCase()}</td>
                  <td>{l.company_id === null ? 'Shared' : 'Your company'}</td>
                  <td className="r nowrap">
                    <button className="btn sm" onClick={() => setDialog({ type: 'preview', layout: l })}>Preview</button>{' '}
                    <button className="btn sm" onClick={() => downloadFrom(`/quotation-templates/${l.id}/download`, {}, `${l.name}.${l.format}`).catch((e) => notify(e.message, 'error'))}>Download</button>
                    {mayChange(l) && (
                      <>
                        {' '}{!l.is_default && <button className="btn sm" onClick={() => run(() => api.layouts.update(l.id, { is_default: true }), 'Set as default')}>Make default</button>}
                        {' '}<button className="btn sm" onClick={() => setDialog({ type: l.format === 'html' ? 'designer' : 'meta', layout: l })}>Edit</button>
                        {l.format !== 'html' && <>{' '}<button className="btn sm" onClick={() => { setReplaceFor(l); replaceInput.current.click(); }}>Replace file</button></>}
                        {' '}<button className="btn ghost sm" onClick={() => window.confirm(`Delete “${l.name}”?`) && run(() => api.layouts.remove(l.id), 'Design deleted')}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <input ref={replaceInput} type="file" accept=".docx,.xlsx" hidden onChange={onReplace} />
      </section>

      {dialog?.type === 'upload' && <UploadModal onClose={close} />}
      {dialog?.type === 'designer' && <HtmlDesigner layout={dialog.layout} onClose={close} />}
      {dialog?.type === 'meta' && <MetaModal layout={dialog.layout} onClose={close} />}
      {dialog?.type === 'tags' && <TagsModal onClose={() => setDialog(null)} />}
      {dialog?.type === 'preview' && (
        <Modal title={`Preview: ${dialog.layout.name}`} wide onClose={() => setDialog(null)}>
          <p className="muted small">Shown with sample figures so you can check the design before using it on a real quotation.</p>
          <PreviewFrame path={`/quotation-templates/${dialog.layout.id}/preview`} />
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- upload a Word / Excel design
function UploadModal({ onClose }) {
  const { notify } = useToast();
  const [v, setV] = useState({ name: '', business_type: 'cctv', description: '', is_default: false });
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) { setError({ message: 'Choose a .docx or .xlsx file' }); return; }
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', v.name || file.name.replace(/\.[^.]+$/, ''));
      form.append('business_type', v.business_type);
      form.append('description', v.description);
      form.append('is_default', String(v.is_default));
      await api.layouts.upload(form);
      notify('Design uploaded and checked');
      onClose(true);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title="Upload your quotation design" onClose={() => onClose(false)} footer={
      <><button className="btn" onClick={() => onClose(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Checking…' : 'Upload'}</button></>}>
      <p className="muted small">The file is test-filled with sample figures when you upload. If a {'{tag}'} is wrong you will be told exactly which one.</p>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="File (.docx or .xlsx) *" wide><input className="input" type="file" accept=".docx,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label="Design file" /></Field>
        <Field label="Name"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Standard A4 quotation" /></Field>
        <Field label="For business"><select className="input" value={v.business_type} onChange={(e) => setV({ ...v, business_type: e.target.value })}>{typeOptions}</select></Field>
        <Field label="Description" wide><input className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <label className="field check wide"><input type="checkbox" checked={v.is_default} onChange={(e) => setV({ ...v, is_default: e.target.checked })} /><span>Use as my default design</span></label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- rename / default / active (Word + Excel)
function MetaModal({ layout, onClose }) {
  const { notify } = useToast();
  const [v, setV] = useState({ name: layout.name, description: layout.description || '', business_type: layout.business_type, is_default: layout.is_default, is_active: layout.is_active });
  const [error, setError] = useState(null);
  const save = async () => { try { await api.layouts.update(layout.id, v); notify('Saved'); onClose(true); } catch (e) { setError(e); } };
  return (
    <Modal title={`Edit: ${layout.name}`} onClose={() => onClose(false)} footer={<><button className="btn" onClick={() => onClose(false)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid2">
        <Field label="Name"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="For business"><select className="input" value={v.business_type} onChange={(e) => setV({ ...v, business_type: e.target.value })}>{typeOptions}</select></Field>
        <Field label="Description" wide><input className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <label className="field check"><input type="checkbox" checked={v.is_default} onChange={(e) => setV({ ...v, is_default: e.target.checked })} /><span>Default design</span></label>
        <label className="field check"><input type="checkbox" checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} /><span>Active</span></label>
      </div>
      <p className="muted small">To change the design itself, download it, edit it in Word / Excel and use “Replace file”.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- HTML designer with instant preview
function HtmlDesigner({ layout, onClose }) {
  const { notify } = useToast();
  const editing = !!layout;
  const [v, setV] = useState({ name: layout?.name || '', business_type: layout?.business_type || 'cctv', description: layout?.description || '', is_default: !!layout?.is_default, html_content: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const existing = useAsync(() => (editing ? api.layouts.get(layout.id) : Promise.resolve(null)), [layout?.id]);
  const ph = useAsync(() => api.layouts.placeholders(), []);
  const ctx = useMemo(() => (ph.data ? contextFromPlaceholders(ph.data) : null), [ph.data]);

  // fill the editor: the saved source when editing, the starter design for a new one
  useEffect(() => {
    if (editing) { if (existing.data) setV((s) => ({ ...s, html_content: existing.data.html_content || '' })); return; }
    api.layouts.sampleText('html').then((t) => setV((s) => ({ ...s, html_content: t }))).catch(() => {});
  }, [editing, existing.data]);

  const source = useDebounced(v.html_content, 300);
  const preview = useMemo(() => (ctx ? renderHtmlPreview(source, ctx) : { html: '' }), [source, ctx]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (editing) await api.layouts.update(layout.id, v);
      else await api.layouts.createHtml(v);
      notify('Design saved'); onClose(true);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? `Edit design: ${layout.name}` : 'New HTML design'} wide onClose={() => onClose(false)} footer={
      <><button className="btn" onClick={() => onClose(false)}>Cancel</button><button className="btn primary" disabled={busy || !v.name || !v.html_content} onClick={save}>{busy ? 'Saving…' : 'Save design'}</button></>}>
      <ErrorBox error={error} />
      <div className="grid3">
        <Field label="Name *"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Design name" /></Field>
        <Field label="For business"><select className="input" value={v.business_type} onChange={(e) => setV({ ...v, business_type: e.target.value })}>{typeOptions}</select></Field>
        <label className="field check"><input type="checkbox" checked={v.is_default} onChange={(e) => setV({ ...v, is_default: e.target.checked })} /><span>Use as my default design</span></label>
      </div>
      <div className="designer">
        <div>
          <div className="label">HTML ( {'{{company.name}}'}, {'{{#each items}}…{{/each}}'} )</div>
          <textarea className="code" spellCheck="false" value={v.html_content} onChange={(e) => setV({ ...v, html_content: e.target.value })} aria-label="HTML source" />
        </div>
        <div>
          <div className="label">Live preview (sample figures)</div>
          {preview.error ? <div className="error-box">{preview.error}</div>
            : <iframe className="preview-frame small" title="Design preview" sandbox="" srcDoc={preview.html} />}
        </div>
      </div>
      <p className="muted small">The preview updates as you type. When you save, the server checks the design again with the real engine.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- tag reference
function TagsModal({ onClose }) {
  const { data, loading, error } = useAsync(() => api.layouts.placeholders(), []);
  const [q, setQ] = useState('');
  const tags = (data?.tags || []).filter((t) => t.tag.includes(q.toLowerCase()));
  return (
    <Modal title="What can I put in my design?" wide onClose={onClose}>
      <ErrorBox error={error} />
      {loading ? <Spinner /> : (
        <>
          <div className="notice">
            <p><strong>Word:</strong> {data.how_to_use.docx}</p>
            <p><strong>Excel:</strong> {data.how_to_use.xlsx}</p>
            <p><strong>HTML:</strong> {data.how_to_use.html}</p>
          </div>
          <input className="input" placeholder="Filter tags…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tags" />
          <h4>Single values</h4>
          <table className="table compact"><thead><tr><th>Tag</th><th>Example</th></tr></thead>
            <tbody>{tags.map((t) => <tr key={t.tag}><td><code>{t.tag}</code></td><td>{String(t.example)}</td></tr>)}</tbody></table>
          <h4>Repeating lists</h4>
          {data.loops.map((l) => (
            <div key={l.loop}><strong><code>{l.loop}</code></strong>
              <div className="chips">{l.fields.map((f) => <code key={f.tag} title={String(f.example)}>{f.tag}</code>)}</div></div>
          ))}
        </>
      )}
    </Modal>
  );
}
