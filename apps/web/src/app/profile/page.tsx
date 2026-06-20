'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CURRENCY_LABEL,
  type AchievementView,
  type CharacterView,
  type EscapeStatusView,
} from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';
import { StatGrid } from '@/components/stat-grid';

export default function ProfilePage() {
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterView | null>(null);
  const [achievements, setAchievements] = useState<AchievementView[]>([]);
  const [escape, setEscape] = useState<EscapeStatusView | null>(null);
  const [bio, setBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [c, ach, esc] = await Promise.all([api.character(), api.achievements(), api.prestige.status()]);
    setCharacter(c);
    setBio(c.bio);
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

  async function saveBio() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const c = await api.updateCharacter({ bio });
      setCharacter(c);
      setBio(c.bio);
      setEditingBio(false);
      setNotice('Bio saved.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save bio');
    } finally {
      setBusy(false);
    }
  }

  async function doEscape() {
    // Irreversible: ends the run, wipes inventory, resets progression. Confirm first
    // so a mis-tap on mobile can't delete a player's run with no recovery path.
    if (!confirm('Escape now? This ends your run, leaves your inventory behind, and starts a new run a little stronger. This cannot be undone.')) {
      return;
    }
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
          {character.title ? <div className="tiny muted" style={{ marginBottom: 2 }}>{character.title}</div> : null}
          <div className="tiny muted mb">
            Level {character.level} · {character.regionSet.name} · joined {character.createdAt.slice(0, 10)}
          </div>
          <Link href={`/u/${character.id}`} className="btn inline btn-ghost">
            View public profile
          </Link>

          {editingBio ? (
            <div className="field" style={{ marginBottom: 8 }}>
              <textarea rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
              <div className="row mt">
                <button className="btn inline btn-primary" disabled={busy} onClick={saveBio}>
                  Save bio
                </button>
                <button
                  className="btn inline"
                  disabled={busy}
                  onClick={() => {
                    setBio(character.bio);
                    setEditingBio(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="row between">
              {character.bio ? <p className="small">{character.bio}</p> : <p className="small muted">No bio yet.</p>}
              <button className="btn inline" onClick={() => setEditingBio(true)}>
                Edit
              </button>
            </div>
          )}

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
                  stat{escape.escapeCount > 0 ? ` (legacy level ${escape.escapeCount})` : ''} and Escape Tokens. Your
                  inventory is left behind.
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
            Base stats. Equipped gear adds to these — see your <a href="/inventory">Inventory</a> for effective totals.
          </p>
          <StatGrid stats={character.stats} />
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
