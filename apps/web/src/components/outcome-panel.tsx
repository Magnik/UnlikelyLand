'use client';

import { CURRENCY_LABEL, type CurrencyType, type ResolutionView } from '@unlikelyland/contracts';
import { HpBar } from './bars';

function RewardChips({ rewards }: { rewards: ResolutionView['rewards'] }) {
  const chips: string[] = [];
  if (rewards.xp) chips.push(`+${rewards.xp} XP`);
  for (const [k, v] of Object.entries(rewards.currencies)) {
    if (v) chips.push(`+${v} ${CURRENCY_LABEL[k as CurrencyType]}`);
  }
  for (const item of rewards.items) chips.push(`🎁 ${item.name}`);
  if (chips.length === 0) return <span className="muted small">No rewards this time.</span>;
  return (
    <div className="row wrap">
      {chips.map((c, i) => (
        <span key={i} className="reward-chip pos">
          {c}
        </span>
      ))}
    </div>
  );
}

function CombatLog({ combat }: { combat: NonNullable<ResolutionView['combat']> }) {
  return (
    <div className="card tight">
      <div className="row between mb">
        <h3 style={{ margin: 0 }}>Fight: {combat.enemyName}</h3>
        <span className={`badge ${combat.playerWon ? 'risk-low' : 'risk-ridiculous'}`}>
          {combat.playerWon ? 'won' : 'lost'}
        </span>
      </div>
      <div className="tiny muted mb">Your HP after the dust settles</div>
      <HpBar current={combat.playerHpRemaining} max={combat.playerMaxHp} />
      <div className="log mt col" style={{ gap: 4 }}>
        {combat.rounds.map((r, i) => (
          <div key={i} className={r.crit ? 'crit' : r.attacker === 'player' ? 'you' : 'foe'}>
            {r.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OutcomePanel({
  result,
  chosenLabel,
  previousLevel,
  onContinue,
}: {
  result: ResolutionView;
  /** The action the player picked, echoed so the outcome reads as cause→effect. */
  chosenLabel?: string | null;
  previousLevel?: number;
  /** Optional: when omitted, the panel is a pure read-out (shown above the next
   *  encounter) with no continue button — the next choice advances the story. */
  onContinue?: () => void;
}) {
  const { check } = result;
  const newLevel = result.character.level;
  const leveledUp = previousLevel != null && newLevel > previousLevel;
  // The expedition continues if there's already a next encounter or one is pending.
  const hasNext = result.nextStepPending || !!result.nextEncounter;
  return (
    <div className="card">
      <div className="row between mb">
        <h2 style={{ margin: 0 }}>{result.died ? 'You went down' : 'Outcome'}</h2>
        <span className={`badge ${check.success ? 'risk-low' : 'risk-high'}`}>
          {check.success ? 'success' : 'setback'}
        </span>
      </div>

      {chosenLabel ? <div className="tiny muted mb">You tried: {chosenLabel}</div> : null}

      {leveledUp ? <div className="levelup">⭐ Level up! You&apos;re now level {newLevel}.</div> : null}

      <p>{result.narrative}</p>

      <div className="tiny muted mb">
        Rolled {check.roll} + {check.statValue} ({check.statFocus}) → {check.total} vs difficulty {check.difficulty}
      </div>

      {result.combat ? <CombatLog combat={result.combat} /> : null}

      {result.statNudges.length > 0 ? (
        <div className="row wrap mb">
          {result.statNudges.map((n, i) => (
            <span key={i} className="badge cat-personality">
              {n.statLabel} +{n.delta}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mb">
        <RewardChips rewards={result.rewards} />
      </div>

      {result.expeditionCompleted ? (
        <div className="notice">
          {result.expedition?.summary ? `${result.expedition.summary} ` : 'Expedition complete! '}
          {result.completionBonus
            ? `Bonus: +${result.completionBonus.xp} XP${
                result.completionBonus.currencies.normal ? `, +${result.completionBonus.currencies.normal} Clams` : ''
              }.`
            : ''}
        </div>
      ) : null}

      {onContinue ? (
        result.died ? (
          <button className="btn btn-danger" onClick={onContinue}>
            See the damage
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onContinue}>
            {hasNext ? 'Onward →' : 'Continue'}
          </button>
        )
      ) : null}
    </div>
  );
}
