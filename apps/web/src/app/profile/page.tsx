'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CURRENCY_LABEL, type CharacterView, type InventoryItemView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';
import { StatGrid } from '@/components/stat-grid';

export default function ProfilePage() {
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterView | null>(null);
  const [inventory, setInventory] = useState<InventoryItemView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [c, inv] = await Promise.all([api.character(), api.inventory()]);
    setCharacter(c);
    setInventory(inv);
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
      </div>
    </>
  );
}
