'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DeathStatusView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';
import { formatSeconds } from '@/components/bars';

export default function DeathPage() {
  const router = useRouter();
  const [status, setStatus] = useState<DeathStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const s = await api.deathStatus();
    setStatus(s);
    if (!s.isDead) router.replace('/play');
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load().catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router, load]);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function revive(method: 'wait' | 'pay' | 'free') {
    setBusy(true);
    setError(null);
    try {
      const s = await api.revive(method);
      if (!s.isDead) {
        router.replace('/play');
        return;
      }
      setStatus(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not revive');
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Checking your pulse…</div>
        </div>
      </>
    );
  }

  const canWait = status.reviveInSeconds != null && status.reviveInSeconds <= 0;

  return (
    <>
      <TopNav />
      <div className="container">
        <div className="hero" style={{ padding: '28px 0 12px' }}>
          <div className="big" style={{ color: 'var(--danger)' }}>
            You are, regrettably, downed
          </div>
          <div className="tag">{status.deathReason ?? 'The island got you.'}</div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div className="card">
          <div className="row between small muted mb">
            <span>Deaths so far</span>
            <span>{status.deathCount}</span>
          </div>

          <div className="col">
            <button className="btn btn-primary" disabled={busy || !canWait} onClick={() => revive('wait')}>
              {canWait
                ? 'Get up (timer elapsed)'
                : `Wait it out — ${status.reviveInSeconds != null ? formatSeconds(status.reviveInSeconds) : '…'}`}
            </button>

            <button className="btn" disabled={busy || !status.canAffordPaidRevive} onClick={() => revive('pay')}>
              Pay {status.payToReviveCost} Clams to revive now
              {!status.canAffordPaidRevive ? ' (not enough)' : ''}
            </button>

            {status.freeReviveAvailable ? (
              <button className="btn btn-ghost" disabled={busy} onClick={() => revive('free')}>
                🦆 A confused bird lawyer argues you were only mostly dead (free)
              </button>
            ) : null}
          </div>
        </div>

        <p className="center muted small">Death is inconvenient, not permanent. Your progress is safe.</p>
      </div>
    </>
  );
}
