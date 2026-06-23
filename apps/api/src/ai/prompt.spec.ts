import { describe, it, expect } from 'vitest';
import { buildEncounterPrompt, type GenerationContext } from './prompt';

const base: GenerationContext = {
  regionSetName: 'Test Set',
  regionSetBlurb: 'A place that exists.',
  expeditionType: 'explore',
  desiredEncounterType: 'exploration',
  contentRating: 'pg13',
  personalitySummary: 'curious and a little reckless',
  recentMemories: [],
  storyStyleTags: [],
  step: 2,
  maxSteps: 3,
};

describe('buildEncounterPrompt continuity', () => {
  it('injects the character name, premise/goal, and a "previously" recap', () => {
    const { user } = buildEncounterPrompt({
      ...base,
      characterName: 'Bartholomew',
      premise: 'You explore the Foo, against your better judgement.',
      goal: 'Survive the Foo.',
      previously: { title: 'The Gazebo', choiceLabel: 'Bribe it', outcome: 'It accepted, grudgingly.' },
    });
    expect(user).toContain('Bartholomew');
    expect(user).toContain('You explore the Foo, against your better judgement.');
    expect(user).toContain('Survive the Foo.');
    expect(user).toContain('The Gazebo');
    expect(user).toContain('Bribe it');
    expect(user).toContain('It accepted, grudgingly.');
  });

  it('omits the premise and previously blocks on the opening encounter (no prior context)', () => {
    const { user } = buildEncounterPrompt(base);
    expect(user).not.toContain('Previously this expedition');
    expect(user).not.toContain("expedition's premise");
  });
});
