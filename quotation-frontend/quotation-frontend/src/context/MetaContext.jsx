import { createContext, useContext, useEffect, useState } from 'react';
import * as api from '../api/endpoints';
import { useAuth } from './AuthContext';

const MetaContext = createContext({ states: [], constants: null });
export const useMeta = () => useContext(MetaContext);

// states + status rules are fetched once after login
export function MetaProvider({ children }) {
  const { user } = useAuth();
  const [meta, setMeta] = useState({ states: [], constants: null });

  useEffect(() => {
    if (!user) return;
    Promise.all([api.meta.states(), api.meta.constants()])
      .then(([states, constants]) => setMeta({ states, constants }))
      .catch(() => {});
  }, [user]);

  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>;
}
