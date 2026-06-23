'use client';

import type { ChoiceView, EncounterView } from '@unlikelyland/contracts';

/** Player-facing labels for the internal risk enum (no raw 'ridiculous' etc.). */
const RISK_LABEL: Record<ChoiceView['riskLevel'], string> = {
  low: 'low risk',
  medium: 'medium risk',
  high: 'high risk',
  ridiculous: 'reckless',
};

function RiskBadge({ risk }: { risk: ChoiceView['riskLevel'] }) {
  return <span className={`badge risk-${risk}`}>{RISK_LABEL[risk]}</span>;
}

function ChoiceButton({ choice, disabled, onPick }: { choice: ChoiceView; disabled: boolean; onPick: () => void }) {
  return (
    <button className="btn choice" disabled={disabled} onClick={onPick}>
      <span className="label">{choice.label}</span>
      {choice.description ? <span className="desc">{choice.description}</span> : null}
      <span className="meta">
        <span className={`badge cat-${choice.statCategory}`}>{choice.statFocusLabel}</span>
        <RiskBadge risk={choice.riskLevel} />
        {choice.mayStartCombat ? <span className="badge combat">may fight</span> : null}
        {choice.isHiddenConsequence ? <span className="badge">?</span> : null}
      </span>
      {choice.isHiddenConsequence && choice.visibleHint ? (
        <span className="desc" style={{ fontStyle: 'italic' }}>
          {choice.visibleHint}
        </span>
      ) : null}
    </button>
  );
}

export function EncounterCard({
  encounter,
  previously,
  busy,
  onPick,
  onGoHome,
}: {
  encounter: EncounterView;
  /** One-line recap of what just happened, shown above the new scene. */
  previously?: string | null;
  busy: boolean;
  onPick: (choiceId: string) => void;
  onGoHome: () => void;
}) {
  return (
    <div className="card">
      <div className="row between mb">
        <span className={`badge cat-${encounter.encounterType === 'combat' ? 'combat' : 'social'}`}>
          {encounter.encounterType}
        </span>
      </div>
      {previously ? (
        <p className="tiny muted" style={{ marginTop: 0 }}>
          <em>Previously: {previously}</em>
        </p>
      ) : null}
      <h2>{encounter.title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {encounter.description}
      </p>
      <div className="col mt">
        {encounter.choices.map((c) => (
          <ChoiceButton key={c.id} choice={c} disabled={busy} onPick={() => onPick(c.id)} />
        ))}
        {encounter.allowGoHome ? (
          <button className="btn btn-ghost" disabled={busy} onClick={onGoHome}>
            🏠 {encounter.goHomeLabel ?? 'Go home'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
