'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GuildSummary, GuildView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

export default function GuildsPage() {
  const router = useRouter();
  const [mine, setMine] = useState<GuildView | null>(null);
  const [list, setList] = useState<GuildSummary[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [m, l] = await Promise.all([api.guilds.mine(), api.guilds.list()]);
    setMine(m);
    setList(l);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    refresh()
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
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

  if (loading) {
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
        <h1>Guilds</h1>
        {error ? <div className="error">{error}</div> : null}

        {mine ? (
          <div className="card">
            <div className="row between">
              <h2 style={{ margin: 0 }}>{mine.name}</h2>
              <span className="badge">{mine.memberCount} members</span>
            </div>
            {mine.description ? <p className="muted small">{mine.description}</p> : null}
            <div className="col mt">
              {mine.members.map((m) => (
                <div className="stat" key={m.characterId}>
                  <span>
                    {m.displayName} <span className="tiny muted">lvl {m.level}</span>
                  </span>
                  <span className="badge">{m.role}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-danger mt" disabled={busy} onClick={() => act(() => api.guilds.leave())}>
              Leave guild
            </button>
          </div>
        ) : (
          <>
            <div className="card">
              <h2>Start a guild</h2>
              <div className="field">
                <label>Name (3–32 characters)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
              </div>
              <div className="field">
                <label>Description (optional)</label>
                <textarea rows={2} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <button
                className="btn btn-primary"
                disabled={busy || name.trim().length < 3}
                onClick={() => act(() => api.guilds.create({ name: name.trim(), description: desc || undefined }))}
              >
                Found guild
              </button>
            </div>
            <div className="card">
              <h2>Browse guilds</h2>
              {list.length === 0 ? (
                <div className="empty">No guilds yet. Be the first to organise this chaos.</div>
              ) : (
                <div className="col">
                  {list.map((g) => (
                    <div key={g.id} className="stat" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                      <div className="row between">
                        <b>{g.name}</b>
                        <span className="badge">{g.memberCount}</span>
                      </div>
                      {g.description ? <span className="tiny muted">{g.description}</span> : null}
                      <button className="btn inline" disabled={busy} onClick={() => act(() => api.guilds.join(g.id))}>
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
