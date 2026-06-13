import { Injectable } from '@nestjs/common';
import { parseEncounter, type Encounter, type EncounterType } from '@unlikelyland/contracts';
import { rngFor } from '../engine/rng';
import exploration from '../content/fallback/exploration.json';
import combat from '../content/fallback/combat.json';
import social from '../content/fallback/social.json';
import training from '../content/fallback/training.json';
import scavenging from '../content/fallback/scavenging.json';

/**
 * Seeded fallback content. The game is fully playable with the AI disabled or
 * offline — these pools (hand-curated, schema-valid encounters) cover every
 * expedition's fallback type. Selection is deterministic from the character +
 * expedition + step so a given step always yields the same fallback (auditable),
 * while different steps vary. Every pool is re-validated at startup.
 */
@Injectable()
export class FallbackService {
  private readonly pools: Record<string, Encounter[]>;

  constructor() {
    const validate = (raw: unknown[]): Encounter[] => raw.map((e) => parseEncounter(e));
    const exp = validate(exploration as unknown[]);
    const scav = validate(scavenging as unknown[]);
    this.pools = {
      exploration: exp,
      combat: validate(combat as unknown[]),
      social: validate(social as unknown[]),
      training: validate(training as unknown[]),
      scavenging: scav,
      // Expedition types without a dedicated pool reuse the closest one.
      mystery: exp,
      work: scav,
    };
  }

  /** Total number of seeded fallback encounters (for admin/health display). */
  get totalCount(): number {
    // exploration/scavenging are aliased, so count unique source pools only.
    return ['exploration', 'combat', 'social', 'training', 'scavenging'].reduce(
      (n, k) => n + (this.pools[k]?.length ?? 0),
      0,
    );
  }

  pick(pool: EncounterType, ...seedParts: (string | number)[]): Encounter {
    const list = this.pools[pool] ?? this.pools.exploration;
    const rng = rngFor('fallback', pool, ...seedParts);
    const chosen = list[rng.int(0, list.length - 1)];
    // Deep clone so callers can safely attach ids without mutating the pool.
    return parseEncounter(JSON.parse(JSON.stringify(chosen)));
  }
}
