import { describe, expect, it } from 'vitest';
import { EncounterSchema, parseEncounter } from './encounter';

const valid = {
  title: 'The Recliner Has Gone Feral',
  description:
    'You round a corner and find an overstuffed recliner crouched in the path, growling softly through its cushions.',
  encounterType: 'combat',
  allowGoHome: false,
  choices: [
    {
      id: 'wrestle',
      label: 'Wrestle it shut',
      statFocus: 'strength',
      riskLevel: 'high',
      rewardProfile: 'risky',
      mayStartCombat: true,
    },
    {
      id: 'soothe',
      label: 'Compliment its lumbar support',
      statFocus: 'empathy',
      riskLevel: 'low',
      rewardProfile: 'safe',
    },
  ],
};

describe('EncounterSchema', () => {
  it('accepts a minimal valid encounter and applies defaults', () => {
    const enc = parseEncounter(valid);
    expect(enc.schemaVersion).toBe('encounter.v1');
    expect(enc.choices).toHaveLength(2);
    expect(enc.choices[0].isHiddenConsequence).toBe(false);
    expect(enc.npcSuggestions).toEqual([]);
  });

  it('rejects fewer than 2 choices', () => {
    const bad = { ...valid, choices: [valid.choices[0]] };
    expect(EncounterSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects more than 4 choices', () => {
    const bad = { ...valid, choices: [...valid.choices, ...valid.choices, ...valid.choices] };
    expect(EncounterSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown stat focus', () => {
    const bad = { ...valid, choices: [{ ...valid.choices[0], statFocus: 'luck' }, valid.choices[1]] };
    expect(EncounterSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown encounter type', () => {
    const bad = { ...valid, encounterType: 'dance_battle' };
    expect(EncounterSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate choice ids', () => {
    const bad = { ...valid, choices: [valid.choices[0], { ...valid.choices[1], id: 'wrestle' }] };
    expect(EncounterSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    const bad = { ...valid, grantsXp: 9999 };
    expect(EncounterSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an over-long description (cost guard)', () => {
    const bad = { ...valid, description: 'x'.repeat(1201) };
    expect(EncounterSchema.safeParse(bad).success).toBe(false);
  });
});
