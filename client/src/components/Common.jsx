import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Layers3,
  LockKeyhole,
  UserRound,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLoad } from '../services/api.js';

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="QuizX Studio home">
      <img src="/mark.svg" alt="" width="38" height="38" />
      <span>
        QuizX <b>Studio</b>
      </span>
    </Link>
  );
}
export function Header({ onGuide, children }) {
  return (
    <header className="topbar">
      <div className="bar-inner">
        <div className="brand-lockup">
          <Brand />
          <span className="product-name">ProudGeonZer0QuizX</span>
        </div>
        <div className="top-links">
          {children}
          <button
            className="guide-button"
            aria-label="Studio guide"
            onClick={() => onGuide('overview')}
          >
            <BookOpen size={17} />
            <span>Studio guide</span>
          </button>
          <span className="version">
            <i />
            Upgrade 1.0
          </span>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  const health = useLoad('/health', true);
  const online = health.data?.status === 'ready';
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="credit">
          <Layers3 size={16} />
          <strong>ProudGeonZer0QuizX</strong>
          <span className="credit-divider">/</span>
          <span>By Jun Jun Marollano</span>
        </div>
        <span className="service-status">
          <i className={online ? 'online' : ''} />
          {online ? 'System online' : health.error ? 'Service unavailable' : 'Checking service'}
        </span>
      </div>
    </footer>
  );
}
export function Modal({ title, eyebrow, onClose, children }) {
  const ref = useRef(null),
    id = useId();
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.offsetX < 0 ||
            e.offsetY < 0 ||
            e.offsetX > e.currentTarget.clientWidth ||
            e.offsetY > e.currentTarget.clientHeight)
        )
          onClose();
      }}
    >
      <div className="modal-head">
        <span className="eyebrow">{eyebrow || 'STUDIO GUIDE'}</span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={19} />
        </button>
      </div>
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}
const topics = {
  overview: [
    'Studio guide',
    'One login, two workspaces. Your account determines which tools you can use.',
    [
      [
        'Hosts',
        'Create a multiple-choice quiz, publish it, then select the players who should receive it. Review progress and scores in Results.',
      ],
      [
        'Players',
        'Open My Games to find quizzes your host assigned. Read the instructions, answer each question, then submit once to see your score.',
      ],
    ],
  ],
  activation: [
    'Your first login',
    'Your host or workspace administrator will give you a temporary username and password.',
    [
      [
        '01 · Sign in',
        'Enter your temporary credentials on the shared login page. There is no public registration.',
      ],
      [
        '02 · Make it yours',
        'Choose a unique username and a new password. Keep them private; your temporary credentials will no longer work.',
      ],
      [
        '03 · Enter the studio',
        'Hosts can create their first quiz. Players will see games as soon as their host assigns them.',
      ],
    ],
  ],
};
export function Guide({ topic, onClose, onTopic }) {
  const [title, intro, steps] = topics[topic];
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{intro}</p>
      <div className="guide-steps">
        {steps.map(([h, p]) => (
          <section key={h}>
            <h3>{h}</h3>
            <p>{p}</p>
          </section>
        ))}
      </div>
      <div className="modal-actions">
        <button
          className="text-button"
          onClick={() => onTopic(topic === 'activation' ? 'overview' : 'activation')}
        >
          {topic === 'activation' ? 'Studio overview' : 'First-login guide'}{' '}
          <ArrowUpRight size={15} />
        </button>
        <button className="button primary" onClick={onClose}>
          Got it <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
export function Field({ label, icon: Icon, hint, ...props }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        {Icon && <Icon className="field-icon" size={18} />}
        <input
          id={id}
          className={Icon ? 'with-icon' : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          {...props}
        />
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function PasswordField({ label = 'Password', hint, ...props }) {
  const [visible, setVisible] = useState(false),
    id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <LockKeyhole className="field-icon" size={18} />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="with-icon password-input"
          aria-describedby={hint ? `${id}-hint` : undefined}
          {...props}
        />
        <button
          type="button"
          className="eye"
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function UsernameField(props) {
  return <Field icon={UserRound} autoCapitalize="none" spellCheck={false} {...props} />;
}
export function Notice({ children, success = false }) {
  if (!children) return null;
  const Icon = success ? Check : CircleAlert;
  return (
    <div className={`notice ${success ? 'success' : 'error'}`} role={success ? 'status' : 'alert'}>
      <Icon size={16} />
      <span>{children}</span>
    </div>
  );
}
export function LoadState({ state, children }) {
  if (state.error)
    return (
      <div>
        <Notice>{state.error}</Notice>
        <button className="button secondary" onClick={state.reload}>
          Try again
        </button>
      </div>
    );
  if (state.data == null)
    return (
      <p className="load-line" role="status">
        Loading your workspace…
      </p>
    );
  return children(state.data);
}
export function ActionButton({ children, busy, loading = 'Saving…', ...props }) {
  return (
    <button type="submit" className="button primary wide" disabled={busy} {...props}>
      {busy ? loading : children}
      {!busy && <ArrowRight size={18} />}
    </button>
  );
}
