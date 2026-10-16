import { useId } from 'react';

/** Free-text box that suggests values already used elsewhere (keeps Product / Company / Category spelled the same). */
export default function SuggestInput({ value, onChange, options = [], placeholder, ariaLabel }) {
  const id = useId();
  return (
    <>
      <input className="input" list={id} value={value ?? ''} placeholder={placeholder} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}
