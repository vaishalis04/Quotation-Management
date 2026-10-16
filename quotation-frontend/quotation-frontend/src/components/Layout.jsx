import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/endpoints';

export default function Layout() {
  const { user, company, logout, isSuper, isAdmin, canManage, scope, setScope } = useAuth();
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    if (isSuper) api.companies.list().then((d) => setCompanies(d.companies)).catch(() => {});
  }, [isSuper]);

  const links = [
    ['/', 'Dashboard', true],
    ['/quotations', 'Quotations', true],
    ['/customers', 'Customers', true],
    ['/masters', 'Product masters', canManage],
    ['/terms', 'Terms', canManage],
    ['/charges', 'Charges', canManage],
    ['/layouts', 'Quotation designs', true],
    ['/company', 'Company', isAdmin],
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Quotation<br /><span>Manager</span></div>
        <nav>
          {links.filter((l) => l[2]).map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            {isSuper ? (
              <select className="input sm" value={scope || ''} onChange={(e) => setScope(e.target.value)} aria-label="Company">
                <option value="">— choose company —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : <strong>{company?.name}</strong>}
          </div>
          <div className="user">
            <span>{user?.name} <span className="muted small">({user?.role.replace('_', ' ')})</span></span>
            <button className="btn sm" onClick={logout}>Log out</button>
          </div>
        </header>
        <main className="content" key={scope || 'own'}>
          {isSuper && !scope && <div className="notice">Choose a company at the top to work inside it.</div>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
