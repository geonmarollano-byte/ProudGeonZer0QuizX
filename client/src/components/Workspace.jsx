import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  Award,
  CirclePlus,
  Gamepad2,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  Settings2,
  UsersRound,
  X,
} from 'lucide-react';
import { HostOverview, MyGames } from '../pages/Dashboards.jsx';
import { GameEditor, HostGame } from '../pages/HostGame.jsx';
import { Players, Assignments } from '../pages/Assignments.jsx';
import { PlayGame, PlayerResult, ResultHistory } from '../pages/Play.jsx';
import { Settings } from '../pages/Settings.jsx';
const hostNav = [
  ['', 'Overview', LayoutDashboard],
  ['create', 'Create game', CirclePlus],
  ['games', 'My games', LibraryBig],
  ['players', 'Players', UsersRound],
  ['results', 'Results', Award],
  ['settings', 'Settings', Settings2],
];
const playerNav = [
  ['', 'My games', Gamepad2],
  ['results', 'My results', Award],
  ['settings', 'Settings', Settings2],
];
export function Workspace({ user, setUser, logout }) {
  const host = user.role === 'HOST',
    base = host ? '/host' : '/player',
    nav = host ? hostNav : playerNav;
  const [open, setOpen] = useState(false),
    { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className={`workspace ${host ? 'host-space' : 'player-space'}`}>
      <aside className="sidebar">
        <div className="profile">
          <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
          <div>
            <span className="micro">{host ? 'Host' : 'Player'} workspace</span>
            <strong>{user.username}</strong>
          </div>
          <button
            className="icon-button nav-toggle"
            aria-label="Workspace menu"
            aria-expanded={open}
            aria-controls="workspace-nav"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        <div id="workspace-nav" className={`nav-body ${open ? 'is-open' : ''}`}>
          <nav aria-label="Workspace navigation">
            {nav.map(([path, label, Icon]) => (
              <NavLink key={path} end={!path} to={path ? `${base}/${path}` : base}>
                <Icon size={17} />
                {label}
              </NavLink>
            ))}
          </nav>
          <button className="logout" onClick={logout}>
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>
      <main className="work-main">
        <Routes>
          <Route index element={host ? <HostOverview user={user} /> : <MyGames user={user} />} />
          {host && <Route path="games" element={<HostOverview user={user} library />} />}
          {host && (
            <>
              <Route path="players" element={<Players />} />
              <Route path="games/:gameId/assign" element={<Assignments />} />
              <Route path="create" element={<GameEditor />} />
              <Route path="games/:gameId" element={<HostGame />} />
              <Route path="games/:gameId/edit" element={<GameEditor edit />} />
            </>
          )}
          <Route path="results" element={<ResultHistory host={host} />} />
          {!host && (
            <>
              <Route path="games/:gameId" element={<PlayGame />} />
              <Route path="results/:attemptId" element={<PlayerResult />} />
            </>
          )}
          <Route path="settings" element={<Settings user={user} setUser={setUser} />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </main>
    </div>
  );
}
