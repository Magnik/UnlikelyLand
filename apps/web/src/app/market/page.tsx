'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryItemView, MarketListingView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

export default function MarketPage() {
  const router = useRouter();
  const [listings, setListings] = useState<MarketListingView[]>([]);
  const [mine, setMine] = useState<MarketListingView[]>([]);
  const [inv, setInv] = useState<InventoryItemView[]>([]);
  const [clams, setClams] = useState(0);
  const [sel, setSel] = useState('');
  const [price, setPrice] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [l, m, i, c] = await Promise.all([api.market.list(), api.market.mine(), api.inventory(), api.character()]);
    setListings(l);
    setMine(m);
    // Only non-equipped items can be listed; the inventory endpoint now returns a
    // view object, so read .items.
    setInv(i.items.filter((x) => !x.equipped));
    setClams(c.currencies.normal);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    refresh()
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
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

  if (loading) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Loading the bazaar…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <div className="container">
        <div className="row between mb">
          <h1 style={{ margin: 0 }}>Market</h1>
          <span className="reward-chip">{clams} Clams</span>
        </div>
        {error ? <div className="error">{error}</div> : null}

        <div className="card">
          <h2>Sell an item</h2>
          {inv.length === 0 ? (
            <div className="empty">No spare (unequipped) items to sell.</div>
          ) : (
            <>
              <div className="field">
                <label>Item</label>
                <select value={sel} onChange={(e) => setSel(e.target.value)}>
                  <option value="">Choose…</option>
                  {inv.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.rarity}) ×{i.quantity}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Price (Clams)</label>
                <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <button
                className="btn btn-primary"
                disabled={busy || !sel || Number(price) < 1}
                onClick={() => act(() => api.market.create({ inventoryItemId: sel, priceAmount: Number(price), quantity: 1 }))}
              >
                List for sale
              </button>
            </>
          )}
        </div>

        {mine.length > 0 ? (
          <div className="card">
            <h2>Your listings</h2>
            <div className="col">
              {mine.map((l) => (
                <div key={l.id} className="stat" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="row between">
                    <b>{l.itemName}</b>
                    <span className="badge">{l.priceAmount} Clams</span>
                  </div>
                  <button className="btn inline" disabled={busy} onClick={() => act(() => api.market.cancel(l.id))}>
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card">
          <h2>For sale</h2>
          {listings.length === 0 ? (
            <div className="empty">Nothing for sale. The economy is, for now, vibes.</div>
          ) : (
            <div className="col">
              {listings.map((l) => (
                <div key={l.id} className="stat" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="row between">
                    <b>
                      {l.itemName} <span className="tiny muted">{l.itemRarity} · {l.itemSlot}</span>
                    </b>
                    <span className="badge">{l.priceAmount} Clams</span>
                  </div>
                  <span className="tiny muted">from {l.sellerName}</span>
                  {l.mine ? (
                    <span className="tiny muted">(your listing)</span>
                  ) : (
                    <button
                      className="btn inline btn-primary"
                      disabled={busy || clams < l.priceAmount}
                      onClick={() => {
                        if (confirm(`Buy ${l.itemName} for ${l.priceAmount} Clams?`)) act(() => api.market.buy(l.id));
                      }}
                    >
                      {clams < l.priceAmount ? 'Not enough Clams' : 'Buy'}
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
