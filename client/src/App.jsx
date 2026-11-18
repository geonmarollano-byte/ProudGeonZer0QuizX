import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Footer, Guide, Header, Notice } from './components/Common.jsx';
import { Workspace } from './components/Workspace.jsx';
import { Access } from './pages/Access.jsx';
import { homeFor } from './services/destination.js';
import { api, post } from './services/api.js';
export default function App() {
  const [user, setUser] = useState(undefined),
    [topic, setTopic] = useState(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api('/auth/me', { signal: controller.signal })
      .then(setUser)
      .catch((e) => {
        if (e.status === 401) setUser(null);
        else if (e.name !== 'AbortError') setError(e.message);
      });
    const ended = () => {
      setUser(null);
      setError('');
    };
    window.addEventListener('session-ended', ended);
    return () => {
      controller.abort();
      window.removeEventListener('session-ended', ended);
    };
  }, [retry]);
  const logout = async () => {
    try {
      await post('/auth/logout');
      setUser(null);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const home = homeFor(user);
  const access = (
    <Access key={home} user={user} setUser={setUser} onGuide={setTopic} logout={logout} />
  );
  return (
    <div className="app">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <Header onGuide={setTopic} />
      <div id="content" className="content" tabIndex={-1}>
        {error && (
          <div className="narrow">
            <Notice>{error}</Notice>
            <button
              className="button secondary"
              onClick={() => {
                setError('');
                setRetry((x) => x + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}
        {user === undefined ? (
          !error && (
            <main className="narrow load-line" role="status">
              Opening workspace…
            </main>
          )
        ) : (
          <Routes>
            <Route path="/login" element={!user ? access : <Navigate to={home} replace />} />
            <Route
              path="/activate"
              element={user?.mustChangeCredentials ? access : <Navigate to={home} replace />}
            />
            {user && !user.mustChangeCredentials && (
              <Route
                path={`${home}/*`}
                element={<Workspace user={user} setUser={setUser} logout={logout} />}
              />
            )}
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        )}
      </div>
      <Footer />
      {topic && <Guide topic={topic} onTopic={setTopic} onClose={() => setTopic(null)} />}
    </div>
  );
}
