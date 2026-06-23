'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CURRENCY_LABEL, type CharacterView, type EscapeStatusView } from '@unlikelyland/contracts';
import { StaminaBar, XpBar } from './bars';

/**
 * Left-hand player panel: identity, level/XP, stamina, currencies, the escape goal,
 * and quick links. Always visible on desktop; on mobile it collapses behind a
 * toggle (closed by default) so it doesn't crowd the small screen.
 */
export function PlayerSidebar({
  character,
  escape,
}: {
  character: CharacterView;
  escape: EscapeStatusView | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`sidebar ${open ? 'open' : 'collapsed'}`}>
      <button
        type="button"
        className="btn sidebar-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? '▾' : '▸'} Your character</span>
        <span className="tiny muted">Lv {character.level}</span>
      </button>

      <div className="sidebar-body card">
        <h2 style={{ margin: 0 }}>{character.displayName}</h2>
        <div className="tiny muted">{character.regionSet.name}</div>
        {character.title ? <div className="tiny" style={{ color: 'var(--accent)' }}>{character.title}</div> : null}

        <div className="col mt">
          <XpBar level={character.level} xpIntoLevel={character.xpIntoLevel} xpForNext={character.xpForNextLevel} />
          <StaminaBar
            current={character.stamina.current}
            max={character.stamina.max}
            nextInSeconds={character.stamina.nextPointInSeconds}
          />
        </div>

        <div className="section-label">Pockets</div>
        <div className="row wrap">
          <span className="reward-chip">{character.currencies.normal} {CURRENCY_LABEL.normal}</span>
          <span className="reward-chip">{character.currencies.crafting} {CURRENCY_LABEL.crafting}</span>
          <span className="reward-chip">{character.currencies.reputation} {CURRENCY_LABEL.reputation}</span>
          <span className="reward-chip">{character.currencies.premium} {CURRENCY_LABEL.premium}</span>
        </div>

        {escape ? (
          <>
            <div className="section-label">Escape the island</div>
            {escape.eligible ? (
              <div className="tiny" style={{ color: 'var(--accent-2)' }}>
                🚪 Ready — attempt your escape from the Character page.
              </div>
            ) : (
              <>
                <div className="tiny muted">Reach level {escape.requiredLevel} to attempt escape.</div>
                <div className="bar mt" aria-hidden>
                  <span
                    className="fill-xp"
                    style={{ width: `${Math.min(100, Math.round((escape.level / escape.requiredLevel) * 100))}%` }}
                  />
                </div>
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  Level {escape.level} / {escape.requiredLevel}
                </div>
              </>
            )}
          </>
        ) : null}

        <div className="col mt">
          <Link className="btn inline" href="/inventory">🎒 Bag</Link>
          <Link className="btn inline" href="/profile">🧍 Character</Link>
        </div>
      </div>
    </aside>
  );
}
