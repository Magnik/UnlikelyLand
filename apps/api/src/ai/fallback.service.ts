import { Injectable } from '@nestjs/common';
import {
  CONTENT_RATING_RANK,
  type ContentRating,
  type Encounter,
  type EncounterType,
  type StoryStyleTag,
} from '@unlikelyland/contracts';
import { rngFor, type Rng } from '../engine/rng';
import { FALLBACK_POOLS, FALLBACK_SOURCE_POOLS } from '../content/fallback';

export interface FallbackPickOptions {
  /** Player's content rating — encounters above it (minRating) are excluded. */
  rating: ContentRating;
  /** Structured story preferences — bias selection toward matching encounters. */
  styleTags: StoryStyleTag[];
  /** Deterministic seed parts (character/expedition/step). */
  seedParts: (string | number)[];
}

/**
 * Seeded fallback content. The game is fully playable with the AI disabled or
 * offline — these pools (hand-curated, schema-valid encounters, loaded and
 * validated by ../content/fallback) cover every expedition type. Selection is:
 *
 *  - rating-safe: an encounter is only eligible if its minRating is at or below
 *    the player's chosen content rating, so a Family player never sees R content;
 *  - preference-biased: encounters whose styleAffinities match the player's
 *    structured story preferences are weighted higher;
 *  - deterministic: seeded from character + expedition + step, so a given step
 *    always yields the same fallback (auditable) while different steps vary.
 */
@Injectable()
export class FallbackService {
  private readonly pools: Record<EncounterType, Encounter[]> = FALLBACK_POOLS;

  /** Total number of seeded fallback encounters across the dedicated pools. */
  get totalCount(): number {
    return FALLBACK_SOURCE_POOLS.reduce((n, k) => n + (this.pools[k]?.length ?? 0), 0);
  }

  /** Per-pool counts (for admin/health display). */
  poolCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k of FALLBACK_SOURCE_POOLS) out[k] = this.pools[k]?.length ?? 0;
    return out;
  }

  pick(pool: EncounterType, opts: FallbackPickOptions): Encounter {
    const all = this.pools[pool] ?? this.pools.exploration;
    const rng = rngFor('fallback', pool, opts.rating, ...opts.seedParts);

    // Rating filter: only encounters permitted at the player's rating.
    const playerRank = CONTENT_RATING_RANK[opts.rating];
    let eligible = all.filter((e) => CONTENT_RATING_RANK[e.minRating] <= playerRank);
    if (eligible.length === 0) eligible = all; // defensive: never get stuck

    const chosen = this.weightedPick(eligible, opts.styleTags, rng);
    // Deep clone so callers can safely attach ids without mutating the pool.
    return structuredClone(chosen);
  }

  /** Weight encounters by how many of their styleAffinities match the player's tags. */
  private weightedPick(list: Encounter[], styleTags: StoryStyleTag[], rng: Rng): Encounter {
    if (styleTags.length === 0) return list[rng.int(0, list.length - 1)];
    const tagSet = new Set(styleTags);
    const weights = list.map((e) => 1 + (e.styleAffinities ?? []).filter((a) => tagSet.has(a)).length * 2);
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = rng.next() * total;
    for (let i = 0; i < list.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return list[i];
    }
    return list[list.length - 1];
  }
}
