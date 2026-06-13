import { describe, expect, it } from 'vitest';
import { EncounterSchema } from '@unlikelyland/contracts';
import exploration from './fallback/exploration.json';
import combat from './fallback/combat.json';
import social from './fallback/social.json';
import training from './fallback/training.json';
import scavenging from './fallback/scavenging.json';

const pools: Record<string, unknown[]> = {
  exploration: exploration as unknown[],
  combat: combat as unknown[],
  social: social as unknown[],
  training: training as unknown[],
  scavenging: scavenging as unknown[],
};

describe('fallback content', () => {
  it('meets the minimum seeded counts from the spec', () => {
    expect(pools.exploration.length).toBeGreaterThanOrEqual(10);
    expect(pools.combat.length).toBeGreaterThanOrEqual(10);
    expect(pools.social.length).toBeGreaterThanOrEqual(10);
    expect(pools.training.length).toBeGreaterThanOrEqual(5);
    expect(pools.scavenging.length).toBeGreaterThanOrEqual(5);
  });

  for (const [name, list] of Object.entries(pools)) {
    it(`every ${name} encounter is valid encounter.v1`, () => {
      for (const raw of list) {
        const result = EncounterSchema.safeParse(raw);
        if (!result.success) {
          throw new Error(`${name} invalid: ${result.error.message}`);
        }
        expect(result.data.choices.length).toBeGreaterThanOrEqual(2);
        expect(result.data.choices.length).toBeLessThanOrEqual(4);
      }
    });
  }

  it('combat encounters always offer at least one violent and one non-violent choice', () => {
    for (const raw of pools.combat) {
      const enc = EncounterSchema.parse(raw);
      expect(enc.choices.some((c) => c.mayStartCombat)).toBe(true);
      expect(enc.choices.some((c) => !c.mayStartCombat)).toBe(true);
    }
  });
});
