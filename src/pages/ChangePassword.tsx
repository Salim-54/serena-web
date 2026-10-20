import { useState, type FormEvent } from 'react';
import { changePassword, type Session } from '../lib/auth';

/**
 * Change your password. Shown on its own when the server requires it
 * (new account, admin reset, or a weak/default password), otherwise from
 * the header. The server checks the policy and returns a fresh session.
 */
export default function ChangePassword({
  required,
  onChanged,
  onCancel,
}: {
  required: boolean;
  onChanged: (s: Session) => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError("The new passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      onChanged(await changePassword(current, next));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>{required ? 'Choose a new password' : 'Change password'}</h1>
        {required && <p className="muted">For your security, set your own password before continuing.</p>}
        <label>
          Current password
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
        </label>
        <label>
          New password
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
        </label>
        <label>
          Repeat new password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
        </label>
        <p className="muted small">At least 8 characters, mixing letters with numbers or symbols. Not your email, and not a default like "change-me".</p>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
