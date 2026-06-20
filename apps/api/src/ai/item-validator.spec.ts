import { describe, expect, it } from 'vitest';
import { validateItemConcept } from './item-validator';
import { ITEM } from '../engine/rules';

describe('validateItemConcept', () => {
  it('auto-approves a clean low-power common concept and generates capped stats', () => {
    const v = validateItemConcept({
      name: 'Slightly Helpful Pebble',
      description: 'A pebble that is, against all odds, slightly helpful.',
      narrativePurpose: 'A minor good-luck token.',
      intendedSlot: 'trinket',
      intendedRarity: 'common',
    });
    expect(v.valid).toBe(true);
    expect(v.autoApprovable).toBe(true);
    expect(v.normalized.powerBudget).toBeLessThanOrEqual(ITEM.AUTO_APPROVE_MAX_POWER);
    expect(v.normalized.powerBudget).toBeLessThanOrEqual(ITEM.RARITY_POWER_BUDGET.common);
  });

  it('does NOT auto-approve rare or above (requires an admin)', () => {
    for (const rarity of ['rare', 'epic', 'legendary', 'absurd']) {
      const v = validateItemConcept({
        name: 'A Genuinely Cool Sword',
        description: 'It is cool. Demonstrably.',
        intendedSlot: 'weapon',
        intendedRarity: rarity,
      });
      expect(v.valid).toBe(true);
      expect(v.autoApprovable).toBe(false);
    }
  });

  it('rejects prohibited content and refuses auto-approval', () => {
    const v = validateItemConcept({
      name: 'Nazi Memorabilia Blade',
      description: 'Hateful nonsense.',
      intendedSlot: 'weapon',
      intendedRarity: 'common',
    });
    expect(v.valid).toBe(false);
    expect(v.autoApprovable).toBe(false);
    expect(v.issues.some((i) => i.includes('prohibited content'))).toBe(true);
  });

  it('flags an invalid slot or rarity', () => {
    const v = validateItemConcept({
      name: 'Confused Object',
      description: 'It does not know what it is.',
      intendedSlot: 'spaceship',
      intendedRarity: 'mythic',
    });
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.includes('slot'))).toBe(true);
    expect(v.issues.some((i) => i.includes('rarity'))).toBe(true);
  });

  it('flags an over-long name', () => {
    const v = validateItemConcept({
      name: 'x'.repeat(ITEM.NAME_MAX + 5),
      description: 'fine',
      intendedSlot: 'tool',
      intendedRarity: 'common',
    });
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.includes('name length'))).toBe(true);
  });

  it('assigns a stamina effect and no stat modifiers to consumables', () => {
    const v = validateItemConcept({
      name: 'Plausible Beverage',
      description: 'You drink it. Probably fine.',
      intendedSlot: 'consumable',
      intendedRarity: 'uncommon',
    });
    expect(v.normalized.consumableEffectType).toBe('stamina');
    expect(v.normalized.consumableEffectPower).toBeGreaterThan(0);
    expect(Object.keys(v.normalized.statModifiers)).toHaveLength(0);
  });

  it('never produces stats over the power budget, regardless of input', () => {
    const v = validateItemConcept({
      name: 'Overpowered Wishlist',
      description: 'The AI wishes very hard for power it cannot grant.',
      intendedSlot: 'weapon',
      intendedRarity: 'common',
    });
    const total = Object.values(v.normalized.statModifiers).reduce((a, b) => a + Math.abs(b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(ITEM.RARITY_POWER_BUDGET.common);
  });
});
