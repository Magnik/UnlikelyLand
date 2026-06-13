'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CURRENCY_LABEL,
  type AchievementView,
  type CharacterView,
  type EscapeStatusView,
  type InventoryItemView,
} from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';
import { StatGrid } from '@/components/stat-grid';

export default function ProfilePage() {
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterView | null>(null);
  const [inventory, setInventory] = useState<InventoryItemView[]>([]);
  const [achievements, setAchievements] = useState<AchievementView[]>([]);
  const [escape, setEscape] = useState<EscapeStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [c, inv, ach, esc] = await Promise.all([
      api.character(),
      api.inventory(),
      api.achievements(),
      api.prestige.status(),
    ]);
    setCharacter(c);
    setInventory(inv);
    setAchievements(ach);
    setEscape(esc);
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

  async function doEscape() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.prestige.escape();
      setNotice(`You escaped! Run #${r.escapeCount}. You start over a little stronger.`);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Escape failed');
    } finally {
      setBusy(false);
    }
  }

  if (!character) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Loading…</div>
        </div>
      </>
    );
  }

  const unlocked = achievements.filter((a) => a.unlockedAt);

  return (
    <>
      <TopNav />
      <div className="container">
        <div className="card">
          <h1 style={{ marginBottom: 2 }}>{character.displayName}</h1>
          <div className="tiny muted mb">
            Level {character.level} · {character.regionSet.name}
          </div>
          {character.bio ? <p className="small">{character.bio}</p> : <p className="small muted">No bio yet.</p>}
          <div className="row wrap mt">
            <span className="reward-chip">{character.currencies.normal} {CURRENCY_LABEL.normal}</span>
            <span className="reward-chip">{character.currencies.crafting} {CURRENCY_LABEL.crafting}</span>
            <span className="reward-chip">{character.currencies.reputation} {CURRENCY_LABEL.reputation}</span>
            <span className="reward-chip">{character.currencies.premium} {CURRENCY_LABEL.premium}</span>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {notice ? <div className="notice">{notice}</div> : null}

        {escape ? (
          <div className="card">
            <h2>Escape the island</h2>
            {escape.eligible ? (
              <>
                <p className="small">
                  You&apos;re ready to attempt escape. This ends your run and restarts you with a permanent +1 to every
                  stat{escape.escapeCount > 0 ? ` (legacy level ${escape.escapeCount})` : ''} and Escape Tokens.
                </p>
                <button className="btn btn-primary" disabled={busy} onClick={doEscape}>
                  Attempt escape (run #{escape.escapeCount + 1})
                </button>
              </>
            ) : (
              <p className="small muted">
                Reach level {escape.requiredLevel} to attempt escape. You&apos;re level {escape.level}.
                {escape.escapeCount > 0 ? ` Escapes so far: ${escape.escapeCount}.` : ''}
              </p>
            )}
          </div>
        ) : null}

        <div className="card">
          <h2>Stats</h2>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Equipped gear adds to these during expeditions.
          </p>
          <StatGrid stats={character.stats} />
        </div>

        <div className="card">
          <h2>Inventory</h2>
          {inventory.length === 0 ? (
            <div className="empty">Nothing yet. Go find some Useful Junk.</div>
          ) : (
            <div className="col">
              {inventory.map((i) => {
                const mods = Object.entries(i.statModifiers)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `+${v} ${k}`)
                  .join(', ');
                return (
                  <div className="stat" key={i.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <div className="row between">
                      <b>
                        {i.name}
                        {i.quantity > 1 ? ` ×${i.quantity}` : ''}
                        {i.equipped ? ' · equipped' : ''}
                      </b>
                      <span className="badge">
                        {i.rarity} · {i.slot}
                      </span>
                    </div>
                    <span className="tiny muted">
                      {i.description}
                      {mods ? ` (${mods})` : ''}
                    </span>
                    <div className="row">
                      {i.slot === 'consumable' ? (
                        <button className="btn inline" disabled={busy} onClick={() => act(() => api.useItem(i.id))}>
                          Use
                        </button>
                      ) : i.equipped ? (
                        <button className="btn inline" disabled={busy} onClick={() => act(() => api.unequip(i.id))}>
                          Unequip
                        </button>
                      ) : (
                        <button className="btn inline btn-primary" disabled={busy} onClick={() => act(() => api.equip(i.id))}>
                          Equip
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            Achievements <span className="tiny muted">({unlocked.length}/{achievements.length})</span>
          </h2>
          <div className="col">
            {achievements.map((a) => (
              <div key={a.key} className="stat" style={{ opacity: a.unlockedAt ? 1 : 0.5 }}>
                <span>
                  {a.unlockedAt ? '🏆' : '🔒'} {a.name} <span className="tiny muted">{a.description}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
