'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { PublicProfileView, ReportReason } from '@unlikelyland/contracts';
import { REPORT_REASONS, REPORT_REASON_LABEL } from '@unlikelyland/contracts';
import { api, ApiError, clearToken, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [profile, setProfile] = useState<PublicProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [reported, setReported] = useState(false);

  const load = useCallback(async () => {
    setNotFound(false);
    setError(null);
    try {
      const p = await api.publicProfile(id);
      setProfile(p);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        router.replace('/login');
        return;
      }
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
        setProfile(null);
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Failed to load profile');
    }
  }, [id, router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load().finally(() => setLoading(false));
  }, [router, load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
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

  async function submitReport() {
    setBusy(true);
    setError(null);
    try {
      await api.report({ targetType: 'profile', targetCharacterId: id, reason: reportReason });
      setReported(true);
      setReportOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit report');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Looking up this adventurer…</div>
        </div>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="empty">This player could not be found.</div>
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="error">{error ?? 'Failed to load profile'}</div>
        </div>
      </>
    );
  }

  const rel = profile.relationship;

  return (
    <>
      <TopNav />
      <div className="container">
        {error ? <div className="error">{error}</div> : null}

        <div className="card">
          <div className="row between wrap">
            <div className="col" style={{ gap: 2 }}>
              <h1 style={{ margin: 0 }}>{profile.displayName}</h1>
              {profile.title ? <span className="tiny muted">{profile.title}</span> : null}
            </div>
            <span className="badge">Lv {profile.level}</span>
          </div>

          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            <span className="reward-chip">{profile.regionSet.name}</span>
            {profile.guild ? (
              <Link href="/guilds" className="reward-chip">
                {profile.guild.name}
                {profile.guild.tag ? ` [${profile.guild.tag}]` : ''}
              </Link>
            ) : null}
          </div>

          <div className="tiny muted" style={{ marginTop: 8 }}>
            Joined {new Date(profile.joinedAt).toLocaleDateString()}
          </div>

          <p style={{ marginBottom: 0 }}>
            {profile.bio ? profile.bio : <span className="muted">No bio yet.</span>}
          </p>
        </div>

        {!rel.isSelf ? (
          <div className="card tight">
            <div className="row wrap" style={{ gap: 8 }}>
              {rel.isBlocked ? (
                <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api.social.unblock(id))}>
                  Unblock
                </button>
              ) : rel.isFriend ? (
                <>
                  <span className="reward-chip">Friends ✓</span>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api.social.remove(id))}>
                    Remove
                  </button>
                </>
              ) : rel.requestOutgoing ? (
                <button className="btn" disabled>
                  Request sent
                </button>
              ) : rel.requestIncoming ? (
                <span className="reward-chip">Wants to be friends</span>
              ) : (
                <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api.social.request(id))}>
                  Add Friend
                </button>
              )}

              <Link href="/mail" className="btn btn-ghost">
                Message
              </Link>

              {!rel.isBlocked ? (
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Block ${profile.displayName}? You will no longer see each other.`)) {
                      act(() => api.social.block(id));
                    }
                  }}
                >
                  Block
                </button>
              ) : null}

              {reported ? (
                <span className="reward-chip">Reported</span>
              ) : (
                <button className="btn btn-ghost" disabled={busy} onClick={() => setReportOpen((o) => !o)}>
                  Report
                </button>
              )}
            </div>

            {reportOpen && !reported ? (
              <div className="col" style={{ gap: 8, marginTop: 8 }}>
                <div className="field">
                  <label>Reason</label>
                  <select value={reportReason} onChange={(e) => setReportReason(e.target.value as ReportReason)}>
                    {REPORT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {REPORT_REASON_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary inline" disabled={busy} onClick={submitReport}>
                    Submit report
                  </button>
                  <button className="btn btn-ghost inline" disabled={busy} onClick={() => setReportOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="card">
          <h2>Reputation</h2>
          <div className="stat-grid">
            <div className="stat">
              <span className="muted">Combat</span>
              <b>{profile.statSummary.combat}</b>
            </div>
            <div className="stat">
              <span className="muted">Social</span>
              <b>{profile.statSummary.social}</b>
            </div>
            <div className="stat">
              <span className="muted">Victories</span>
              <b>{profile.combatVictories}</b>
            </div>
            <div className="stat">
              <span className="muted">Escapes</span>
              <b>{profile.escapeCount}</b>
            </div>
          </div>
          {profile.statSummary.topTrait ? (
            <div className="tiny muted" style={{ marginTop: 8 }}>
              Defining trait: {profile.statSummary.topTrait}
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2>Equipment</h2>
          {profile.equipment.length === 0 ? (
            <div className="empty">Nothing equipped.</div>
          ) : (
            <div className="row wrap" style={{ gap: 8 }}>
              {profile.equipment.map((e) => (
                <span key={e.slot} className={`badge rarity-${e.rarity}`}>
                  {e.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Achievements</h2>
          {profile.achievements.length === 0 ? (
            <div className="empty">No public achievements yet.</div>
          ) : (
            <div className="col">
              {profile.achievements.map((a) => (
                <div key={a.key} className="stat" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
                  <b>{a.name}</b>
                  <span className="tiny muted">{a.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Recent activity</h2>
          {profile.recentActivity.length === 0 ? (
            <div className="empty">Nothing to report lately.</div>
          ) : (
            <div className="col">
              {profile.recentActivity.map((ev) => (
                <div key={ev.id} className="row between wrap" style={{ gap: 8 }}>
                  <span>{ev.title}</span>
                  <span className="tiny muted">{new Date(ev.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
