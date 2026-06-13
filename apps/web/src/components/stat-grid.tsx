'use client';

import { COMBAT_STATS, PERSONALITY_STATS, SOCIAL_STATS, STAT_LABEL, type StatBlock, type StatKey } from '@unlikelyland/contracts';

function Group({ title, keys, stats }: { title: string; keys: readonly StatKey[]; stats: StatBlock }) {
  return (
    <div>
      <div className="section-label">{title}</div>
      <div className="stat-grid">
        {keys.map((k) => (
          <div className="stat" key={k}>
            <span className="muted">{STAT_LABEL[k]}</span>
            <b>{stats[k]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatGrid({ stats }: { stats: StatBlock }) {
  return (
    <div className="col">
      <Group title="Combat" keys={COMBAT_STATS} stats={stats} />
      <Group title="Social" keys={SOCIAL_STATS} stats={stats} />
      <Group title="Personality" keys={PERSONALITY_STATS} stats={stats} />
    </div>
  );
}
