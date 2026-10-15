import { useEffect, useRef, useState } from 'react';
import * as api from '../api/endpoints';
import { API_ORIGIN } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useMeta } from '../context/MetaContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../utils/hooks';
import { Spinner, ErrorBox } from '../components/ui';
import FormGrid, { fieldErrors } from '../components/FormGrid';

const KEYS = ['name', 'legal_name', 'business_type', 'gstin', 'pan', 'state_code', 'phone', 'email', 'website', 'address', 'city', 'pincode',
  'bank_name', 'bank_account_name', 'bank_account_no', 'bank_ifsc', 'bank_branch', 'upi_id', 'signatory_name', 'signatory_designation',
  'quote_prefix', 'quote_number_padding', 'default_validity_days', 'default_gst_treatment', 'default_price_mode', 'round_off_enabled', 'default_terms'];

export default function Company() {
  const { reloadCompany } = useAuth();
  const { states } = useMeta();
  const { notify } = useToast();
  const { data, loading, error, reload } = useAsync(() => api.companies.me(), []);
  const [values, setValues] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [busy, setBusy] = useState(false);
  const logoInput = useRef(null);

  useEffect(() => {
    if (data) setValues(Object.fromEntries(KEYS.map((k) => [k, data[k] === null || data[k] === undefined ? '' : data[k]])));
  }, [data]);

  if (loading || !values) return error ? <ErrorBox error={error} /> : <Spinner />;

  const stateOptions = [{ value: '', label: '— select —' }, ...states.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))];
  const checkGstin = async (value, _v, setV) => {
    if (!value) return;
    try { const r = await api.meta.validateGstin(value); if (r.valid) setV((s) => ({ ...s, gstin: r.gstin, state_code: r.state_code })); else notify('This GSTIN is not valid', 'error'); } catch { /* server validates on save */ }
  };

  const sections = [
    ['Business & tax', [
      { name: 'name', label: 'Business name', required: true }, { name: 'legal_name', label: 'Legal name (printed)' },
      { name: 'business_type', label: 'Business type', type: 'select', options: ['cctv', 'security', 'it', 'electrical', 'other'].map((v) => ({ value: v, label: v.toUpperCase() })) },
      { name: 'gstin', label: 'GSTIN', onBlur: checkGstin }, { name: 'pan', label: 'PAN' },
      { name: 'state_code', label: 'State of registration', type: 'select', options: stateOptions, hint: 'Customers in this state get CGST+SGST, others IGST' },
    ]],
    ['Contact', [
      { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'website', label: 'Website' },
      { name: 'address', label: 'Address', type: 'textarea', rows: 2, wide: true }, { name: 'city', label: 'City' }, { name: 'pincode', label: 'Pincode' },
    ]],
    ['Bank details (printed on quotations)', [
      { name: 'bank_account_name', label: 'Account name' }, { name: 'bank_name', label: 'Bank' }, { name: 'bank_account_no', label: 'Account number' },
      { name: 'bank_ifsc', label: 'IFSC' }, { name: 'bank_branch', label: 'Branch' }, { name: 'upi_id', label: 'UPI id' },
    ]],
    ['Signatory', [{ name: 'signatory_name', label: 'Name' }, { name: 'signatory_designation', label: 'Designation' }]],
    ['Quotation defaults', [
      { name: 'quote_prefix', label: 'Number prefix', hint: 'QT → QT/2026-27/0001' },
      { name: 'quote_number_padding', label: 'Number digits', type: 'number' }, { name: 'default_validity_days', label: 'Valid for (days)', type: 'number' },
      { name: 'default_gst_treatment', label: 'GST', type: 'select', options: [{ value: 'regular', label: 'Charge GST' }, { value: 'no_gst', label: 'No GST (composition / exempt)' }] },
      { name: 'default_price_mode', label: 'Prices entered', type: 'select', options: [{ value: 'exclusive', label: 'Excluding GST' }, { value: 'inclusive', label: 'Including GST' }] },
      { name: 'round_off_enabled', label: 'Round grand total to nearest rupee', type: 'checkbox' },
      { name: 'default_terms', label: 'Fallback terms (one per line)', type: 'textarea', rows: 3, wide: true },
    ]],
  ];

  const save = async () => {
    setBusy(true); setSaveError(null);
    try {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]));
      body.name = values.name;
      ['quote_number_padding', 'default_validity_days'].forEach((k) => { if (body[k] !== null) body[k] = Number(body[k]); });
      if (body.gstin && !body.state_code) delete body.state_code;
      await api.companies.updateMe(body);
      notify('Company profile saved');
      reload(); reloadCompany();
    } catch (e) { setSaveError(e); } finally { setBusy(false); }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await api.companies.uploadLogo(file); notify('Logo uploaded'); reload(); } catch (err) { notify(err.message, 'error'); }
    e.target.value = '';
  };

  return (
    <>
      <div className="page-head"><h1>Company profile</h1><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
      <ErrorBox error={saveError && Object.keys(fieldErrors(saveError)).length ? { message: 'Please fix the highlighted fields', errors: saveError.errors } : saveError} />
      <section className="card">
        <h3>Logo</h3>
        <div className="inline">
          {data.logo ? <img className="logo-preview" src={`${API_ORIGIN}/uploads/${data.logo}`} alt="Company logo" /> : <span className="muted">No logo yet</span>}
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
          <button className="btn" onClick={() => logoInput.current.click()}>Upload logo</button>
        </div>
        <p className="muted small">HTML designs can show it with {'{{company.logo_data_uri}}'}. For Word designs, place the logo inside the .docx itself.</p>
      </section>
      {sections.map(([title, fields]) => (
        <section className="card" key={title}><h3>{title}</h3><FormGrid fields={fields} values={values} setValues={setValues} errors={fieldErrors(saveError)} /></section>
      ))}
    </>
  );
}
