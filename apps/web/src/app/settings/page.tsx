'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CharacterView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

const RATINGS: { value: 'family' | 'pg13' | 'r'; label: string }[] = [
  { value: 'family', label: 'Family Friendly' },
  { value: 'pg13', label: 'PG-13' },
  { value: 'r', label: 'R (still no explicit content)' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterView | null>(null);
  const [bio, setBio] = useState('');
  const [rating, setRating] = useState<'family' | 'pg13' | 'r'>('pg13');
  const [style, setStyle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .character()
      .then((c) => {
        setCharacter(c);
        setBio(c.bio);
        setRating(c.contentRating);
        setStyle(c.storyStylePreferences);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const c = await api.updateCharacter({ bio, contentRating: rating, storyStylePreferences: style });
      setCharacter(c);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
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
        <h1>Settings</h1>
        {error ? <div className="error">{error}</div> : null}
        {saved ? <div className="notice">Saved.</div> : null}
        <form className="card" onSubmit={save}>
          <div className="field">
            <label>Bio (shown on your profile)</label>
            <textarea rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="field">
            <label>Content tone</label>
            <select value={rating} onChange={(e) => setRating(e.target.value as 'family' | 'pg13' | 'r')}>
              {RATINGS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Affects AI-generated story tone. All tiers block hateful, sexual, and app-store-hostile content.
            </p>
          </div>
          <div className="field">
            <label>Story style preferences (optional, passed to the AI)</label>
            <textarea rows={2} maxLength={500} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. more mystery, fewer fights, lots of polite monsters" />
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </form>

        <p className="center muted small">
          Want to see your stats and stuff? <a href="/profile">Open your profile</a>.
        </p>
      </div>
    </>
  );
}
