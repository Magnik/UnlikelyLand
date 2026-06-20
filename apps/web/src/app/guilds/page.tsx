'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { GuildSummary, GuildView } from '@unlikelyland/contracts';
import { api, ApiError, clearToken, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

const TAG_RE = /^[A-Z0-9]{2,5}$/;

export default function GuildsPage() {
  const router = useRouter();
  const [mine, setMine] = useState<GuildView | null>(null);
  const [list, setList] = useState<GuildSummary[]>([]);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [desc, setDesc] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editing, setEditing] = useState(false);
  const [bankAmount, setBankAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (q?: string) => {
    const [m, l] = await Promise.all([api.guilds.mine(), api.guilds.list(q)]);
    setMine(m);
    setList(l);
    if (m) {
      setEditDesc(m.description ?? '');
      setEditTag(m.tag ?? '');
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    refresh()
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        setError(e instanceof ApiError ? e.message : 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [router, refresh]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh(query.trim() || undefined);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        router.replace('/login');
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    setBusy(true);
    setError(null);
    try {
      const l = await api.guilds.list(query.trim() || undefined);
      setList(l);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Search failed');
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

  const tagInvalid = tag.length > 0 && !TAG_RE.test(tag);
  const editTagInvalid = editTag.length > 0 && !TAG_RE.test(editTag);

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Guilds</h1>
        {error ? <div className="error">{error}</div> : null}

        {mine ? (
          <div className="card">
            <div className="row between">
              <h2 style={{ margin: 0 }}>
                {mine.tag ? <span className="badge">[{mine.tag}]</span> : null} {mine.name}
              </h2>
              <span className="badge">{mine.memberCount} members</span>
            </div>
            {mine.description ? <p className="muted small">{mine.description}</p> : null}

            <div className="row wrap" style={{ gap: 6 }}>
              <span className="badge">Level {mine.level}</span>
              <span className="badge">{mine.bankBalance} Oddments banked</span>
              <span className="tiny muted">{mine.xp} guild XP</span>
            </div>
            <div className="row wrap mt" style={{ gap: 6, alignItems: 'center' }}>
              <input
                style={{ width: 110 }}
                type="number"
                min={1}
                value={bankAmount}
                placeholder="Oddments"
                onChange={(e) => setBankAmount(e.target.value)}
              />
              <button
                className="btn inline"
                disabled={busy || !(Number(bankAmount) >= 1)}
                onClick={() => act(async () => { await api.guilds.deposit(Number(bankAmount)); setBankAmount(''); })}
              >
                Deposit
              </button>
              {mine.myRole === 'owner' || mine.myRole === 'officer' ? (
                <button
                  className="btn inline btn-ghost"
                  disabled={busy || !(Number(bankAmount) >= 1)}
                  onClick={() => act(async () => { await api.guilds.withdraw(Number(bankAmount)); setBankAmount(''); })}
                >
                  Withdraw
                </button>
              ) : null}
            </div>

            <div className="col mt">
              {mine.members.map((m) => {
                const isOwner = m.role === 'owner';
                const canManage = mine.myRole === 'owner';
                const canKick =
                  (mine.myRole === 'owner' || mine.myRole === 'officer') &&
                  !isOwner &&
                  m.characterId !== mine.ownerCharacterId;
                return (
                  <div
                    className="stat"
                    key={m.characterId}
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
                  >
                    <div className="row between">
                      <span>
                        <Link href={`/u/${m.characterId}`}>{m.displayName}</Link>{' '}
                        <span className="tiny muted">lvl {m.level}</span>
                      </span>
                      <span className="badge">{m.role}</span>
                    </div>
                    {canManage && !isOwner ? (
                      <div className="row wrap" style={{ gap: 6 }}>
                        {m.role === 'member' ? (
                          <button
                            className="btn inline"
                            disabled={busy}
                            onClick={() => act(() => api.guilds.promote(m.characterId))}
                          >
                            Promote
                          </button>
                        ) : null}
                        {m.role === 'officer' ? (
                          <button
                            className="btn inline"
                            disabled={busy}
                            onClick={() => act(() => api.guilds.demote(m.characterId))}
                          >
                            Demote
                          </button>
                        ) : null}
                        <button
                          className="btn inline btn-danger"
                          disabled={busy}
                          onClick={() => act(() => api.guilds.kick(m.characterId))}
                        >
                          Kick
                        </button>
                        <button
                          className="btn inline btn-ghost"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Transfer ownership of ${mine.name} to ${m.displayName}? You will become an officer.`,
                              )
                            ) {
                              act(() => api.guilds.transfer(m.characterId));
                            }
                          }}
                        >
                          Make owner
                        </button>
                      </div>
                    ) : canKick ? (
                      <div className="row wrap" style={{ gap: 6 }}>
                        <button
                          className="btn inline btn-danger"
                          disabled={busy}
                          onClick={() => act(() => api.guilds.kick(m.characterId))}
                        >
                          Kick
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {mine.myRole === 'owner' ? (
              <div className="mt">
                {editing ? (
                  <div className="col">
                    <div className="field">
                      <label>Tag (2–5 letters/numbers, uppercase)</label>
                      <input
                        value={editTag}
                        maxLength={5}
                        placeholder="e.g. ULND"
                        onChange={(e) => setEditTag(e.target.value.toUpperCase())}
                      />
                      {editTagInvalid ? <span className="tiny error">Tag must be 2–5 of A–Z or 0–9.</span> : null}
                    </div>
                    <div className="field">
                      <label>Description</label>
                      <textarea
                        rows={2}
                        maxLength={300}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                      />
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button
                        className="btn btn-primary inline"
                        disabled={busy || editTagInvalid}
                        onClick={() =>
                          act(async () => {
                            await api.guilds.update({
                              description: editDesc,
                              tag: editTag.trim() === '' ? null : editTag.trim(),
                            });
                            setEditing(false);
                          })
                        }
                      >
                        Save
                      </button>
                      <button
                        className="btn btn-ghost inline"
                        disabled={busy}
                        onClick={() => {
                          setEditing(false);
                          setEditDesc(mine.description ?? '');
                          setEditTag(mine.tag ?? '');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-ghost inline" disabled={busy} onClick={() => setEditing(true)}>
                    Edit description / tag
                  </button>
                )}
              </div>
            ) : null}

            {mine.myRole === 'owner' && mine.memberCount > 1 ? (
              <div className="notice mt">
                As owner you must transfer ownership or remove the other members before you can leave.
              </div>
            ) : null}
            <button className="btn btn-danger mt" disabled={busy} onClick={() => act(() => api.guilds.leave())}>
              Leave guild
            </button>
          </div>
        ) : (
          <div className="card">
            <h2>Start a guild</h2>
            <div className="field">
              <label>Name (3–32 characters)</label>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
            </div>
            <div className="field">
              <label>Tag (optional, 2–5 letters/numbers)</label>
              <input
                value={tag}
                maxLength={5}
                placeholder="e.g. ULND"
                onChange={(e) => setTag(e.target.value.toUpperCase())}
              />
              {tagInvalid ? <span className="tiny error">Tag must be 2–5 of A–Z or 0–9.</span> : null}
            </div>
            <div className="field">
              <label>Description (optional)</label>
              <textarea rows={2} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || name.trim().length < 3 || tagInvalid}
              onClick={() =>
                act(() =>
                  api.guilds.create({
                    name: name.trim(),
                    tag: tag.trim() === '' ? undefined : tag.trim(),
                    description: desc || undefined,
                  }),
                )
              }
            >
              Found guild
            </button>
          </div>
        )}

        <div className="card">
          <h2>Browse guilds</h2>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="grow"
              value={query}
              placeholder="Search by name or tag…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch();
              }}
            />
            <button className="btn inline" disabled={busy} onClick={runSearch}>
              Search
            </button>
          </div>
          {list.length === 0 ? (
            <div className="empty mt">No guilds found. Be the first to organise this chaos.</div>
          ) : (
            <div className="col mt">
              {list.map((g) => (
                <div key={g.id} className="stat" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="row between">
                    <b>
                      {g.tag ? <span className="badge">[{g.tag}]</span> : null} {g.name}
                    </b>
                    <span className="badge">{g.memberCount}</span>
                  </div>
                  {g.description ? <span className="tiny muted">{g.description}</span> : null}
                  {mine ? (
                    g.id === mine.id ? (
                      <span className="tiny muted">(your guild)</span>
                    ) : (
                      <span className="tiny muted">Leave your guild to join another.</span>
                    )
                  ) : (
                    <button className="btn inline" disabled={busy} onClick={() => act(() => api.guilds.join(g.id))}>
                      Join
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
