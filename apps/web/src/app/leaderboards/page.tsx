'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { LeaderboardEntry, LeaderboardType, LeaderboardView } from '@unlikelyland/contracts';
import { LEADERBOARD_META } from '@unlikelyland/contracts';
import { api, ApiError, getToken, clearToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

const TABS: LeaderboardType[] = ['level', 'wealth', 'reputation', 'victories', 'achievements'];

function EntryRow({ entry, unit, pinned }: { entry: LeaderboardEntry; unit: string; pinned?: boolean }) {
  return (
    <tr className={entry.mine && !pinned ? 'notice' : undefined} style={entry.mine ? { fontWeight: 600 } : undefined}>
      <td>{pinned ? 'You' : `#${entry.rank}`}</td>
      <td>
        <Link href={`/u/${entry.characterId}`}>{entry.displayName}</Link>
        {entry.guildTag ? <span className="badge" style={{ marginLeft: 6 }}>[{entry.guildTag}]</span> : null}
      </td>
      <td>{entry.level}</td>
      <td>
        {entry.value} <span className="tiny muted">{unit}</span>
      </td>
    </tr>
  );
}

export default function LeaderboardsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<LeaderboardType>('level');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<LeaderboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regionOnly, setRegionOnly] = useState(false);
  const [myRegion, setMyRegion] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    // Fetch the viewer's region set once, to power the "My region" filter.
    api
      .character()
      .then((c) => setMyRegion({ id: c.regionSet.id, name: c.regionSet.name }))
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .leaderboard(tab, page, regionOnly && myRegion ? myRegion.id : undefined)
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        setError(e instanceof ApiError ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, page, router, regionOnly, myRegion]);

  function selectTab(next: LeaderboardType) {
    if (next === tab) return;
    setTab(next);
    setPage(1);
  }

  const unit = view?.unit ?? LEADERBOARD_META[tab].unit;
  const entries = view?.entries ?? [];
  // Only pin "You" if the viewer's own row is not already visible on this page.
  const meOnPage = view?.me ? entries.some((e) => e.mine) : false;
  const showPinnedMe = !!view?.me && !meOnPage;

  const total = view?.total ?? 0;
  const pageSize = view?.pageSize ?? 0;
  const curPage = view?.page ?? page;
  const hasPrev = curPage > 1;
  const hasNext = pageSize > 0 && curPage * pageSize < total;

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Leaderboards</h1>
        <div className="row wrap mb">
          {TABS.map((t) => (
            <button
              key={t}
              className={`btn inline ${tab === t ? 'btn-primary' : ''}`}
              onClick={() => selectTab(t)}
            >
              {LEADERBOARD_META[t].label}
            </button>
          ))}
        </div>
        {myRegion ? (
          <div className="row wrap mb" style={{ gap: 6, alignItems: 'center' }}>
            <button
              className={`btn inline ${regionOnly ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setPage(1);
                setRegionOnly((v) => !v);
              }}
            >
              {regionOnly ? `${myRegion.name} only` : 'My region only'}
            </button>
          </div>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        <div className="card">
          {loading ? (
            <div className="spinner">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="empty">Nobody ranked yet. Go be someone.</div>
          ) : (
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Lvl</th>
                    <th>{LEADERBOARD_META[tab].label}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <EntryRow key={e.characterId} entry={e} unit={unit} />
                  ))}
                  {showPinnedMe && view?.me ? (
                    <EntryRow entry={view.me} unit={unit} pinned />
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!loading && entries.length > 0 ? (
          <div className="row between">
            <button className="btn inline" disabled={!hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </button>
            <span className="tiny muted">Page {curPage}</span>
            <button className="btn inline" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
