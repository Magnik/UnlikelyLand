'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABEL,
  ITEM_SLOT_LABEL,
  type InventoryView,
  type ItemSlot,
} from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

/** Inventory grouping order (paperdoll order lives in EQUIPMENT_SLOTS). */
const SLOT_ORDER: ItemSlot[] = [
  'weapon',
  'head',
  'shoulders',
  'neck',
  'cloak',
  'chest',
  'wrist',
  'waist',
  'legs',
  'feet',
  'ring',
  'trinket',
  'companion',
  'consumable',
];

export default function InventoryPage() {
  const router = useRouter();
  const [inv, setInv] = useState<InventoryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setInv(await api.inventory());
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    refresh().catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router, refresh]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
      setNotice(label);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (!inv) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Loading your stuff…</div>
        </div>
      </>
    );
  }

  const buffed = inv.stats.entries.filter((e) => e.modifier !== 0);
  const itemById = (id?: string) => inv.items.find((i) => i.id === id) ?? null;
  const bySlot = (slot: ItemSlot) => inv.items.filter((i) => i.slot === slot);

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Inventory</h1>
        {error ? <div className="error">{error}</div> : null}
        {notice ? <div className="notice">{notice}</div> : null}

        <div className="card">
          <h2>Equipped</h2>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            One item per slot. Rings and trinkets each take two.
          </p>
          <div className="stat-grid">
            {EQUIPMENT_SLOTS.map((pos) => {
              const it = itemById(inv.equippedBySlot[pos]);
              return (
                <div className="stat" key={pos}>
                  <span className="tiny muted">{EQUIPMENT_SLOT_LABEL[pos]}</span>
                  {it ? (
                    <span className="row" style={{ gap: 6 }}>
                      <b className={`rar-${it.rarity}`}>{it.name}</b>
                      <button
                        className="btn inline"
                        disabled={busy}
                        aria-label={`Unequip ${it.name}`}
                        onClick={() => act(`Unequipped ${it.name}.`, () => api.unequip(it.id))}
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <span className="tiny muted">— empty —</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>Effective stats</h2>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Base stats plus everything you have equipped. These are the numbers used on expeditions.
          </p>
          {buffed.length === 0 ? (
            <div className="empty">Nothing equipped is changing your stats yet.</div>
          ) : (
            <div className="stat-grid">
              {buffed.map((e) => (
                <div className="stat" key={e.stat}>
                  <span>{e.label}</span>
                  <b>
                    {e.effective}{' '}
                    <span className={e.modifier > 0 ? 'delta-pos' : 'delta-neg'}>
                      ({e.base}
                      {e.modifier > 0 ? `+${e.modifier}` : e.modifier})
                    </span>
                  </b>
                </div>
              ))}
            </div>
          )}
        </div>

        {inv.items.length === 0 ? (
          <div className="card">
            <div className="empty">Nothing yet. Go on an expedition and find some Useful Junk.</div>
          </div>
        ) : (
          <div className="card">
            {SLOT_ORDER.map((slot) => {
              const items = bySlot(slot);
              if (items.length === 0) return null;
              return (
                <div key={slot}>
                  <div className="slot-head">{ITEM_SLOT_LABEL[slot]}</div>
                  <div className="col">
                    {items.map((i) => {
                      const mods = Object.entries(i.statModifiers)
                        .filter(([, v]) => v)
                        .map(([k, v]) => `+${v} ${k}`)
                        .join(', ');
                      return (
                        <div className="stat item-row" key={i.id}>
                          <div className="row between">
                            <b>
                              {i.name}
                              {i.quantity > 1 ? ` ×${i.quantity}` : ''}
                              {i.equipped ? ' · equipped' : ''}
                            </b>
                            <span className={`badge rar-${i.rarity}`}>{i.rarity}</span>
                          </div>
                          <span className="tiny muted">
                            {i.description}
                            {mods ? ` (${mods})` : ''}
                            {i.consumableEffect ? ` — ${i.consumableEffect.label}` : ''}
                          </span>
                          <div className="row">
                            {i.slot === 'consumable' ? (
                              <button className="btn inline btn-primary" disabled={busy} onClick={() => act(`Used ${i.name}.`, () => api.useItem(i.id))}>
                                Use
                              </button>
                            ) : i.equipped ? (
                              <button className="btn inline" disabled={busy} onClick={() => act(`Unequipped ${i.name}.`, () => api.unequip(i.id))}>
                                Unequip
                              </button>
                            ) : (
                              <button className="btn inline btn-primary" disabled={busy} onClick={() => act(`Equipped ${i.name}.`, () => api.equip(i.id))}>
                                Equip
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
