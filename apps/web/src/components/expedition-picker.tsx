'use client';

import type { ExpeditionTypeInfo } from '@/lib/api';

export function ExpeditionPicker({
  types,
  stamina,
  busy,
  onStart,
}: {
  types: ExpeditionTypeInfo[];
  stamina: number;
  busy: boolean;
  onStart: (type: string) => void;
}) {
  return (
    <div className="card">
      <h2>What will you do today?</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Each is a short chain of encounters with its own flavour and payoff. Stamina is your only limit — spend it
        wisely, or don&apos;t.
      </p>
      <div className="col mt">
        {types.map((t) => {
          const afford = stamina >= t.staminaPerStep;
          return (
            <button
              key={t.type}
              className="btn choice"
              disabled={busy || !afford}
              onClick={() => onStart(t.type)}
              style={{ borderLeft: `3px solid ${t.accent}` }}
            >
              <span className="row between" style={{ width: '100%' }}>
                <span className="label">
                  <span aria-hidden style={{ marginRight: 6 }}>
                    {t.icon}
                  </span>
                  {t.label}
                </span>
                <span className="badge" style={{ background: t.accent, color: '#0b0b0c', borderColor: t.accent }}>
                  {t.specialty}
                </span>
              </span>
              <span className="desc">{t.description}</span>
              <span className="row between tiny muted" style={{ width: '100%', gap: 8 }}>
                <span>🎁 {t.rewardHint}</span>
                <span className={afford ? '' : 'risk-ridiculous'}>
                  {t.staminaPerStep} stamina/step · up to {t.steps}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
