import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../api/endpoints';
import { getToken, setToken, getCompanyScope, setCompanyScope } from '../api/client';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [scope, setScopeState] = useState(getCompanyScope());

  const logout = useCallback(() => {
    setToken(null);
    setCompanyScope(null);
    setScopeState(null);
    setUser(null);
    setCompany(null);
  }, []);

  const loadMe = useCallback(async () => {
    const me = await api.auth.me();
    setUser(me.user);
    setCompany(me.company);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    loadMe().catch(logout).finally(() => setLoading(false));
  }, [loadMe, logout]);

  // any request answered with 401 (expired token) logs the user out
  useEffect(() => {
    window.addEventListener('qm:unauthorized', logout);
    return () => window.removeEventListener('qm:unauthorized', logout);
  }, [logout]);

  const login = async (email, password) => {
    const data = await api.auth.login(email, password);
    setToken(data.token);
    setUser(data.user);
    setCompany(data.user.company || null);
    return data.user;
  };

  // super admin works "inside" one company at a time
  const setScope = (id) => { setCompanyScope(id); setScopeState(id ? String(id) : null); };

  const value = useMemo(() => {
    const role = user?.role;
    return {
      user, company, loading, scope, setScope, login, logout, reloadCompany: loadMe,
      isSuper: role === 'super_admin',
      isAdmin: role === 'super_admin' || role === 'company_admin',
      canManage: ['super_admin', 'company_admin', 'manager'].includes(role), // catalogue, terms, layouts, any quotation
    };
  }, [user, company, loading, scope, logout, loadMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
