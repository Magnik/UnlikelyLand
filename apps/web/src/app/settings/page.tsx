'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  STORY_STYLE_LABEL,
  STORY_STYLE_TAGS,
  type AchievementView,
  type CharacterView,
  type ContentRating,
  type StoryStyleTag,
} from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

const RATINGS: { value: ContentRating; label: string; blurb: string }[] = [
  { value: 'family', label: 'Family Friendly', blurb: 'Wholesome and silly. No peril beyond slapstick.' },
  { value: 'pg13', label: 'PG-13', blurb: 'Mild peril and comedic violence. No gore or profanity.' },
  { value: 'r', label: 'R', blurb: 'Edgier tension and dark comedy. Never explicit, hateful, or graphic.' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterView | null>(null);
  const [bio, setBio] = useState('');
  const [rating, setRating] = useState<ContentRating>('pg13');
  const [tags, setTags] = useState<StoryStyleTag[]>([]);
  const [achievements, setAchievements] = useState<AchievementView[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [titleBusy, setTitleBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    Promise.all([api.character(), api.achievements()])
      .then(([c, a]) => {
        setCharacter(c);
        setBio(c.bio);
        setRating(c.contentRating);
        setTags(c.storyStyleTags);
        setTitle(c.title);
        setAchievements(a);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.replace('/login');
          return;
        }
        setError(e instanceof ApiError ? e.message : 'Failed to load');
      });
  }, [router]);

  // Only achievements the player has actually unlocked can be worn as a title.
  const unlockedAchievements = achievements.filter((a) => a.unlockedAt !== null);

  async function changeTitle(key: string) {
    const next = key === '' ? null : key;
    setTitleBusy(true);
    setError(null);
    setSaved(false);
    try {
      const c = await api.updateCharacter({ title: next });
      setCharacter(c);
      setTitle(c.title);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not save title');
    } finally {
      setTitleBusy(false);
    }
  }

  function toggleTag(tag: StoryStyleTag) {
    setSaved(false);
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const c = await api.updateCharacter({ bio, contentRating: rating, storyStyleTags: tags });
      setCharacter(c);
      setBio(c.bio);
      setTags(c.storyStyleTags);
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
            <label>Bio (shown on your public profile)</label>
            <textarea rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
            <p className="tiny muted" style={{ marginTop: 6 }}>
              {bio.length}/500 — checked for safety before it&apos;s saved.
            </p>
          </div>

          <div className="field">
            <label>Content rating</label>
            <div className="col">
              {RATINGS.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  className={`toggle-chip ${rating === r.value ? 'on' : ''}`}
                  onClick={() => {
                    setRating(r.value);
                    setSaved(false);
                  }}
                >
                  <span className="dot" />
                  <span>
                    <b>{r.label}</b>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {r.blurb}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              All tiers always block hateful, sexual, and app-store-hostile content. Defaults to PG-13.
            </p>
          </div>

          <div className="field">
            <label>Story style preferences</label>
            <p className="tiny muted" style={{ marginTop: 0, marginBottom: 8 }}>
              Nudge the kinds of encounters you get. These steer AI generation and bias offline content too — but never
              override your content rating.
            </p>
            <div className="toggle-grid">
              {STORY_STYLE_TAGS.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className={`toggle-chip ${tags.includes(tag) ? 'on' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  <span className="dot" />
                  <span>{STORY_STYLE_LABEL[tag]}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </form>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Title</h2>
          <div className="field">
            <label>Displayed title</label>
            <select
              value={title ?? ''}
              disabled={titleBusy}
              onChange={(e) => changeTitle(e.target.value)}
            >
              <option value="">(none)</option>
              {unlockedAchievements.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Pick a title from achievements you&apos;ve unlocked.
            </p>
          </div>
        </div>

        <p className="center muted small">
          Looking for your stats and gear? <a href="/profile">Profile</a> · <a href="/inventory">Inventory</a>.
        </p>
      </div>
    </>
  );
}
