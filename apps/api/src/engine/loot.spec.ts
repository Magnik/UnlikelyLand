import { describe, expect, it } from 'vitest';
import { ITEM } from './rules';
import {
  generateBalancedModifiers,
  pickSlotForExpedition,
  rarityWeightsForLevel,
  rollRarity,
} from './loot';
import { Rng } from './rng';
import type { ItemSlot, Rarity, StatKey } from '@unlikelyland/contracts';

describe('rarityWeightsForLevel', () => {
  it('keeps legendary and absurd at zero for random drops at any level', () => {
    for (const level of [1, 10, 50, 100]) {
      const w = rarityWeightsForLevel(level);
      expect(w.legendary).toBe(0);
      expect(w.absurd).toBe(0);
    }
  });

  it('increases rare weight with level but caps it', () => {
    expect(rarityWeightsForLevel(20).rare).toBeGreaterThan(rarityWeightsForLevel(1).rare);
    expect(rarityWeightsForLevel(1000).rare).toBeLessThanOrEqual(22);
  });
});

describe('rollRarity', () => {
  it('only ever returns common/uncommon/rare/epic from random drops', () => {
    const seen = new Set<Rarity>();
    for (let s = 1; s <= 400; s++) seen.add(rollRarity(new Rng(s), 30));
    expect(seen.has('legendary')).toBe(false);
    expect(seen.has('absurd')).toBe(false);
    for (const r of seen) expect(['common', 'uncommon', 'rare', 'epic']).toContain(r);
  });

  it('higher level yields more rare-or-better drops on average', () => {
    const rareOrBetter = (level: number) => {
      let n = 0;
      for (let s = 1; s <= 600; s++) {
        const r = rollRarity(new Rng(s * 7 + 1), level);
        if (r === 'rare' || r === 'epic') n++;
      }
      return n;
    };
    expect(rareOrBetter(40)).toBeGreaterThan(rareOrBetter(1));
  });
});

describe('pickSlotForExpedition', () => {
  it('biases toward weapons/armour pieces for a fight', () => {
    const slots: ItemSlot[] = ['weapon', 'chest', 'trinket', 'companion', 'consumable'];
    const counts: Record<string, number> = {};
    for (let s = 1; s <= 600; s++) {
      const picked = pickSlotForExpedition(new Rng(s), 'fight', slots)!;
      counts[picked] = (counts[picked] ?? 0) + 1;
    }
    // fight weights weapon/chest at 3 vs others at 1 — they should dominate.
    expect((counts.weapon ?? 0) + (counts.chest ?? 0)).toBeGreaterThan((counts.trinket ?? 0) + (counts.companion ?? 0));
  });

  it('returns null when there are no candidate slots', () => {
    expect(pickSlotForExpedition(new Rng(1), 'explore', [])).toBeNull();
  });
});

describe('generateBalancedModifiers', () => {
  const SLOTS: ItemSlot[] = ['weapon', 'chest', 'ring', 'trinket', 'companion'];
  const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'absurd'];

  it('never exceeds the rarity power budget or the per-stat cap', () => {
    for (const slot of SLOTS) {
      for (const rarity of RARITIES) {
        for (let seed = 1; seed <= 40; seed++) {
          const { statModifiers, powerBudget } = generateBalancedModifiers(slot, rarity, seed);
          const total = Object.values(statModifiers).reduce((a, b) => a + Math.abs(b ?? 0), 0);
          expect(total).toBe(powerBudget);
          expect(total).toBeLessThanOrEqual(ITEM.RARITY_POWER_BUDGET[rarity]);
          for (const v of Object.values(statModifiers)) {
            expect(v ?? 0).toBeLessThanOrEqual(ITEM.RARITY_MAX_STAT_MOD[rarity]);
          }
        }
      }
    }
  });

  it('only assigns stats appropriate to the slot', () => {
    const { statModifiers } = generateBalancedModifiers('chest', 'epic', 123);
    for (const k of Object.keys(statModifiers)) {
      expect(ITEM.SLOT_STAT_AFFINITY.chest).toContain(k as StatKey);
    }
  });

  it('gives consumables no stat modifiers', () => {
    const { statModifiers, powerBudget } = generateBalancedModifiers('consumable', 'epic', 5);
    expect(powerBudget).toBe(0);
    expect(Object.keys(statModifiers)).toHaveLength(0);
  });

  it('is deterministic for the same slot/rarity/seed', () => {
    const a = generateBalancedModifiers('weapon', 'rare', 77);
    const b = generateBalancedModifiers('weapon', 'rare', 77);
    expect(a).toEqual(b);
  });
});
