'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeaderboardEntry } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

const TABS = [
  { key: 'level', label: 'Level', col: 'XP' },
  { key: 'wealth', label: 'Clams', col: 'Clams' },
  { key: 'reputation', label: 'Notoriety', col: 'Notoriety' },
] as const;

export default function LeaderboardsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'level' | 'wealth' | 'reputation'>('level');
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    setLoading(true);
    api
      .leaderboard(tab)
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tab]);

  const colLabel = TABS.find((t) => t.key === tab)?.col ?? 'Value';

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Leaderboards</h1>
        <div className="row wrap mb">
          {TABS.map((t) => (
            <button key={t.key} className={`btn inline ${tab === t.key ? 'btn-primary' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div className="card">
          {loading ? (
            <div className="spinner">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="empty">Nobody ranked yet. Go be someone.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Lvl</th>
                  <th>{colLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.characterId}>
                    <td>{r.rank}</td>
                    <td>{r.displayName}</td>
                    <td>{r.level}</td>
                    <td>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
