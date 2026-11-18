import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  KeyRound,
  LayoutGrid,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api, post, useAction } from '../services/api.js';
import { ActionButton, Notice, PasswordField, UsernameField } from '../components/Common.jsx';

function Poster() {
  return (
    <aside className="poster" aria-label="Studio series: the quiz deck">
      <div className="poster-corners">
        <span className="series-chip">
          <Sparkles size={13} /> Studio series
        </span>
        <Plus size={19} strokeWidth={1.25} />
      </div>
      <div className="poster-art">
        <img
          src="/quiz-deck.webp"
          alt="A sculptural stack of quiz cards with a question mark and a tangerine check tile"
          fetchPriority="high"
        />
      </div>
      <div className="poster-copy">
        <div className="figure-index">
          <span />
          FIG. 001 &nbsp;/&nbsp; THE QUIZ DECK
        </div>
        <h2>
          Knowledge in play<span>.</span>
        </h2>
        <p>A shared space for curious minds.</p>
      </div>
      <span className="print-ticks" aria-hidden="true">
        ▏▎▏▍▏▏▎▍▏
      </span>
    </aside>
  );
}
export function Access({ user, setUser, onGuide, logout }) {
  const activate = Boolean(user?.mustChangeCredentials),
    action = useAction();
  const handleSubmit = (e) => {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    action.run(async () => {
      if (activate && fields.newPassword !== fields.confirmPassword)
        throw new Error('The new passwords do not match.');
      await post(activate ? '/auth/activate' : '/auth/login', fields);
      setUser(await api('/auth/me'));
    });
  };
  return (
    <main className="access-main">
      <div className="breadcrumb">
        <LayoutGrid size={14} />
        <span>Workspace</span>
        <ChevronRight size={13} />
        <b>{activate ? 'Account activation' : 'Account access'}</b>
      </div>
      <div className={`access-card ${activate ? 'activation' : ''}`}>
        <Poster />
        <section className="access-form">
          <div className="eyebrow">
            <i />
            {activate ? 'FIRST-LOGIN SETUP' : 'WORKSPACE ACCESS'}
          </div>
          <h1>{activate ? 'Make it yours.' : 'Welcome back.'}</h1>
          <p className="intro">
            {activate ? (
              <>
                Choose new credentials for <strong>{user.username}</strong>.
              </>
            ) : (
              'Log in to your Host or Player workspace.'
            )}
          </p>
          <form key={activate ? 'activate' : 'login'} onSubmit={handleSubmit}>
            <UsernameField
              name={activate ? 'newUsername' : 'username'}
              label={activate ? 'New username' : 'Username'}
              autoComplete="username"
              required
              minLength={activate ? 3 : 1}
              maxLength={activate ? 32 : 64}
              placeholder={activate ? 'Choose a unique username' : 'Enter your username'}
            />
            <PasswordField
              name={activate ? 'newPassword' : 'password'}
              label={activate ? 'New password' : 'Password'}
              autoComplete={activate ? 'new-password' : 'current-password'}
              required
              minLength={activate ? 12 : 1}
              maxLength={72}
              placeholder={activate ? 'Create a strong password' : 'Enter your password'}
              hint={activate ? '12+ characters, with uppercase, lowercase, and a number.' : null}
            />
            {activate && (
              <PasswordField
                label="Confirm new password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                placeholder="Repeat your new password"
              />
            )}
            <Notice>{action.error}</Notice>
            <ActionButton busy={action.busy} loading={activate ? 'Activating…' : 'Logging in…'}>
              {activate ? 'Activate account' : 'Log in'}
            </ActionButton>
          </form>
          {activate ? (
            <button className="text-button centered" onClick={logout}>
              Back to login
            </button>
          ) : (
            <div className="secure-caption">
              <ShieldCheck size={15} /> Secure access for hosts and players
            </div>
          )}
        </section>
      </div>
      <section className="access-note">
        <div className="note-icon">
          {activate ? <KeyRound size={20} /> : <BookOpen size={20} />}
        </div>
        <div>
          <h3>{activate ? 'A fresh start' : 'First time here?'}</h3>
          <p>
            {activate
              ? 'Your new credentials replace your temporary login.'
              : 'Use the temporary credentials from your host to activate your account.'}
          </p>
        </div>
        <button className="text-button" onClick={() => onGuide('activation')}>
          Activation guide <ArrowUpRight size={15} />
        </button>
      </section>
    </main>
  );
}
