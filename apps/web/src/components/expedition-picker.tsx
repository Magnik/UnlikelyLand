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
      <h2>Choose an activity</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Each expedition is a short chain of encounters. Stamina is your only limit — spend it wisely, or don&apos;t.
      </p>
      <div className="col mt">
        {types.map((t) => {
          const afford = stamina >= t.staminaPerStep;
          return (
            <button key={t.type} className="btn choice" disabled={busy || !afford} onClick={() => onStart(t.type)}>
              <span className="row between" style={{ width: '100%' }}>
                <span className="label">{t.label}</span>
                <span className={`badge ${afford ? '' : 'risk-ridiculous'}`}>{t.staminaPerStep} stamina/step</span>
              </span>
              <span className="desc">Up to {t.steps} encounters.</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
