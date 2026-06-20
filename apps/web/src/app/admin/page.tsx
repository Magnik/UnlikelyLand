'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AiSettingsView, ItemConceptView, ItemDefinitionView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

function modsText(mods: Record<string, number>): string {
  const parts = Object.entries(mods)
    .filter(([, v]) => v)
    .map(([k, v]) => `+${v} ${k}`);
  return parts.length ? parts.join(', ') : 'no stat modifiers';
}

export default function AdminPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [ai, setAi] = useState<AiSettingsView | null>(null);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [players, setPlayers] = useState<Array<Record<string, unknown>>>([]);
  const [concepts, setConcepts] = useState<ItemConceptView[]>([]);
  const [catalog, setCatalog] = useState<ItemDefinitionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [settings, aiLogs, playerList, conceptList, items] = await Promise.all([
      api.admin.aiSettings(),
      api.admin.aiLogs(),
      api.admin.players(),
      api.admin.itemConcepts(),
      api.admin.items(),
    ]);
    setAi(settings);
    setLogs(aiLogs);
    setPlayers(playerList);
    setConcepts(conceptList);
    setCatalog(items);
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
      setAi(await api.admin.updateAi(patch));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  async function reviewAction(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      const [conceptList, items] = await Promise.all([api.admin.itemConcepts(), api.admin.items()]);
      setConcepts(conceptList);
      setCatalog(items);
      setNotice(label);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
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

  const pending = concepts.filter((c) => c.status === 'pending');

  return (
    <>
      <TopNav showAdmin />
      <div className="container">
        <h1>Admin</h1>
        {error ? <div className="error">{error}</div> : null}
        {notice ? <div className="notice">{notice}</div> : null}

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
          <h2>
            Pending item concepts <span className="tiny muted">({pending.length})</span>
          </h2>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            AI proposes concepts; the server moderates &amp; generates balanced stats. Low-power common/uncommon that pass
            every rule auto-approve. Everything else waits here.
          </p>
          {pending.length === 0 ? (
            <div className="empty">No concepts awaiting review.</div>
          ) : (
            <div className="col">
              {pending.map((c) => (
                <div className="stat item-row" key={c.id}>
                  <div className="row between">
                    <b>{c.name}</b>
                    <span className={`badge rar-${c.intendedRarity}`}>
                      {c.intendedRarity} · {c.intendedSlot}
                    </span>
                  </div>
                  <span className="tiny muted">{c.description}</span>
                  <span className="tiny">
                    Would mint: <b>{modsText(c.validation.statModifiers as Record<string, number>)}</b> (budget{' '}
                    {c.validation.powerBudget}).{' '}
                    {c.validation.valid ? (
                      <span className="delta-pos">passes validation</span>
                    ) : (
                      <span className="delta-neg">issues: {c.validation.issues.join('; ')}</span>
                    )}
                  </span>
                  <div className="row">
                    <button
                      className="btn inline btn-primary"
                      disabled={busy || !c.validation.valid}
                      onClick={() => reviewAction(`Approved ${c.name}.`, () => api.admin.approveConcept(c.id))}
                    >
                      Approve
                    </button>
                    <button
                      className="btn inline"
                      disabled={busy}
                      onClick={() => reviewAction(`Rejected ${c.name}.`, () => api.admin.rejectConcept(c.id, 'Not a fit'))}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            Item catalog <span className="tiny muted">({catalog.length})</span>
          </h2>
          {catalog.length === 0 ? (
            <div className="empty">No items yet.</div>
          ) : (
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slot</th>
                    <th>Rarity</th>
                    <th>Modifiers</th>
                    <th>Src</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.slice(0, 60).map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>{i.slot}</td>
                      <td>{i.rarity}</td>
                      <td>{modsText(i.statModifiers as Record<string, number>)}</td>
                      <td>{i.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
