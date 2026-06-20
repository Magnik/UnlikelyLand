'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, setSession } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.register({ username, password, displayName: displayName || undefined });
      setSession(res.token, res.refreshToken);
      router.replace('/play');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="hero" style={{ padding: '32px 0 16px' }}>
        <div className="big">New arrival</div>
        <div className="tag">Pick a name. The island will assign the rest.</div>
      </div>
      <form className="card" onSubmit={submit}>
        {error ? <div className="error">{error}</div> : null}
        <div className="field">
          <label htmlFor="reg-username">Username (3–24 chars, letters/numbers/underscore)</label>
          <input id="reg-username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="reg-displayname">Display name (optional)</label>
          <input id="reg-displayname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="reg-password">Password (min 8 chars)</label>
          <input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <button className="btn btn-primary" disabled={busy || !username || password.length < 8}>
          {busy ? 'Creating…' : 'Begin'}
        </button>
      </form>
      <p className="center muted small">
        Already trapped here? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
