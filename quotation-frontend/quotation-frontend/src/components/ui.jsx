import { cap } from '../utils/format';

export const StatusBadge = ({ status }) => <span className={`badge st-${status}`}>{cap(status)}</span>;

export const Field = ({ label, children, hint, error, wide }) => (
  <label className={`field ${wide ? 'wide' : ''}`}>
    <span className="label">{label}</span>
    {children}
    {hint && <span className="hint">{hint}</span>}
    {error && <span className="err-text">{error}</span>}
  </label>
);

export const Spinner = ({ text = 'Loading…' }) => <div className="muted pad">{text}</div>;

/** API errors: the message, plus field errors / layout tag problems underneath */
export function ErrorBox({ error }) {
  if (!error) return null;
  const list = (error.errors || []).map((e) => (typeof e === 'string' ? e : e.field ? `${e.field}: ${e.message}` : e.message));
  return (
    <div className="error-box" role="alert">
      <strong>{error.message}</strong>
      {list.length > 0 && <ul>{list.map((m, i) => <li key={i}>{m}</li>)}</ul>}
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;
  return (
    <div className="pager">
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      <span>Page {page} of {totalPages} · {total} records</span>
      <button className="btn sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}

export const Empty = ({ children }) => <div className="empty">{children}</div>;
