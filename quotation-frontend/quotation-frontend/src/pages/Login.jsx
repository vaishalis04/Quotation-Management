import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorBox } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await login(email, password); nav('/'); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h2>Quotation Manager</h2>
        <p className="muted">Sign in to continue</p>
        <ErrorBox error={error} />
        <label className="field"><span className="label">Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label className="field"><span className="label">Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
