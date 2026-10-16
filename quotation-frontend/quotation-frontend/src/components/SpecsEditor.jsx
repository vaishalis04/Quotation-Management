import { useId } from 'react';

// Starting suggestions for the label box; labels already used on other items are added by the page.
export const DEFAULT_SPEC_LABELS = ['Pixels', 'Lens type', 'Gimbal type', 'Resolution', 'Channels', 'Storage capacity', 'Ports', 'Length', 'Colour'];

// [{label,value}] -> "Pixels: 4MP · Lens type: 2.8mm"
export const specsLine = (item) => (Array.isArray(item?.specs) ? item.specs.filter((s) => s && s.label).map((s) => (s.value ? `${s.label}: ${s.value}` : s.label)).join(' · ') : '');

/** Custom item labels: any number of label + value pairs (Pixels = 4MP, Lens type = 2.8mm, ...). */
export default function SpecsEditor({ value, onChange, suggestions = [], compact = false }) {
  const listId = useId();
  const rows = Array.isArray(value) ? value : [];
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { label: '', value: '' }]);
  const cls = compact ? 'input sm' : 'input';

  return (
    <div className="specs-editor">
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      {rows.map((r, i) => (
        <div className={`inline nowrap ${compact ? 'mt' : 'mb'}`} key={i}>
          <input className={cls} list={listId} placeholder="Label (e.g. Pixels)" value={r.label} onChange={(e) => update(i, { label: e.target.value })} aria-label="Custom label" />
          <input className={cls} placeholder="Value (e.g. 4MP)" value={r.value} onChange={(e) => update(i, { value: e.target.value })} aria-label="Custom value" />
          <button type="button" className="btn ghost sm" onClick={() => remove(i)} aria-label="Remove custom label">✕</button>
        </div>
      ))}
      <button type="button" className={`btn sm ${compact ? 'ghost' : ''}`} style={compact ? { marginTop: 2, paddingLeft: 0 } : undefined} onClick={add}>
        + Add custom label
      </button>
    </div>
  );
}
