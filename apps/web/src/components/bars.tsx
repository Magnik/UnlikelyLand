'use client';

function pct(current: number, max: number): string {
  if (max <= 0) return '0%';
  return `${Math.max(0, Math.min(100, (current / max) * 100))}%`;
}

export function StaminaBar({ current, max, nextInSeconds }: { current: number; max: number; nextInSeconds: number | null }) {
  return (
    <div className="col" style={{ gap: 5 }}>
      <div className="row between tiny muted">
        <span>Stamina</span>
        <span>
          {current}/{max}
          {current < max && nextInSeconds != null ? ` · +1 in ${formatSeconds(nextInSeconds)}` : ''}
        </span>
      </div>
      <div className="bar">
        <span className="fill-stamina" style={{ width: pct(current, max) }} />
      </div>
    </div>
  );
}

export function XpBar({ level, xpIntoLevel, xpForNext }: { level: number; xpIntoLevel: number; xpForNext: number }) {
  return (
    <div className="col" style={{ gap: 5 }}>
      <div className="row between tiny muted">
        <span>Level {level}</span>
        <span>
          {xpIntoLevel}/{xpForNext} XP
        </span>
      </div>
      <div className="bar">
        <span className="fill-xp" style={{ width: pct(xpIntoLevel, xpForNext) }} />
      </div>
    </div>
  );
}

export function HpBar({ current, max }: { current: number; max: number }) {
  return (
    <div className="bar" style={{ height: 8 }}>
      <span className="fill-hp" style={{ width: pct(current, max) }} />
    </div>
  );
}

export function formatSeconds(total: number): string {
  if (total <= 0) return 'now';
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return `${s}s`;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
