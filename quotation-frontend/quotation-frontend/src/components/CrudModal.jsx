import { useState } from 'react';
import Modal from './Modal';
import FormGrid, { fieldErrors } from './FormGrid';
import { ErrorBox } from './ui';

/** Create / edit dialog: shows server validation errors next to the fields. */
export default function CrudModal({ title, fields, initial, onSave, onClose }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    try { await onSave(values); onClose(true); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title={title} onClose={() => onClose(false)} footer={
      <>
        <button className="btn" onClick={() => onClose(false)}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save'}</button>
      </>
    }>
      <ErrorBox error={error && Object.keys(fieldErrors(error)).length ? { message: 'Please fix the highlighted fields' } : error} />
      <FormGrid fields={fields} values={values} setValues={setValues} errors={fieldErrors(error)} />
    </Modal>
  );
}
