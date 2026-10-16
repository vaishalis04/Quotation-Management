import { Field } from './ui';

/**
 * Renders a list of field definitions:
 *  { name, label, type: text|number|email|date|textarea|select|checkbox, options: [{value,label}], wide, hint, required, rows, step, onBlur(value, values, setValues) }
 */
export default function FormGrid({ fields, values, setValues, errors = {} }) {
  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));
  return (
    <div className="grid2">
      {fields.filter((f) => !f.hidden).map((f) => {
        const v = values[f.name] ?? '';
        // custom control (e.g. logo picker, custom item labels): the field supplies its own editor
        if (f.render) {
          return (
            <div key={f.name} className={`field ${f.wide ? 'wide' : ''}`}>
              <span className="label">{f.label}</span>
              {f.render({ value: values[f.name], setValue: (nv) => set(f.name, nv), values, setValues })}
              {f.hint && <span className="hint">{f.hint}</span>}
              {errors[f.name] && <span className="err-text">{errors[f.name]}</span>}
            </div>
          );
        }
        let control;
        if (f.type === 'select') {
          control = (
            <select className="input" value={v} onChange={(e) => set(f.name, e.target.value)} onBlur={() => f.onBlur?.(v, values, setValues)}>
              {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          );
        } else if (f.type === 'textarea') {
          control = <textarea className="input" rows={f.rows || 3} value={v} onChange={(e) => set(f.name, e.target.value)} />;
        } else if (f.type === 'checkbox') {
          return (
            <label key={f.name} className={`field check ${f.wide ? 'wide' : ''}`}>
              <input type="checkbox" checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
              <span>{f.label}</span>
              {f.hint && <span className="hint">{f.hint}</span>}
            </label>
          );
        } else {
          control = (
            <input className="input" type={f.type || 'text'} step={f.step} value={v} required={f.required}
              onChange={(e) => set(f.name, e.target.value)} onBlur={() => f.onBlur?.(v, values, setValues)} />
          );
        }
        return <Field key={f.name} label={f.label + (f.required ? ' *' : '')} hint={f.hint} error={errors[f.name]} wide={f.wide}>{control}</Field>;
      })}
    </div>
  );
}

// API field errors [{field, message}] -> { field: message }
export const fieldErrors = (error) => Object.fromEntries((error?.errors || []).filter((e) => e && e.field).map((e) => [e.field, e.message]));
