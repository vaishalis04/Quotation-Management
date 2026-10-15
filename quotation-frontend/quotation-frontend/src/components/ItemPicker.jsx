import { useEffect, useRef, useState } from 'react';
import * as api from '../api/endpoints';
import { useDebounced } from '../utils/hooks';
import { inr } from '../utils/format';

/** Type to search the catalogue; picking one fills name / HSN / unit / rate / GST on the row. Free text stays allowed (custom item). */
export default function ItemPicker({ value, onType, onPick, placeholder = 'Item name or search catalogue…' }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const q = useDebounced(value, 300);
  const box = useRef(null);

  useEffect(() => {
    if (!open || q.trim().length < 1) { setResults([]); return; }
    let live = true;
    api.items.list({ q, limit: 8 }).then((d) => live && setResults(d.items)).catch(() => live && setResults([]));
    return () => { live = false; };
  }, [q, open]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="picker" ref={box}>
      <input className="input" value={value} placeholder={placeholder} aria-label="Item name"
        onChange={(e) => { onType(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && results.length > 0 && (
        <ul className="picker-list">
          {results.map((it) => (
            <li key={it.id} onMouseDown={(e) => { e.preventDefault(); onPick(it); setOpen(false); }}>
              <strong>{it.name}</strong>
              <span className="muted small"> {it.brand || ''} {it.model_no || ''} · {it.hsn_sac || 'no HSN'} · ₹{inr(it.rate)} / {it.unit}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
