import { Link } from 'react-router-dom';
import * as api from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../utils/hooks';
import { inr, fmtDate } from '../utils/format';
import { StatusBadge, Spinner, Empty } from '../components/ui';

export default function Dashboard() {
  const { canManage } = useAuth();
  const summary = useAsync(() => (canManage ? api.reports.summary() : Promise.resolve(null)), [canManage]);
  const recent = useAsync(() => api.quotations.list({ limit: 8 }), []);
  const s = summary.data;

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link className="btn primary" to="/quotations/new">+ New quotation</Link>
      </div>

      {canManage && (
        <div className="cards">
          {summary.loading ? <Spinner /> : s && (
            <>
              <div className="stat"><span className="muted">Financial year</span><strong>{s.financial_year}</strong></div>
              <div className="stat"><span className="muted">Quotations</span><strong>{s.total_quotations}</strong></div>
              <div className="stat"><span className="muted">Open value (draft + sent)</span><strong>₹{inr(s.open_value)}</strong></div>
              <div className="stat"><span className="muted">Accepted value</span><strong>₹{inr(s.accepted_value)}</strong></div>
              <div className="stat"><span className="muted">Win rate</span><strong>{s.win_rate_percent === null ? '—' : `${s.win_rate_percent}%`}</strong></div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h3>Recent quotations</h3>
        {recent.loading ? <Spinner /> : recent.data?.quotations.length === 0 ? <Empty>No quotations yet. Create your first one.</Empty> : (
          <table className="table">
            <thead><tr><th>Number</th><th>Customer</th><th>Date</th><th>Status</th><th className="r">Total</th></tr></thead>
            <tbody>
              {recent.data?.quotations.map((q) => (
                <tr key={q.id}>
                  <td><Link to={`/quotations/${q.id}`}>{q.display_number}</Link></td>
                  <td>{q.customer?.name}</td><td>{fmtDate(q.quote_date)}</td>
                  <td><StatusBadge status={q.status} /></td><td className="r">₹{inr(q.grand_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
