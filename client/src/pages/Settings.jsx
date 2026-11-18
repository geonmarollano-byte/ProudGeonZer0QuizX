import { useState } from 'react';
import { post, useAction } from '../services/api.js';
import { ActionButton, Notice, PasswordField, UsernameField } from '../components/Common.jsx';
export function Settings({ user, setUser }) {
  const action = useAction(),
    [saved, setSaved] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      data = Object.fromEntries(new FormData(form));
    action.run(async () => {
      setSaved(false);
      const body = { currentPassword: data.currentPassword };
      if (data.newUsername.trim()) body.newUsername = data.newUsername.trim();
      if (data.newPassword || data.confirmPassword) {
        if (data.newPassword !== data.confirmPassword)
          throw new Error('The new passwords do not match.');
        Object.assign(body, {
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
        });
      }
      setUser(await post('/auth/change-credentials', body));
      form.reset();
      setSaved(true);
    });
  };
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">
            <i />
            ACCOUNT
          </div>
          <h1>Settings</h1>
          <p>Manage your own login details. Your role stays the same.</p>
        </div>
      </div>
      <section className="sheet settings-sheet">
        <h2>Account credentials</h2>
        <p className="muted">
          Signed in as <strong>{user.username}</strong>. Leave fields blank to keep them unchanged.
        </p>
        <form className="stack-form" onSubmit={submit}>
          <PasswordField
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
            required
          />
          <UsernameField
            name="newUsername"
            label="New username (optional)"
            placeholder={user.username}
            minLength={3}
            maxLength={32}
            autoComplete="username"
          />
          <PasswordField
            name="newPassword"
            label="New password (optional)"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            hint="12+ characters with uppercase, lowercase, and a number."
          />
          <PasswordField
            name="confirmPassword"
            label="Confirm new password"
            autoComplete="new-password"
          />
          <Notice>{action.error}</Notice>
          {saved && <Notice success>Credentials updated. Use your new details next time.</Notice>}
          <ActionButton busy={action.busy}>Save changes</ActionButton>
        </form>
      </section>
    </>
  );
}
