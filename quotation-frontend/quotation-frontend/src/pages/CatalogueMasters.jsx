import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../utils/hooks';
import { Spinner, Empty, ErrorBox } from '../components/ui';
import CrudModal from '../components/CrudModal';

const TABS = [['products', 'Products'], ['companies', 'Companies'], ['categories', 'Categories'], ['clients', 'Clients'], ['descriptions', 'Descriptions'], ['letters', 'Letters'], ['letterheads', 'Header/Footer images']];
const ADD_LABEL = { products: 'product', companies: 'company', categories: 'category', clients: 'client', descriptions: 'description', letters: 'letter', letterheads: 'image' };
const sameId = (a, b) => String(a ?? '') === String(b ?? '');
const short = (s, n = 90) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '');

/**
 * The masters behind items and quotations:
 *   1) Product (required)   2) Company under a product (optional)   3) Category under a company, or directly under a product (optional)
 *   4) Clients ("Our clients" printed on a quotation)   5) Saved descriptions (picked into item rows)
 * Open a tab directly with ?tab=clients or ?tab=descriptions.
 */
export default function CatalogueMasters() {
  const { canManage } = useAuth();
  const { notify } = useToast();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'products');
  const [editing, setEditing] = useState(null); // { kind, row | null }
  const [fProduct, setFProduct] = useState('');
  const [fCompany, setFCompany] = useState('');
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api.catalogueMasters.tree(true), []);
  const clientsQ = useAsync(() => api.clientMasters.list({ active: 'all' }), []);
  const descsQ = useAsync(() => api.descriptionMasters.list({ active: 'all' }), []);
  const lettersQ = useAsync(() => api.letterMasters.list({ active: 'all' }), []);
  const imagesQ = useAsync(() => api.letterheads.list({ active: 'all' }), []);

  const products = data?.products || [];
  const clients = clientsQ.data || [];
  const descriptions = descsQ.data || [];
  const letters = lettersQ.data || [];
  const images = imagesQ.data || [];
  const companies = products.flatMap((p) => p.companies.map((c) => ({ ...c, product_name: p.name })));
  const categories = products.flatMap((p) => [
    ...p.categories.map((c) => ({ ...c, product_name: p.name, company_name: '' })),
    ...p.companies.flatMap((co) => co.categories.map((c) => ({ ...c, product_name: p.name, company_name: co.name }))),
  ]);
  const shownCompanies = companies.filter((c) => !fProduct || sameId(c.product_id, fProduct));
  const shownCategories = categories.filter((c) => (!fProduct || sameId(c.product_id, fProduct)) && (!fCompany || (fCompany === 'none' ? !c.brand_id : sameId(c.brand_id, fCompany))));
  const companiesOfFilter = fProduct ? companies.filter((c) => sameId(c.product_id, fProduct)) : [];

  const resourceFor = (kind) => ({ clients: api.clientMasters, descriptions: api.descriptionMasters, letters: api.letterMasters, letterheads: api.letterheads }[kind] || api.catalogueMasters[kind]);
  const reloadAll = () => { reload(); clientsQ.reload(); descsQ.reload(); lettersQ.reload(); imagesQ.reload(); };

  const remove = async (kind, row) => {
    if (!window.confirm(`Delete "${row.name || row.title}"?`)) return;
    try { await resourceFor(kind).remove(row.id); notify('Deleted'); reloadAll(); } catch (e) { notify(e.message, 'error'); }
  };
  // Excel with the headings: Full Version in Quotation | company | category | Product. Safe to run again: nothing is duplicated.
  const importSheet = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true); setReport(null);
    try { const r = await api.catalogueMasters.importExcel(file); setReport(r); notify('Import finished'); reload(); } catch (err) { notify(err.message, 'error'); } finally { setImporting(false); }
  };
  const switchTab = (t) => { setTab(t); setFCompany(''); };

  const productOptions = [{ value: '', label: '— select product —' }, ...products.map((p) => ({ value: String(p.id), label: p.name }))];
  const activeBox = { name: 'is_active', label: 'Active (can be chosen on new items)', type: 'checkbox', wide: true };

  // ---- dialog for the current kind
  const dialog = () => {
    if (!editing) return null;
    const { kind, row } = editing;
    const isNew = !row;
    const done = (saved) => { setEditing(null); if (saved) { notify('Saved'); reloadAll(); } };
    if (kind === 'products') {
      return <CrudModal title={isNew ? 'Add product' : 'Edit product'} fields={[{ name: 'name', label: 'Product name', required: true, wide: true, hint: 'e.g. Camera, NVR, DVR, Cable, Network Switch' }, activeBox]}
        initial={{ name: row?.name || '', is_active: row ? row.is_active : true }}
        onSave={(v) => (isNew ? api.catalogueMasters.products.create(v) : api.catalogueMasters.products.update(row.id, v))} onClose={done} />;
    }
    if (kind === 'companies') {
      const fields = [
        ...(isNew ? [{ name: 'product_id', label: 'Under product', type: 'select', options: productOptions, required: true, wide: true }] : []),
        { name: 'name', label: 'Company name', required: true, wide: true, hint: 'e.g. CP Plus, Prama, Hikvision' }, activeBox,
      ];
      return <CrudModal title={isNew ? 'Add company' : `Edit company (under ${row.product_name})`} fields={fields}
        initial={{ product_id: fProduct, name: row?.name || '', is_active: row ? row.is_active : true }}
        onSave={(v) => (isNew ? api.catalogueMasters.companies.create(v) : api.catalogueMasters.companies.update(row.id, v))} onClose={done} />;
    }
    if (kind === 'clients') {
      return <CrudModal title={isNew ? 'Add client' : 'Edit client'}
        fields={[
          { name: 'name', label: 'Client name', required: true, wide: true, hint: 'Shown in “Our clients” on the quotation' },
          { name: 'location', label: 'Location', wide: true },
          { name: 'is_active', label: 'Active (can be chosen on new quotations)', type: 'checkbox', wide: true },
        ]}
        initial={{ name: row?.name || '', location: row?.location || '', is_active: row ? row.is_active : true }}
        onSave={(v) => (isNew ? api.clientMasters.create(v) : api.clientMasters.update(row.id, v))} onClose={done} />;
    }
    if (kind === 'descriptions') {
      return <CrudModal title={isNew ? 'Add description' : 'Edit description'}
        fields={[
          { name: 'title', label: 'Title', required: true, wide: true, hint: 'Short name shown in the picker' },
          {
            name: 'content', label: 'Description text', required: true, wide: true,
            render: ({ value, setValue }) => <textarea className="input" rows={6} value={value || ''} onChange={(e) => setValue(e.target.value)} aria-label="Description text" />,
          },
          { name: 'is_active', label: 'Active (can be picked on new quotations)', type: 'checkbox', wide: true },
        ]}
        initial={{ title: row?.title || '', content: row?.content || '', is_active: row ? row.is_active : true }}
        onSave={(v) => (isNew ? api.descriptionMasters.create(v) : api.descriptionMasters.update(row.id, v))} onClose={done} />;
    }
    if (kind === 'letters') {
      return <CrudModal title={isNew ? 'Add letter' : 'Edit letter'}
        fields={[
          { name: 'title', label: 'Title', required: true, wide: true, hint: 'Short name shown in the picker, e.g. “Standard CCTV offer”' },
          {
            name: 'content', label: 'Letter text', required: true, wide: true,
            hint: 'Placeholders filled when the letter is picked on a quotation: {{customer}} {{attention}} {{subject}} {{date}}',
            render: ({ value, setValue }) => <textarea className="input" rows={10} value={value || ''} onChange={(e) => setValue(e.target.value)} placeholder={'Dear Sir,\n\nWith reference to your enquiry...'} aria-label="Letter text" />,
          },
          { name: 'is_active', label: 'Active (can be picked on new quotations)', type: 'checkbox', wide: true },
        ]}
        initial={{ title: row?.title || '', content: row?.content || '', is_active: row ? row.is_active : true }}
        onSave={(v) => (isNew ? api.letterMasters.create(v) : api.letterMasters.update(row.id, v))} onClose={done} />;
    }
    if (kind === 'letterheads') {
      const fields = [
        ...(isNew ? [{ name: 'kind', label: 'Use as', type: 'select', required: true, wide: true, options: [{ value: '', label: '— select —' }, { value: 'header', label: 'Header (top of every page)' }, { value: 'footer', label: 'Footer (bottom of every page)' }] }] : []),
        { name: 'name', label: 'Name', required: !isNew, wide: true, hint: isNew ? 'Optional: the file name is used when empty' : '' },
        ...(isNew ? [{
          name: 'file', label: 'Image (PNG or JPG, max 2 MB)', wide: true, hint: 'Use a wide image, e.g. 2480 px wide for A4, so it prints sharp edge to edge',
          render: ({ setValue }) => <input type="file" accept="image/png,image/jpeg" onChange={(e) => setValue(e.target.files && e.target.files[0])} aria-label="Image file" />,
        }] : []),
        { name: 'is_active', label: 'Active (can be chosen on new quotations)', type: 'checkbox', wide: true },
      ];
      return <CrudModal title={isNew ? 'Add header / footer image' : 'Edit image'} fields={fields}
        initial={{ kind: '', name: row?.name || '', file: null, is_active: row ? row.is_active : true }}
        onSave={(v) => {
          if (!isNew) return api.letterheads.update(row.id, { name: v.name, is_active: v.is_active });
          if (!v.kind) throw new Error('Choose whether this is a header or a footer');
          if (!v.file) throw new Error('Choose an image file');
          return api.letterheads.upload(v);
        }} onClose={done} />;
    }
    const fields = [
      ...(isNew ? [
        { name: 'product_id', label: 'Under product', type: 'select', options: productOptions, required: true, wide: true },
        {
          name: 'brand_id', label: 'Under company (optional)', wide: true, hint: 'Leave empty when the product has no company (local / third party)',
          render: ({ value, setValue, values }) => {
            const list = companies.filter((c) => sameId(c.product_id, values.product_id));
            return (
              <select className="input" value={list.some((c) => sameId(c.id, value)) ? value : ''} onChange={(e) => setValue(e.target.value)} aria-label="Under company">
                <option value="">— no company (directly under the product) —</option>
                {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            );
          },
        },
      ] : []),
      { name: 'name', label: 'Category name', required: true, wide: true, hint: 'e.g. ip 4mp dome color view with audio, 8 port giga, 5 core' }, activeBox,
    ];
    return <CrudModal title={isNew ? 'Add category' : `Edit category (under ${row.product_name}${row.company_name ? ` › ${row.company_name}` : ''})`} fields={fields}
      initial={{ product_id: fProduct, brand_id: fCompany && fCompany !== 'none' ? fCompany : '', name: row?.name || '', is_active: row ? row.is_active : true }}
      onSave={(v) => {
        const list = companies.filter((c) => sameId(c.product_id, v.product_id));
        const brand_id = list.some((c) => sameId(c.id, v.brand_id)) ? v.brand_id : null; // ignore a company left over from another product
        return isNew ? api.catalogueMasters.categories.create({ ...v, brand_id }) : api.catalogueMasters.categories.update(row.id, { name: v.name, is_active: v.is_active });
      }} onClose={done} />;
  };

  const status = (r) => (r.is_active ? 'Active' : 'Inactive');
  const actions = (kind, r) => canManage && (
    <td className="r nowrap"><button className="btn sm" onClick={() => setEditing({ kind, row: r })}>Edit</button>{' '}<button className="btn ghost sm" onClick={() => remove(kind, r)}>Delete</button></td>
  );

  const q4 = { clients: clientsQ, descriptions: descsQ, letters: lettersQ, letterheads: imagesQ }[tab];
  const tabLoading = q4 ? q4.loading : loading;
  const tabError = q4 ? q4.error : error;

  return (
    <>
      <div className="page-head">
        <h1>Product masters</h1>
        {canManage && (
          <div className="inline">
            {['products', 'companies', 'categories'].includes(tab) && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={importSheet} aria-label="Excel file" />
                <button className="btn" disabled={importing} onClick={() => fileRef.current && fileRef.current.click()}>{importing ? 'Importing…' : 'Import from Excel'}</button>
              </>
            )}
            <button className="btn primary" onClick={() => setEditing({ kind: tab, row: null })}>+ Add {ADD_LABEL[tab]}</button>
          </div>
        )}
      </div>
      {report && (
        <div className="notice">
          <strong>Imported from sheet “{report.sheet}”:</strong> {report.rows} rows read — {report.added.products} products, {report.added.companies} companies and {report.added.categories} categories added (anything that already existed was left as it is).
          {report.warnings.length > 0 && (
            <details style={{ marginTop: 6 }}><summary>{report.warnings.length} row(s) to double-check</summary>
              <ul className="small">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
          <button className="btn ghost sm" onClick={() => setReport(null)}>Close</button>
        </div>
      )}
      <p className="muted small">Create the Product first. A Company (optional) sits under a product, and a Category (optional) under a company, or directly under the product when there is no company. Items and quotations then pick them in that order. Clients are the reference list printed before the items; Descriptions are saved texts you can pick into any item.</p>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => switchTab(k)}>{label}</button>)}
      </div>
      <ErrorBox error={tabError} />
      {tabLoading ? <Spinner /> : (
        <div className="card">
          {(tab === 'companies' || tab === 'categories') && (
            <div className="filters" style={{ marginBottom: 10 }}>
              <select className="input" value={fProduct} onChange={(e) => { setFProduct(e.target.value); setFCompany(''); }} aria-label="Filter by product">
                <option value="">All products</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {tab === 'categories' && fProduct && (
                <select className="input" value={fCompany} onChange={(e) => setFCompany(e.target.value)} aria-label="Filter by company">
                  <option value="">All companies</option><option value="none">No company</option>{companiesOfFilter.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          )}

          {tab === 'products' && (products.length === 0 ? <Empty>No products yet. Add Camera, NVR, Cable… to start.</Empty> : (
            <div className="scroll-x"><table className="table">
              <thead><tr><th>Product</th><th className="r">Companies</th><th className="r">Categories</th><th className="r">Items</th><th>Status</th>{canManage && <th />}</tr></thead>
              <tbody>{products.map((p) => (
                <tr key={p.id} className={p.is_active ? '' : 'inactive'}>
                  <td><strong>{p.name}</strong></td><td className="r">{p.companies.length}</td>
                  <td className="r">{p.categories.length + p.companies.reduce((s, c) => s + c.categories.length, 0)}</td><td className="r">{p.item_count}</td><td>{status(p)}</td>
                  {actions('products', p)}
                </tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'companies' && (shownCompanies.length === 0 ? <Empty>No companies here. Add CP Plus, Prama… under a product (leave it out for local / third-party products).</Empty> : (
            <div className="scroll-x"><table className="table">
              <thead><tr><th>Company</th><th>Product</th><th className="r">Categories</th><th className="r">Items</th><th>Status</th>{canManage && <th />}</tr></thead>
              <tbody>{shownCompanies.map((c) => (
                <tr key={c.id} className={c.is_active ? '' : 'inactive'}>
                  <td><strong>{c.name}</strong></td><td>{c.product_name}</td><td className="r">{c.categories.length}</td><td className="r">{c.item_count}</td><td>{status(c)}</td>
                  {actions('companies', c)}
                </tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'categories' && (shownCategories.length === 0 ? <Empty>No categories here yet.</Empty> : (
            <div className="scroll-x"><table className="table">
              <thead><tr><th>Category</th><th>Product</th><th>Company</th><th className="r">Items</th><th>Status</th>{canManage && <th />}</tr></thead>
              <tbody>{shownCategories.map((c) => (
                <tr key={c.id} className={c.is_active ? '' : 'inactive'}>
                  <td><strong>{c.name}</strong></td><td>{c.product_name}</td><td>{c.company_name || <span className="muted">— none —</span>}</td><td className="r">{c.item_count}</td><td>{status(c)}</td>
                  {actions('categories', c)}
                </tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'clients' && (clients.length === 0 ? <Empty>No clients yet. Add the customers you want to show as “Our clients” on quotations.</Empty> : (
            <div className="scroll-x"><table className="table">
              <thead><tr><th>Client</th><th>Location</th><th>Status</th>{canManage && <th />}</tr></thead>
              <tbody>{clients.map((c) => (
                <tr key={c.id} className={c.is_active ? '' : 'inactive'}>
                  <td><strong>{c.name}</strong></td><td>{c.location || <span className="muted">—</span>}</td><td>{status(c)}</td>
                  {actions('clients', c)}
                </tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'descriptions' && (descriptions.length === 0 ? <Empty>No saved descriptions yet. Add texts you reuse on item lines.</Empty> : (
            <div className="scroll-x"><table className="table">
              <thead><tr><th>Title</th><th>Description</th><th>Status</th>{canManage && <th />}</tr></thead>
              <tbody>{descriptions.map((d) => (
                <tr key={d.id} className={d.is_active ? '' : 'inactive'}>
                  <td><strong>{d.title}</strong></td><td className="small">{short(d.content)}</td><td>{status(d)}</td>
                  {actions('descriptions', d)}
                </tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'letters' && (letters.length === 0 ? <Empty>No letters yet. Write your “Dear Sir…” covering letters here and pick one on any quotation.</Empty> : (
            <div className="scroll-x"><table className="table">
              <thead><tr><th>Title</th><th>Letter</th><th>Status</th>{canManage && <th />}</tr></thead>
              <tbody>{letters.map((l) => (
                <tr key={l.id} className={l.is_active ? '' : 'inactive'}>
                  <td><strong>{l.title}</strong></td><td className="small">{short(l.content, 120)}</td><td>{status(l)}</td>
                  {actions('letters', l)}
                </tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'letterheads' && (images.length === 0 ? <Empty>No images yet. Upload a wide header and/or footer image; it prints on every page of the quotation.</Empty> : (
            <div className="scroll-x"><table className="table">
              <thead><tr><th>Name</th><th>Use as</th><th>Preview</th><th>Status</th>{canManage && <th />}</tr></thead>
              <tbody>{images.map((im) => (
                <tr key={im.id} className={im.is_active ? '' : 'inactive'}>
                  <td><strong>{im.name}</strong></td><td>{im.kind === 'header' ? 'Header' : 'Footer'}</td>
                  <td>{im.data_url ? <img src={im.data_url} alt={im.name} style={{ maxWidth: 260, maxHeight: 60, display: 'block' }} /> : <span className="muted">file missing</span>}</td>
                  <td>{status(im)}</td>
                  {actions('letterheads', im)}
                </tr>))}</tbody>
            </table></div>
          ))}
        </div>
      )}
      {dialog()}
    </>
  );
}