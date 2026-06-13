import { describe, expect, it } from 'vitest';
import { moderateText, moderateEncounter } from './moderation';
import { parseEncounter } from '@unlikelyland/contracts';

describe('moderateText', () => {
  it('passes clean weird-comedy text at every rating', () => {
    const text = 'A goblin customs agent refuses to let you cross because your shadow has expired.';
    expect(moderateText(text, 'family').safe).toBe(true);
    expect(moderateText(text, 'pg13').safe).toBe(true);
    expect(moderateText(text, 'r').safe).toBe(true);
  });

  it('hard-blocks disallowed content even in R mode', () => {
    const r = moderateText('this contains nazi imagery', 'r');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('nazi');
  });

  it('applies stricter rules at the family tier only', () => {
    const text = 'you decide to kill some time';
    expect(moderateText(text, 'family').safe).toBe(false);
    expect(moderateText(text, 'pg13').safe).toBe(true);
  });
});

describe('moderateEncounter', () => {
  const base = {
    title: 'The Polite Mushroom Dispute',
    description: 'A mushroom village asks you to mediate a zoning argument with a dragon-shaped gazebo.',
    encounterType: 'social',
    allowGoHome: true,
    goHomeLabel: 'Remember a prior engagement',
    choices: [
      { id: 'mediate', label: 'Mediate fairly', statFocus: 'negotiation', riskLevel: 'low', rewardProfile: 'safe' },
      { id: 'side_gazebo', label: 'Side with the gazebo', statFocus: 'mischief', riskLevel: 'medium', rewardProfile: 'strange' },
    ],
  };

  it('passes a clean encounter', () => {
    expect(moderateEncounter(parseEncounter(base), 'pg13').safe).toBe(true);
  });

  it('flags an encounter whose choice text contains blocked content', () => {
    const bad = parseEncounter({
      ...base,
      choices: [
        { ...base.choices[0], label: 'Make pornographic suggestions', id: 'bad' },
        base.choices[1],
      ],
    });
    expect(moderateEncounter(bad, 'r').safe).toBe(false);
  });
});
