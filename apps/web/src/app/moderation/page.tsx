'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  ModChatMessageView,
  ModeratedUserView,
  ModerationActionView,
  ModerationStatsView,
  ReportView,
} from '@unlikelyland/contracts';
import { REPORT_REASON_LABEL } from '@unlikelyland/contracts';
import { api, ApiError, clearToken, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

type Role = 'player' | 'moderator' | 'admin';

function reasonLabel(reason: string): string {
  return (REPORT_REASON_LABEL as Record<string, string>)[reason] ?? reason;
}

export default function ModerationPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stats, setStats] = useState<ModerationStatsView | null>(null);
  const [reports, setReports] = useState<ReportView[]>([]);
  const [chat, setChat] = useState<ModChatMessageView[]>([]);
  const [audit, setAudit] = useState<ModerationActionView[]>([]);

  // Admin-only user lookup.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ModeratedUserView[]>([]);
  const [searched, setSearched] = useState(false);

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        router.replace('/login');
        return true;
      }
      return false;
    },
    [router],
  );

  const refresh = useCallback(async () => {
    const [s, r, c, a] = await Promise.all([
      api.moderation.stats(),
      api.moderation.reports('open'),
      api.moderation.chat(),
      api.moderation.audit(),
    ]);
    setStats(s);
    setReports(r);
    setChat(c);
    setAudit(a);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const me = await api.me();
        setRole(me.role);
        if (me.role === 'player') return;
        await refresh();
      } catch (e) {
        if (handleAuthError(e)) return;
        setError(e instanceof ApiError ? e.message : 'Failed to load moderation console.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router, refresh, handleAuthError]);

  // Run a moderation action, surface errors, then refetch the queues.
  async function act(fn: () => Promise<unknown>, okMessage?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
      if (okMessage) setNotice(okMessage);
    } catch (e) {
      if (handleAuthError(e)) return;
      setError(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  // Admin user search is independent of the main queues.
  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const rows = await api.moderation.searchUsers(q);
      setResults(rows);
      setSearched(true);
    } catch (e) {
      if (handleAuthError(e)) return;
      setError(e instanceof ApiError ? e.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }

  // After an admin action against a user, refresh both the search results and queues.
  async function adminAct(fn: () => Promise<unknown>, okMessage?: string) {
    await act(fn, okMessage);
    if (query.trim()) {
      try {
        const rows = await api.moderation.searchUsers(query.trim());
        setResults(rows);
      } catch {
        /* leave stale results; the main error banner already covers failures */
      }
    }
  }

  function muteAuthor(characterId: string) {
    const raw = window.prompt('Mute for how many minutes?', '60');
    if (raw === null) return;
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError('Enter a positive number of minutes.');
      return;
    }
    const reason = window.prompt('Reason for the mute (optional):', '') ?? undefined;
    void act(() => api.moderation.mute(characterId, minutes, reason || undefined), 'Player muted.');
  }

  function warnAuthor(characterId: string) {
    const reason = window.prompt('Warning reason:', '');
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A warning needs a reason.');
      return;
    }
    void act(() => api.moderation.warn(characterId, reason.trim()), 'Warning recorded.');
  }

  function resolveReport(id: string, status: 'actioned' | 'dismissed') {
    const verb = status === 'actioned' ? 'actioned' : 'dismissed';
    if (!window.confirm(`Mark this report as ${verb}?`)) return;
    const note = window.prompt('Resolution note (optional):', '') ?? undefined;
    void act(() => api.moderation.resolveReport(id, status, note || undefined), `Report ${verb}.`);
  }

  function banUser(u: ModeratedUserView) {
    const reason = window.prompt(`Ban ${u.displayName}? Reason:`, '');
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A ban needs a reason.');
      return;
    }
    void adminAct(() => api.moderation.ban(u.characterId, reason.trim()), `${u.displayName} banned.`);
  }

  function unbanUser(u: ModeratedUserView) {
    if (!window.confirm(`Lift the ban on ${u.displayName}?`)) return;
    void adminAct(() => api.moderation.unban(u.characterId), `${u.displayName} unbanned.`);
  }

  function setUserRole(u: ModeratedUserView, nextRole: 'moderator' | 'player') {
    const label = nextRole === 'moderator' ? 'Grant moderator to' : 'Revoke moderator from';
    if (!window.confirm(`${label} ${u.displayName}?`)) return;
    void adminAct(
      () => api.moderation.setRole(u.characterId, nextRole),
      nextRole === 'moderator' ? `${u.displayName} is now a moderator.` : `${u.displayName} is now a player.`,
    );
  }

  if (loading) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Opening the moderation console…</div>
        </div>
      </>
    );
  }

  if (role === 'player') {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="error">Moderators only.</div>
          <Link className="btn" href="/play">
            Back to the game
          </Link>
        </div>
      </>
    );
  }

  const isAdmin = role === 'admin';

  return (
    <>
      <TopNav showAdmin={isAdmin} />
      <div className="container">
        <div className="row between mb">
          <h1 style={{ margin: 0 }}>Moderation</h1>
          <span className="badge">{role}</span>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {notice ? <div className="notice">{notice}</div> : null}

        {/* 1) Stats */}
        {stats ? (
          <div className="card">
            <h2>Overview</h2>
            <div className="stat-grid">
              <div className="stat">
                <b>{stats.openReports}</b>
                <span className="tiny muted">Open reports</span>
              </div>
              <div className="stat">
                <b>{stats.hiddenMessages}</b>
                <span className="tiny muted">Hidden messages</span>
              </div>
              <div className="stat">
                <b>{stats.mutedPlayers}</b>
                <span className="tiny muted">Muted players</span>
              </div>
              <div className="stat">
                <b>{stats.bannedPlayers}</b>
                <span className="tiny muted">Banned players</span>
              </div>
              <div className="stat">
                <b>{stats.actionsLast7d}</b>
                <span className="tiny muted">Actions (7d)</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* 2) Reports queue */}
        <div className="card">
          <h2>Open reports</h2>
          {reports.length === 0 ? (
            <div className="empty">No open reports. The realm is briefly civil.</div>
          ) : (
            <div className="col">
              {reports.map((rep) => {
                const isMail = rep.targetType === 'mail';
                const msgType: 'chat' | 'mail' = isMail ? 'mail' : 'chat';
                return (
                  <div
                    key={rep.id}
                    className="stat"
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
                  >
                    <div className="row between wrap">
                      <b>{reasonLabel(rep.reason)}</b>
                      <span className="badge">{rep.targetType}</span>
                    </div>
                    <span className="tiny muted">
                      Reported by {rep.reporterDisplayName}
                      {rep.reportCount > 1 ? ` · ${rep.reportCount} reports` : ''} ·{' '}
                      {new Date(rep.createdAt).toLocaleString()}
                    </span>
                    {rep.targetDisplayName ? (
                      <span className="tiny">
                        Target:{' '}
                        {rep.targetCharacterId ? (
                          <Link href={`/u/${rep.targetCharacterId}`}>{rep.targetDisplayName}</Link>
                        ) : (
                          rep.targetDisplayName
                        )}
                      </span>
                    ) : null}
                    {rep.note ? <span className="tiny muted">Note: {rep.note}</span> : null}
                    {rep.messageBody ? (
                      <div className="notice" style={{ whiteSpace: 'pre-wrap' }}>
                        “{rep.messageBody}”
                        {rep.messageStatus ? (
                          <div className="tiny muted">status: {rep.messageStatus}</div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="row wrap" style={{ gap: 6 }}>
                      {rep.targetMessageId ? (
                        <>
                          <button
                            className="btn inline"
                            disabled={busy}
                            onClick={() => act(() => api.moderation.hide(rep.targetMessageId as string, msgType), 'Message hidden.')}
                          >
                            Hide
                          </button>
                          <button
                            className="btn inline btn-danger"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm('Delete this message?')) return;
                              void act(() => api.moderation.remove(rep.targetMessageId as string, msgType), 'Message deleted.');
                            }}
                          >
                            Delete
                          </button>
                          <button
                            className="btn inline"
                            disabled={busy}
                            onClick={() => act(() => api.moderation.restore(rep.targetMessageId as string, msgType), 'Message restored.')}
                          >
                            Restore
                          </button>
                        </>
                      ) : null}
                      {rep.targetCharacterId ? (
                        <>
                          <button className="btn inline" disabled={busy} onClick={() => muteAuthor(rep.targetCharacterId as string)}>
                            Mute
                          </button>
                          <button className="btn inline" disabled={busy} onClick={() => warnAuthor(rep.targetCharacterId as string)}>
                            Warn
                          </button>
                        </>
                      ) : null}
                      <button className="btn inline btn-primary" disabled={busy} onClick={() => resolveReport(rep.id, 'actioned')}>
                        Resolve
                      </button>
                      <button className="btn inline btn-ghost" disabled={busy} onClick={() => resolveReport(rep.id, 'dismissed')}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3) Recent chat moderation */}
        <div className="card">
          <h2>Recent chat</h2>
          {chat.length === 0 ? (
            <div className="empty">No recent chat to review.</div>
          ) : (
            <div className="col">
              {chat.map((m) => (
                <div key={m.id} className="stat" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="row between wrap">
                    <b>
                      <Link href={`/u/${m.characterId}`}>{m.displayName}</Link>
                    </b>
                    <span className="badge">
                      {m.moderationStatus}
                      {m.reportCount > 0 ? ` · ${m.reportCount}` : ''}
                    </span>
                  </div>
                  <span className="tiny" style={{ whiteSpace: 'pre-wrap' }}>
                    {m.body}
                  </span>
                  <span className="tiny muted">{new Date(m.createdAt).toLocaleString()}</span>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <button
                      className="btn inline"
                      disabled={busy || m.moderationStatus !== 'visible'}
                      onClick={() => act(() => api.moderation.hide(m.id, 'chat'), 'Message hidden.')}
                    >
                      Hide
                    </button>
                    <button
                      className="btn inline"
                      disabled={busy || m.moderationStatus === 'visible'}
                      onClick={() => act(() => api.moderation.restore(m.id, 'chat'), 'Message restored.')}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4) Audit trail */}
        <div className="card">
          <h2>Audit trail</h2>
          {audit.length === 0 ? (
            <div className="empty">No recorded actions yet.</div>
          ) : (
            <div className="col">
              {audit.map((row) => (
                <div key={row.id} className="stat" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div className="row between wrap">
                    <b>{row.actionType}</b>
                    <span className="tiny muted">{new Date(row.createdAt).toLocaleString()}</span>
                  </div>
                  <span className="tiny">
                    {row.moderatorName}
                    {row.targetDisplayName ? ` → ${row.targetDisplayName}` : ''}
                  </span>
                  {row.reason ? <span className="tiny muted">{row.reason}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin-only: user lookup */}
        {isAdmin ? (
          <div className="card">
            <h2>User lookup</h2>
            <div className="field">
              <label>Search players</label>
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="grow"
                  value={query}
                  placeholder="Name or partial name…"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runSearch();
                  }}
                />
                <button className="btn btn-primary" disabled={busy || !query.trim()} onClick={() => runSearch()}>
                  Search
                </button>
              </div>
            </div>
            {searched && results.length === 0 ? (
              <div className="empty">No players matched.</div>
            ) : (
              <div className="col">
                {results.map((u) => (
                  <div key={u.characterId} className="stat" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <div className="row between wrap">
                      <b>
                        <Link href={`/u/${u.characterId}`}>{u.displayName}</Link>
                      </b>
                      <span className="badge">{u.role}</span>
                    </div>
                    <span className="tiny muted">
                      Lv {u.level} · {u.warningCount} warning(s) · {u.reportsAgainst} report(s)
                      {u.banned ? ' · BANNED' : ''}
                      {u.mutedUntil ? ` · muted until ${new Date(u.mutedUntil).toLocaleString()}` : ''}
                    </span>
                    {u.banned && u.bannedReason ? <span className="tiny muted">Ban reason: {u.bannedReason}</span> : null}
                    <div className="row wrap" style={{ gap: 6 }}>
                      {u.banned ? (
                        <button className="btn inline" disabled={busy} onClick={() => unbanUser(u)}>
                          Unban
                        </button>
                      ) : (
                        <button className="btn inline btn-danger" disabled={busy} onClick={() => banUser(u)}>
                          Ban
                        </button>
                      )}
                      {u.role === 'moderator' ? (
                        <button className="btn inline" disabled={busy} onClick={() => setUserRole(u, 'player')}>
                          Revoke mod
                        </button>
                      ) : u.role === 'player' ? (
                        <button className="btn inline" disabled={busy} onClick={() => setUserRole(u, 'moderator')}>
                          Grant mod
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
