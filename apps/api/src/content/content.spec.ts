import { describe, expect, it } from 'vitest';
import { EncounterSchema } from '@unlikelyland/contracts';
import { FALLBACK_POOLS, FALLBACK_SOURCE_POOLS } from './fallback';
import { moderateEncounter } from '../ai/moderation';
import mystery from './fallback/mystery.json';
import work from './fallback/work.json';

describe('fallback content', () => {
  it('meets the expanded Milestone-2 pool counts', () => {
    // base + "-b" extras: exploration/combat/social 12+10, training/scavenging 6+5.
    expect(FALLBACK_POOLS.exploration.length).toBeGreaterThanOrEqual(22);
    expect(FALLBACK_POOLS.combat.length).toBeGreaterThanOrEqual(22);
    expect(FALLBACK_POOLS.social.length).toBeGreaterThanOrEqual(22);
    expect(FALLBACK_POOLS.training.length).toBeGreaterThanOrEqual(11);
    expect(FALLBACK_POOLS.scavenging.length).toBeGreaterThanOrEqual(11);
  });

  it('has dedicated mystery and work pools (no longer mere aliases)', () => {
    expect((mystery as unknown[]).length).toBeGreaterThanOrEqual(8);
    expect((work as unknown[]).length).toBeGreaterThanOrEqual(6);
    // The assembled investigate/work pools are non-empty and distinct in size.
    expect(FALLBACK_POOLS.mystery.length).toBeGreaterThan(0);
    expect(FALLBACK_POOLS.work.length).toBeGreaterThan(0);
  });

  for (const name of FALLBACK_SOURCE_POOLS) {
    it(`every ${name} encounter is valid encounter.v1 with 2-4 choices and a minRating`, () => {
      for (const enc of FALLBACK_POOLS[name]) {
        const result = EncounterSchema.safeParse(enc);
        if (!result.success) {
          throw new Error(`${name} invalid: ${result.error.message}`);
        }
        expect(result.data.choices.length).toBeGreaterThanOrEqual(2);
        expect(result.data.choices.length).toBeLessThanOrEqual(4);
        expect(['family', 'pg13', 'r']).toContain(result.data.minRating);
      }
    });
  }

  it('combat encounters always offer at least one violent and one non-violent choice', () => {
    for (const enc of FALLBACK_POOLS.combat) {
      expect(enc.choices.some((c) => c.mayStartCombat)).toBe(true);
      expect(enc.choices.some((c) => !c.mayStartCombat)).toBe(true);
    }
  });

  it('choice ids are unique within every encounter', () => {
    for (const name of FALLBACK_SOURCE_POOLS) {
      for (const enc of FALLBACK_POOLS[name]) {
        const ids = new Set(enc.choices.map((c) => c.id));
        expect(ids.size).toBe(enc.choices.length);
      }
    }
  });

  // Fallback content is hand-authored and trusted, but it must clear the SAME hard
  // safety floor AI output must clear — the always-on blocklist (slurs/hate/sexual
  // content/graphic abuse) that applies at every rating. Checking at 'r' applies
  // exactly that floor (not the blunter family-tone tier), so an accidental
  // hard-blocked term in a new fallback encounter fails CI rather than shipping the
  // asymmetry the audit flagged (AI output moderated, fallback not).
  it('every fallback encounter passes the hard moderation floor', () => {
    for (const name of FALLBACK_SOURCE_POOLS) {
      for (const enc of FALLBACK_POOLS[name]) {
        const result = moderateEncounter(enc, 'r');
        if (!result.safe) {
          throw new Error(`${name} "${enc.title}" failed moderation: ${result.reason ?? 'unsafe'}`);
        }
      }
    }
  });
});
