import type { EncounterChoice } from '@unlikelyland/contracts';
import type { CheckResult } from './checks';
import type { CombatResult } from './combat';
import type { Rng } from './rng';

/**
 * Deterministic fallback narrative. When the AI is offline or its outcome text
 * fails moderation, the engine still needs to describe what happened. These
 * templates keep the weird-comedy tone without any external call, so the game
 * is fully playable with AI disabled.
 */

const CRIT_OPENERS = [
  'Against all reasonable expectations, it works beautifully.',
  'The island briefly forgets to be difficult, and you seize the moment.',
  'It goes so well that a nearby shrub applauds.',
];
const SUCCESS_OPENERS = [
  'It works, more or less, which is the most you can ask for here.',
  'You pull it off with only a moderate amount of dignity lost.',
  'Improbably, the plan holds together.',
];
const FAIL_OPENERS = [
  'It does not go to plan. It rarely does.',
  'The attempt curdles almost immediately.',
  'Reality declines your request with a polite shrug.',
];
const FUMBLE_OPENERS = [
  'It goes catastrophically, almost artistically, wrong.',
  'You achieve a new personal worst, witnessed by judgmental wildlife.',
  'Everything that could go sideways does, and then keeps going.',
];

export interface OutcomeContext {
  choice: EncounterChoice;
  check: CheckResult;
  combat?: CombatResult | null;
  died?: boolean;
}

export function buildOutcomeNarrative(ctx: OutcomeContext, rng: Rng): string {
  const { check, combat, died } = ctx;

  let opener: string;
  if (check.crit) opener = rng.pick(CRIT_OPENERS);
  else if (check.success) opener = rng.pick(SUCCESS_OPENERS);
  else if (check.fumble) opener = rng.pick(FUMBLE_OPENERS);
  else opener = rng.pick(FAIL_OPENERS);

  const parts: string[] = [opener];

  if (combat) {
    if (combat.playerWon) {
      parts.push(`After a scuffle, ${combat.enemyName} concedes the point and the path is yours again.`);
    } else if (died) {
      parts.push(`${combat.enemyName} proves more than you bargained for, and you go down hard.`);
    } else {
      parts.push(`${combat.enemyName} gets the better of you, but you scrape clear — bruised, broke, and wiser.`);
    }
  }

  if (died) {
    parts.push('The lights go out. Somewhere, a form is being stamped about your sudden unavailability.');
  }

  return parts.join(' ');
}

/** Short one-line summary used in expedition logs / memory. */
export function buildOutcomeSummary(ctx: OutcomeContext): string {
  const verb = ctx.check.success ? 'succeeded at' : 'fumbled';
  const combatNote = ctx.combat ? (ctx.combat.playerWon ? ' (won a fight)' : ' (lost a fight)') : '';
  return `You ${verb} "${ctx.choice.label}"${combatNote}.`;
}
