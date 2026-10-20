import { useState, type FormEvent } from 'react';
import { login, type Session } from '../lib/auth';
import { InstallButton } from '../components/InstallApp';
import { useDraft } from '../lib/drafts';

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail] = useDraft('login-email', ''); // never the password
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await login(email, password));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <img src="/logo.png" alt="" className="login-logo" />
        <h1>RM Utility Portal</h1>
        <p className="muted">Sign in with your department or admin account.</p>
        <label>
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <InstallButton className="btn ghost" />
      </form>
    </div>
  );
}
