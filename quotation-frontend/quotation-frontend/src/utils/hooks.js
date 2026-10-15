import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs an async function on mount / when deps change. Ignores answers that arrive late. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => { if (id === seq.current) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (id === seq.current) setState({ data: null, loading: false, error }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); return () => { seq.current++; }; }, [run]);
  return { ...state, reload: run };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
