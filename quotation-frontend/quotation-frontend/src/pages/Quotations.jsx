import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api/endpoints';
import { useMeta } from '../context/MetaContext';
import { useAsync, useDebounced } from '../utils/hooks';
import { inr, fmtDate, cap } from '../utils/format';
import { StatusBadge, Spinner, Empty, Pagination, ErrorBox } from '../components/ui';

export default function Quotations() {
  const { constants } = useMeta();
  const [filters, setFilters] = useState({ q: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const q = useDebounced(filters.q);
  const { data, loading, error } = useAsync(
    () => api.quotations.list({ ...filters, q, page, limit: 20 }),
    [q, filters.status, filters.from, filters.to, page]
  );
  const set = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  return (
    <>
      <div className="page-head">
        <h1>Quotations</h1>
        <Link className="btn primary" to="/quotations/new">+ New quotation</Link>
      </div>

      <div className="card filters">
        <input className="input" placeholder="Search number, customer, subject, reference…" value={filters.q} onChange={set('q')} />
        <select className="input" value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">All statuses</option>
          {(constants?.statuses || []).map((s) => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
        <input className="input" type="date" value={filters.from} onChange={set('from')} aria-label="From date" />
        <input className="input" type="date" value={filters.to} onChange={set('to')} aria-label="To date" />
      </div>

      <div className="card">
        <ErrorBox error={error} />
        {loading ? <Spinner /> : data?.quotations.length === 0 ? <Empty>No quotations match.</Empty> : (
          <table className="table">
            <thead><tr><th>Number</th><th>Customer</th><th>Subject</th><th>Date</th><th>Valid until</th><th>Status</th><th className="r">Total (₹)</th></tr></thead>
            <tbody>
              {data?.quotations.map((x) => (
                <tr key={x.id}>
                  <td><Link to={`/quotations/${x.id}`}>{x.display_number}</Link></td>
                  <td>{x.customer?.name}</td><td>{x.subject}</td>
                  <td>{fmtDate(x.quote_date)}</td><td>{fmtDate(x.valid_until)}</td>
                  <td><StatusBadge status={x.status} /></td><td className="r">{inr(x.grand_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>
    </>
  );
}
