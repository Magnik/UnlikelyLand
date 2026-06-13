'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AiSettingsView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

export default function AdminPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [ai, setAi] = useState<AiSettingsView | null>(null);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [players, setPlayers] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [settings, aiLogs, playerList] = await Promise.all([api.admin.aiSettings(), api.admin.aiLogs(), api.admin.players()]);
    setAi(settings);
    setLogs(aiLogs);
    setPlayers(playerList);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    loadAll().catch((e) => {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) setForbidden(true);
      else setError(e instanceof ApiError ? e.message : 'Failed to load');
    });
  }, [router]);

  async function toggle(patch: Partial<{ enabled: boolean; forceFallback: boolean }>) {
    setBusy(true);
    try {
      const updated = await api.admin.updateAi(patch);
      setAi(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="error">Admins only. Nice try.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav showAdmin />
      <div className="container">
        <h1>Admin</h1>
        {error ? <div className="error">{error}</div> : null}

        <div className="card">
          <h2>AI gateway</h2>
          {ai ? (
            <>
              <div className="row between small mb">
                <span>Effective state</span>
                <span className={`badge ${ai.effectivelyOn ? 'risk-low' : 'risk-high'}`}>
                  {ai.effectivelyOn ? 'AI ON' : 'FALLBACK'}
                </span>
              </div>
              <div className="tiny muted mb">
                {ai.model} @ {ai.baseUrl} · timeout {ai.timeoutMs}ms
              </div>
              <div className="col">
                <button className="btn" disabled={busy} onClick={() => toggle({ enabled: !ai.enabled })}>
                  {ai.enabled ? 'Disable AI' : 'Enable AI'}
                </button>
                <button className="btn" disabled={busy} onClick={() => toggle({ forceFallback: !ai.forceFallback })}>
                  {ai.forceFallback ? 'Stop forcing fallback' : 'Force fallback mode'}
                </button>
              </div>
            </>
          ) : (
            <div className="spinner">Loading…</div>
          )}
        </div>

        <div className="card">
          <h2>Recent AI generations</h2>
          {logs.length === 0 ? (
            <div className="empty">No AI calls logged yet.</div>
          ) : (
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Outcome</th>
                    <th>ms</th>
                    <th>Model</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 20).map((l, i) => (
                    <tr key={i}>
                      <td>{String(l.createdAt ?? '').slice(11, 19)}</td>
                      <td>{String(l.outcome)}</td>
                      <td>{String(l.latencyMs)}</td>
                      <td>{String(l.model)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Players</h2>
          {players.length === 0 ? (
            <div className="empty">No players yet.</div>
          ) : (
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Lvl</th>
                    <th>Clams</th>
                    <th>Deaths</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={i}>
                      <td>{String(p.displayName)}</td>
                      <td>{String(p.level)}</td>
                      <td>{String(p.normalMoney)}</td>
                      <td>{String(p.deathCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
