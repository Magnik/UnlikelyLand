'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CURRENCY_LABEL, type CharacterView, type EncounterView, type ExpeditionView, type ResolutionView } from '@unlikelyland/contracts';
import { api, ApiError, getToken, type ExpeditionTypeInfo } from '@/lib/api';
import { TopNav } from '@/components/top-nav';
import { StaminaBar, XpBar } from '@/components/bars';
import { ExpeditionPicker } from '@/components/expedition-picker';
import { EncounterCard } from '@/components/encounter-card';
import { OutcomePanel } from '@/components/outcome-panel';

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const refreshing = useRef(false);

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
    (async () => {
      try {
        const [c, active, t, who] = await Promise.all([
          api.character(),
          api.activeExpedition(),
          api.expeditionTypes(),
          api.me().catch(() => null),
        ]);
        setCharacter(c);
        setTypes(t);
        setExpedition(active.expedition);
        setEncounter(active.encounter);
        setIsAdmin(who?.role === 'admin');
        if (c.death.isDead) router.replace('/death');
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

  async function start(type: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await api.startExpedition(type);
      setExpedition(res.expedition);
      setEncounter(res.encounter);
      setResult(null);
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
    try {
      const res = await api.resolve({ encounterId: encounter.id, choiceId, clientRequestId: uuid() });
      setResult(res);
      setCharacter(res.character);
      setExpedition(res.expedition);
      setEncounter(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resolve');
    } finally {
      setBusy(false);
    }
  }

  function continueFromResult() {
    if (!result) return;
    if (result.died) {
      router.replace('/death');
      return;
    }
    const next = result.nextEncounter;
    setResult(null);
    setEncounter(next);
    if (!next) {
      setExpedition(null);
      void refreshCharacter();
    }
  }

  async function goHome() {
    if (!expedition) return;
    setBusy(true);
    setError(null);
    try {
      await api.goHome(expedition.id);
      setEncounter(null);
      setResult(null);
      setExpedition(null);
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
          <div className="spinner">Waking up on a beach…</div>
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

        {error ? <div className="error">{error}</div> : null}

        {expedition && (encounter || result) ? (
          <div className="row between small muted mb">
            <span>{types.find((t) => t.type === expedition.type)?.label ?? expedition.type}</span>
            <span>
              Step {Math.min(expedition.step + (result ? 0 : 1), expedition.maxSteps)} / {expedition.maxSteps}
            </span>
          </div>
        ) : null}

        {result ? (
          <OutcomePanel result={result} onContinue={continueFromResult} />
        ) : encounter ? (
          <EncounterCard encounter={encounter} busy={busy} onPick={pick} onGoHome={goHome} />
        ) : (
          <ExpeditionPicker types={types} stamina={character.stamina.current} busy={busy} onStart={start} />
        )}
      </div>
    </>
  );
}
