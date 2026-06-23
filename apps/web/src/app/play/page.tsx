'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CURRENCY_LABEL,
  type AdvanceExpeditionView,
  type CharacterView,
  type EncounterView,
  type EscapeStatusView,
  type ExpeditionView,
  type ResolutionView,
} from '@unlikelyland/contracts';
import { api, ApiError, getToken, type ExpeditionTypeInfo } from '@/lib/api';
import { TopNav } from '@/components/top-nav';
import { StaminaBar, XpBar } from '@/components/bars';
import { ExpeditionPicker } from '@/components/expedition-picker';
import { EncounterCard } from '@/components/encounter-card';
import { OutcomePanel } from '@/components/outcome-panel';

const INTRO_FLAG = 'ul_intro_seen';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function PlayPage() {
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterView | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [types, setTypes] = useState<ExpeditionTypeInfo[]>([]);
  const [expedition, setExpedition] = useState<ExpeditionView | null>(null);
  const [encounter, setEncounter] = useState<EncounterView | null>(null);
  const [result, setResult] = useState<ResolutionView | null>(null);
  const [escape, setEscape] = useState<EscapeStatusView | null>(null);
  const [prevLevel, setPrevLevel] = useState<number | undefined>(undefined);
  const [chosenLabel, setChosenLabel] = useState<string | null>(null);
  // One-line recap of the previous step, shown above the next encounter.
  const [lastNarrative, setLastNarrative] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  // Neutral one-off message (e.g. an expedition that ended on its own).
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const refreshing = useRef(false);
  // Re-entry guard so a double-click on "Onward" can't run continueFromResult twice.
  const continuing = useRef(false);
  // The in-flight background generation of the next encounter (prefetch), so
  // "Onward" reuses it instead of kicking off a second (duplicate) request.
  const nextPromise = useRef<Promise<AdvanceExpeditionView> | null>(null);

  const refreshCharacter = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const c = await api.character();
      setCharacter(c);
      if (c.death.isDead) router.replace('/death');
    } finally {
      refreshing.current = false;
    }
  }, [router]);

  // Begin generating the next encounter in the background. Idempotent server-side,
  // so it's safe even if it overlaps a later explicit advance.
  function startAdvance(expeditionId: string): Promise<AdvanceExpeditionView> {
    const p = api.advanceExpedition(expeditionId);
    nextPromise.current = p;
    p.then((adv) => setExpedition(adv.expedition)).catch(() => {
      nextPromise.current = null;
    });
    return p;
  }

  // Resolve the next step, reusing an in-flight prefetch when possible. Returns the
  // full advance result so the caller can read the ended-expedition summary.
  async function ensureNext(expeditionId: string): Promise<AdvanceExpeditionView> {
    const inflight = nextPromise.current;
    try {
      return inflight ? await inflight : await startAdvance(expeditionId);
    } catch {
      return await startAdvance(expeditionId);
    } finally {
      nextPromise.current = null;
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    try {
      if (!window.localStorage.getItem(INTRO_FLAG)) setShowIntro(true);
    } catch {
      /* ignore storage errors */
    }
    (async () => {
      try {
        const [c, active, t, who, esc] = await Promise.all([
          api.character(),
          api.activeExpedition(),
          api.expeditionTypes(),
          api.me().catch(() => null),
          api.prestige.status().catch(() => null),
        ]);
        setCharacter(c);
        setTypes(t);
        setIsAdmin(who?.role === 'admin');
        setEscape(esc);
        if (c.death.isDead) {
          router.replace('/death');
          return;
        }
        setExpedition(active.expedition);
        if (active.expedition && !active.encounter) {
          // Mid-step reload: the next encounter hadn't been generated yet. Generate
          // it now (idempotent — returns the existing one if a prefetch beat us to it).
          const adv = await api.advanceExpedition(active.expedition.id);
          setExpedition(adv.expedition);
          setEncounter(adv.encounter);
          if (!adv.encounter) {
            setExpedition(null);
            setNotice(adv.expedition?.summary ?? 'Your expedition ended.');
          }
        } else {
          setEncounter(active.encounter);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Lightweight stamina ticker: refresh when a regen point should have arrived.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((x) => x + 1);
      if (!busy && !encounter && !result && character && character.stamina.current < character.stamina.max) {
        void refreshCharacter();
      }
    }, 15000);
    return () => clearInterval(id);
  }, [busy, encounter, result, character, refreshCharacter]);

  function dismissIntro() {
    try {
      window.localStorage.setItem(INTRO_FLAG, '1');
    } catch {
      /* ignore */
    }
    setShowIntro(false);
  }

  async function start(type: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    nextPromise.current = null;
    try {
      const res = await api.startExpedition(type);
      setExpedition(res.expedition);
      setEncounter(res.encounter);
      setResult(null);
      setLastNarrative(null);
      await refreshCharacter();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start');
    } finally {
      setBusy(false);
    }
  }

  async function pick(choiceId: string) {
    if (!encounter) return;
    setError(null);
    setBusy(true);
    setPrevLevel(character?.level);
    setChosenLabel(encounter.choices.find((c) => c.id === choiceId)?.label ?? null);
    try {
      const res = await api.resolve({ encounterId: encounter.id, choiceId, clientRequestId: uuid() });
      setResult(res);
      setCharacter(res.character);
      setExpedition(res.expedition);
      setEncounter(null);
      // Pre-generate the next encounter while the player reads this outcome, so
      // "Onward" is instant. (Hidden behind reading time; no extra wait.)
      if (res.nextStepPending && res.expedition) startAdvance(res.expedition.id);
    } catch (err) {
      setChosenLabel(null);
      setError(err instanceof ApiError ? err.message : 'Could not resolve');
    } finally {
      setBusy(false);
    }
  }

  async function continueFromResult() {
    if (!result || continuing.current) return;
    if (result.died) {
      router.replace('/death');
      return;
    }
    continuing.current = true;
    const narrative = result.narrative;
    const directNext = result.nextEncounter;
    const pending = result.nextStepPending || !!directNext;
    const expId = result.expedition?.id ?? expedition?.id ?? null;
    setResult(null);
    setChosenLabel(null);
    setNotice(null);
    setBusy(true);
    try {
      if (!pending) {
        // Expedition finished cleanly (all steps done).
        setEncounter(null);
        setExpedition(null);
        setLastNarrative(null);
        void refreshCharacter();
        return;
      }
      setLastNarrative(narrative);
      if (directNext) {
        setEncounter(directNext);
        return;
      }
      if (!expId) {
        setEncounter(null);
        setExpedition(null);
        return;
      }
      // Wait on the background prefetch (usually already finished while reading).
      const adv = await ensureNext(expId);
      setExpedition(adv.expedition);
      setEncounter(adv.encounter);
      if (!adv.encounter) {
        // Expedition ended here (e.g. out of stamina) — say so before the picker.
        setLastNarrative(null);
        setNotice(adv.expedition?.summary ?? 'Your expedition ended.');
        void refreshCharacter();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not continue');
    } finally {
      setBusy(false);
      continuing.current = false;
    }
  }

  async function goHome() {
    if (!expedition) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    nextPromise.current = null;
    try {
      await api.goHome(expedition.id);
      setEncounter(null);
      setResult(null);
      setExpedition(null);
      setLastNarrative(null);
      await refreshCharacter();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not go home');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Waking up on the shore…</div>
        </div>
      </>
    );
  }

  if (!character) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="error">{error ?? 'No character found.'}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav showAdmin={isAdmin} />
      <div className="container">
        <div className="card">
          <div className="row between mb">
            <div>
              <h2 style={{ margin: 0 }}>{character.displayName}</h2>
              <div className="tiny muted">{character.regionSet.name}</div>
              {character.regionSet.blurb ? <div className="tiny muted">{character.regionSet.blurb}</div> : null}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="reward-chip">{character.currencies.normal} {CURRENCY_LABEL.normal}</span>
            </div>
          </div>
          <div className="col">
            <XpBar level={character.level} xpIntoLevel={character.xpIntoLevel} xpForNext={character.xpForNextLevel} />
            <StaminaBar current={character.stamina.current} max={character.stamina.max} nextInSeconds={character.stamina.nextPointInSeconds} />
          </div>
          <div className="row wrap mt">
            <span className="reward-chip">{character.currencies.crafting} {CURRENCY_LABEL.crafting}</span>
            <span className="reward-chip">{character.currencies.reputation} {CURRENCY_LABEL.reputation}</span>
            <span className="reward-chip">{character.currencies.premium} {CURRENCY_LABEL.premium}</span>
          </div>
        </div>

        {escape ? (
          <div className="notice tiny">
            {escape.eligible
              ? '🚪 You can attempt to escape the island — open your Profile to try.'
              : `🚪 Goal: reach level ${escape.requiredLevel} to attempt your escape. You're level ${escape.level}.`}
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}
        {notice ? <div className="notice">{notice}</div> : null}

        {expedition && (encounter || result) ? (
          <div className="card tight">
            <div className="row between small muted">
              <span>
                {types.find((t) => t.type === expedition.type)?.label ?? expedition.type}
                {expedition.regionName ? ` · ${expedition.regionName}` : ''}
              </span>
              <span>
                Step {Math.min(expedition.step + (result ? 0 : 1), expedition.maxSteps)} / {expedition.maxSteps}
              </span>
            </div>
            {expedition.premise ? <p className="small" style={{ margin: '6px 0 0' }}>{expedition.premise}</p> : null}
            {expedition.goal ? <p className="tiny muted" style={{ margin: '2px 0 0' }}>Goal: {expedition.goal}</p> : null}
          </div>
        ) : null}

        {result ? (
          <OutcomePanel result={result} chosenLabel={chosenLabel} previousLevel={prevLevel} onContinue={continueFromResult} />
        ) : encounter ? (
          <EncounterCard encounter={encounter} previously={lastNarrative} busy={busy} onPick={pick} onGoHome={goHome} />
        ) : (
          <ExpeditionPicker types={types} stamina={character.stamina.current} busy={busy} onStart={start} />
        )}
      </div>

      {showIntro ? (
        <div
          onClick={dismissIntro}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div className="card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>You washed up on the island</h2>
            <p className="small">
              The locals are bureaucratic, the furniture is hostile, and your shadow may have expired. Your job is to
              survive it — and, eventually, escape.
            </p>
            <ul className="small" style={{ paddingLeft: 18 }}>
              <li>
                <b>Expeditions</b> are short story runs. Pick one to head out.
              </li>
              <li>
                Each is a chain of <b>encounters</b> — a scene plus a few <b>choices</b>. What you pick is rolled against
                your stats, so outcomes vary.
              </li>
              <li>
                <b>Stamina</b> is your energy: every step spends some, and it refills slowly over time.
              </li>
              <li>
                <b>Goal:</b> reach level {escape?.requiredLevel ?? 10} and you can attempt to escape the island.
              </li>
            </ul>
            <button className="btn btn-primary" onClick={dismissIntro}>
              Start surviving
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
