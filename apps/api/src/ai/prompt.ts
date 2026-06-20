import type { ContentRating, EncounterType, ExpeditionType, StoryStyleTag } from '@unlikelyland/contracts';
import { ALL_STATS } from '@unlikelyland/contracts';

export interface GenerationContext {
  regionSetName: string;
  regionSetBlurb: string;
  expeditionType: ExpeditionType;
  desiredEncounterType: EncounterType;
  contentRating: ContentRating;
  personalitySummary: string;
  recentMemories: string[];
  /** Structured story-style toggles the player selected (never free-form text). */
  storyStyleTags: StoryStyleTag[];
  step: number;
  maxSteps: number;
}

/**
 * Fixed, server-controlled hint text for each structured preference. The player
 * only ever selects from this closed set, so their input can never inject
 * arbitrary instructions into the prompt — and these are steering nudges, not
 * overrides of the content-safety rules above them.
 */
const STYLE_TAG_HINT: Record<StoryStyleTag, string> = {
  more_comedy: 'lean into comedy and absurd humour',
  more_mystery: 'add a thread of mystery or something unexplained',
  more_combat: 'make a confrontation or fight more likely',
  more_social: 'favour social encounters and conversation',
  more_exploration: 'favour exploration and discovery of places',
  more_weirdness: 'turn the weirdness up; embrace the surreal',
  less_combat: 'avoid combat; prefer non-violent challenges',
  less_danger: 'keep the stakes lower and less perilous',
  more_recurring_npcs: 'bring back a familiar NPC or reference a past one',
  more_strange_items: 'feature an unusual or strange object',
};

const RATING_GUIDANCE: Record<ContentRating, string> = {
  family:
    'Content rating FAMILY: wholesome, no peril beyond slapstick, no scary imagery, no insults.',
  pg13: 'Content rating PG-13: mild peril and comedic violence allowed; no profanity, no gore, nothing explicit.',
  r: 'Content rating R: edgier comedy and tension allowed, but NEVER sexual content, slurs, hate, graphic torture, or anything app-store-hostile.',
};

const SCHEMA_HINT = `Return ONLY a single JSON object, no markdown, no commentary. Shape:
{
  "schemaVersion": "encounter.v1",
  "title": "string (<=120 chars)",
  "description": "string, 2-5 sentences, second person present tense (<=1000 chars)",
  "encounterType": "combat|social|exploration|mystery|work|training|scavenging",
  "allowGoHome": boolean,
  "goHomeLabel": "optional short funny label",
  "choices": [
    {
      "id": "snake_case",
      "label": "imperative action",
      "description": "one sentence",
      "statFocus": "one of the known stats",
      "riskLevel": "low|medium|high|ridiculous",
      "rewardProfile": "safe|balanced|risky|strange",
      "mayStartCombat": boolean,
      "isHiddenConsequence": boolean,
      "visibleHint": "optional vague hint if hidden"
    }
  ],
  "npcSuggestions": [],
  "memorySuggestions": []
}
Rules: 2-4 choices, each a DIFFERENT statFocus. Never include rewards, xp, money, items, stat changes, or death — the server decides all outcomes. Known stats: ${ALL_STATS.join(', ')}.`;

/**
 * Build the system + user prompt for a personalised encounter. The AI only ever
 * proposes narrative and choices in the encounter.v1 shape; the server validates,
 * moderates, and resolves everything. We pass region, rating, the character's
 * personality drift, and recent private memories so encounters feel continuous.
 */
export function buildEncounterPrompt(ctx: GenerationContext): { system: string; user: string } {
  const system = [
    'You are the encounter generator for UnlikelyLand, a weird-comedy text adventure RPG set on a strange island players are trapped on.',
    'Tone: absurd but coherent, funny, occasionally mysterious. Polite monsters, bureaucratic nonsense, mundane objects with strong opinions. Played straight.',
    RATING_GUIDANCE[ctx.contentRating],
    SCHEMA_HINT,
  ].join('\n\n');

  const memoryBlock =
    ctx.recentMemories.length > 0
      ? `Recent private story facts about this player (weave in subtly, do not contradict):\n- ${ctx.recentMemories.join('\n- ')}`
      : 'This player has no notable history yet.';

  // Structured style preferences → fixed hint lines. These steer tone only and
  // never override the content-rating safety rules in the system prompt.
  const styleHints = ctx.storyStyleTags.map((t) => STYLE_TAG_HINT[t]).filter(Boolean);
  const styleBlock =
    styleHints.length > 0
      ? `Player style preferences (honour these where you can, but never break the content rating): ${styleHints.join('; ')}.`
      : '';

  const user = [
    `Region set: ${ctx.regionSetName} — ${ctx.regionSetBlurb}`,
    `Activity: ${ctx.expeditionType} (aim for a ${ctx.desiredEncounterType} encounter).`,
    `This is step ${ctx.step} of ${ctx.maxSteps} in the current expedition.`,
    `Player personality so far: ${ctx.personalitySummary}.`,
    memoryBlock,
    styleBlock,
    'Generate one fresh encounter now as a single JSON object.',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}
