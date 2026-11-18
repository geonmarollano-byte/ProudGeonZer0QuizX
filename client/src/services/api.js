import { useCallback, useEffect, useRef, useState } from 'react';
export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers:
        method === 'GET'
          ? {}
          : { 'Content-Type': 'application/json', 'X-QuizX-Request': 'workspace' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Could not reach the workspace. Check your connection and try again.');
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !['/auth/login', '/auth/me'].includes(path))
      window.dispatchEvent(new Event('session-ended'));
    throw Object.assign(
      new Error(data?.error || 'The workspace is unavailable. Try again shortly.'),
      { status: response.status },
    );
  }
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body });
export function useAction() {
  const lock = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const run = async (task) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      return await task();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
export function useLoad(path, refreshOnFocus = false) {
  const [counter, setCounter] = useState(0),
    [state, setState] = useState({});
  const reload = useCallback(() => setCounter((n) => n + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api(path, { signal: controller.signal })
      .then((data) => setState({ path, data }))
      .catch((e) => {
        if (e.name !== 'AbortError') setState({ path, error: e.message });
      });
    return () => controller.abort();
  }, [path, counter]);
  useEffect(() => {
    if (!refreshOnFocus) return;
    const visible = () => {
      if (!document.hidden) reload();
    };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refreshOnFocus, reload]);
  return { ...(state.path === path ? state : {}), reload };
}
