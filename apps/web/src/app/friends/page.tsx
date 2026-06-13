'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DirectoryEntry, SocialView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

export default function FriendsPage() {
  const router = useRouter();
  const [data, setData] = useState<SocialView | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DirectoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setData(await api.social.overview());
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    refresh().catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router, refresh]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setResults(await api.social.search(q));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    }
  }

  if (!data) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Loading…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Friends</h1>
        {error ? <div className="error">{error}</div> : null}

        <form className="card" onSubmit={doSearch}>
          <h2>Find players</h2>
          <div className="row">
            <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name (2+ chars)" />
            <button className="btn inline">Search</button>
          </div>
          {results.length > 0 ? (
            <div className="col mt">
              {results.map((r) => (
                <div key={r.characterId} className="stat">
                  <span>
                    {r.displayName} <span className="tiny muted">lvl {r.level}</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn inline" disabled={busy} onClick={() => act(() => api.social.request(r.characterId))}>
                      Add
                    </button>
                    <button className="btn inline" disabled={busy} onClick={() => act(() => api.social.block(r.characterId))}>
                      Block
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </form>

        {data.incoming.length > 0 ? (
          <div className="card">
            <h2>Requests</h2>
            <div className="col">
              {data.incoming.map((r) => (
                <div key={r.id} className="stat">
                  <span>{r.displayName}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn inline btn-primary" disabled={busy} onClick={() => act(() => api.social.accept(r.id))}>
                      Accept
                    </button>
                    <button className="btn inline" disabled={busy} onClick={() => act(() => api.social.reject(r.id))}>
                      Reject
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card">
          <h2>Your friends</h2>
          {data.friends.length === 0 ? (
            <div className="empty">No friends yet. The island is lonely.</div>
          ) : (
            <div className="col">
              {data.friends.map((f) => (
                <div key={f.characterId} className="stat">
                  <span>
                    {f.displayName} <span className="tiny muted">lvl {f.level}</span>
                  </span>
                  <button className="btn inline" disabled={busy} onClick={() => act(() => api.social.remove(f.characterId))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {data.outgoing.length > 0 ? (
          <div className="card">
            <h3>Pending sent</h3>
            <div className="col">
              {data.outgoing.map((r) => (
                <div key={r.id} className="tiny muted">
                  {r.displayName} — awaiting reply
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {data.blocked.length > 0 ? (
          <div className="card">
            <h2>Blocked</h2>
            <div className="col">
              {data.blocked.map((b) => (
                <div key={b.characterId} className="stat">
                  <span>{b.displayName}</span>
                  <button className="btn inline" disabled={busy} onClick={() => act(() => api.social.unblock(b.characterId))}>
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
