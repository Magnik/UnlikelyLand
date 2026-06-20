'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, setSession } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.login({ username, password });
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
        <div className="big">Welcome back</div>
        <div className="tag">The island missed you. Probably.</div>
      </div>
      <form className="card" onSubmit={submit}>
        {error ? <div className="error">{error}</div> : null}
        <div className="field">
          <label htmlFor="login-username">Username</label>
          <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary" disabled={busy || !username || !password}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="center muted small">
        New here? <Link href="/register">Make a character</Link>
      </p>
    </div>
  );
}
