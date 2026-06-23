'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  type CharacterView,
  type EncounterView,
  type EscapeStatusView,
  type ExpeditionView,
  type ResolutionView,
} from '@unlikelyland/contracts';
import { api, ApiError, getToken, type ExpeditionTypeInfo } from '@/lib/api';
import { TopNav } from '@/components/top-nav';
import { ExpeditionPicker } from '@/components/expedition-picker';
import { EncounterCard } from '@/components/encounter-card';
import { OutcomePanel } from '@/components/outcome-panel';
import { PlayerSidebar } from '@/components/player-sidebar';

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
  // The most recent outcome, shown ABOVE the current encounter so a pick resolves
  // and reveals the next beat in one action (no separate "continue" click).
  const [lastResult, setLastResult] = useState<ResolutionView | null>(null);
  const [chosenLabel, setChosenLabel] = useState<string | null>(null);
  const [escape, setEscape] = useState<EscapeStatusView | null>(null);
  const [prevLevel, setPrevLevel] = useState<number | undefined>(undefined);
  const [showIntro, setShowIntro] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const refreshing = useRef(false);

  const runActive = expedition?.status === 'active';

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
          // Mid-step reload: generate the pending next encounter (idempotent server-side).
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
      if (!busy && !encounter && character && character.stamina.current < character.stamina.max) {
        void refreshCharacter();
      }
    }, 15000);
    return () => clearInterval(id);
  }, [busy, encounter, character, refreshCharacter]);

  function dismissIntro() {
    try {
      window.localStorage.setItem(INTRO_FLAG, '1');
    } catch {
      /* ignore */
    }
    setShowIntro(false);
  }

  async function start(type: string) {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await api.startExpedition(type);
      setExpedition(res.expedition);
      setEncounter(res.encounter);
      setLastResult(null);
      setChosenLabel(null);
      await refreshCharacter();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start');
    } finally {
      setBusy(false);
    }
  }

  async function pick(choiceId: string) {
    if (!encounter || busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    setPrevLevel(character?.level);
    setChosenLabel(encounter.choices.find((c) => c.id === choiceId)?.label ?? null);
    try {
      const res = await api.resolve({ encounterId: encounter.id, choiceId, clientRequestId: uuid() });
      // Show this outcome immediately; the next encounter loads in below it.
      setLastResult(res);
      setCharacter(res.character);
      setExpedition(res.expedition);
      setEncounter(null);
      if (res.died) {
        router.replace('/death');
        return;
      }
      if (res.nextStepPending) {
        const expId = res.expedition?.id ?? expedition?.id;
        if (expId) {
          const adv = await api.advanceExpedition(expId);
          setExpedition(adv.expedition);
          setEncounter(adv.encounter);
          if (!adv.encounter) setNotice(adv.expedition?.summary ?? 'Your expedition ended.');
        }
      } else {
        // Expedition finished — the completion outcome stays on screen above the picker.
        void refreshCharacter();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resolve');
    } finally {
      setBusy(false);
    }
  }

  async function goHome() {
    if (!expedition || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.goHome(expedition.id);
      setEncounter(null);
      setExpedition(null);
      setLastResult(null);
      setChosenLabel(null);
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

  const stepLabel = expedition ? `Step ${Math.min(expedition.step + 1, expedition.maxSteps)} / ${expedition.maxSteps}` : '';

  return (
    <>
      <TopNav showAdmin={isAdmin} />
      <div className="play-shell">
        <PlayerSidebar character={character} escape={escape} />

        <div className="play-main">
          {error ? <div className="error">{error}</div> : null}
          {notice ? <div className="notice">{notice}</div> : null}

          {runActive && expedition ? (
            <div className="card tight">
              <div className="row between small muted">
                <span>
                  {types.find((t) => t.type === expedition.type)?.label ?? expedition.type}
                  {expedition.regionName ? ` · ${expedition.regionName}` : ''}
                </span>
                <span>{stepLabel}</span>
              </div>
              {expedition.premise ? <p className="small" style={{ margin: '6px 0 0' }}>{expedition.premise}</p> : null}
              {expedition.goal ? <p className="tiny muted" style={{ margin: '2px 0 0' }}>Goal: {expedition.goal}</p> : null}
            </div>
          ) : null}

          {/* The outcome of the most recent pick, shown above the next encounter
              (or above the picker once the run ends) — no separate continue click. */}
          {lastResult ? (
            <OutcomePanel result={lastResult} chosenLabel={chosenLabel} previousLevel={prevLevel} />
          ) : null}

          {encounter ? (
            <EncounterCard encounter={encounter} busy={busy} onPick={pick} onGoHome={goHome} />
          ) : runActive && busy ? (
            <div className="card">
              <div className="spinner">The island rearranges itself…</div>
            </div>
          ) : !runActive ? (
            <ExpeditionPicker types={types} stamina={character.stamina.current} busy={busy} onStart={start} />
          ) : null}
        </div>
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
                your stats, so outcomes vary. The result shows right above the next scene.
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
