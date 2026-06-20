import { describe, expect, it } from 'vitest';
import { CONTENT_RATING_RANK, type ContentRating, type EncounterType } from '@unlikelyland/contracts';
import { FallbackService } from './fallback.service';

const POOLS: EncounterType[] = ['exploration', 'combat', 'social', 'training', 'scavenging', 'mystery', 'work'];

describe('FallbackService.pick', () => {
  const svc = new FallbackService();

  it('loads non-empty pools for every encounter type', () => {
    for (const p of POOLS) {
      const e = svc.pick(p, { rating: 'r', styleTags: [], seedParts: ['x', 1] });
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('never returns content above the player rating (rating-safe)', () => {
    for (const rating of ['family', 'pg13'] as ContentRating[]) {
      for (const p of POOLS) {
        for (let s = 0; s < 60; s++) {
          const e = svc.pick(p, { rating, styleTags: [], seedParts: ['c', s] });
          expect(CONTENT_RATING_RANK[e.minRating]).toBeLessThanOrEqual(CONTENT_RATING_RANK[rating]);
        }
      }
    }
  });

  it('is deterministic for the same pool + rating + seed', () => {
    const a = svc.pick('combat', { rating: 'pg13', styleTags: [], seedParts: ['char1', 2] });
    const b = svc.pick('combat', { rating: 'pg13', styleTags: [], seedParts: ['char1', 2] });
    expect(a.title).toBe(b.title);
  });

  it('varies across steps', () => {
    const titles = new Set<string>();
    for (let step = 0; step < 8; step++) {
      titles.add(svc.pick('exploration', { rating: 'r', styleTags: [], seedParts: ['char1', step] }).title);
    }
    expect(titles.size).toBeGreaterThan(1);
  });

  it('applies style preferences without ever breaking rating safety', () => {
    for (let s = 0; s < 60; s++) {
      const e = svc.pick('mystery', {
        rating: 'family',
        styleTags: ['more_mystery', 'more_weirdness'],
        seedParts: ['char1', s],
      });
      expect(CONTENT_RATING_RANK[e.minRating]).toBeLessThanOrEqual(CONTENT_RATING_RANK['family']);
    }
  });
});
