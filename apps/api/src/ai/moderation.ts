import type { ContentRating } from '@unlikelyland/contracts';
import type { Encounter } from '@unlikelyland/contracts';

/**
 * Lightweight safety layer applied to ALL AI text before it is shown or stored.
 * This is intentionally a blunt blocklist for MVP — a dedicated model/API can
 * replace `moderateText` later without changing callers. Even in R mode the hard
 * blocks (sexual content, hate/slurs, graphic torture) always apply.
 */

// Categories of always-disallowed content (any rating). Kept deliberately small
// and obvious; expand over time. Word-boundary matched, case-insensitive.
const HARD_BLOCK = [
  'nazi',
  'rape',
  'porn',
  'pornographic',
  'incest',
  'bestiality',
  'molest',
  'slur', // placeholder bucket; real slurs are added via ops config, not source
];

// Extra words blocked only at the family-friendly tier.
const FAMILY_EXTRA = ['kill', 'blood', 'dead', 'death', 'gun', 'knife', 'damn'];

export interface ModerationResult {
  safe: boolean;
  reason?: string;
}

function buildRegex(words: string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

const HARD_RE = buildRegex(HARD_BLOCK);
const FAMILY_RE = buildRegex(FAMILY_EXTRA);

export function moderateText(text: string, rating: ContentRating): ModerationResult {
  const hard = HARD_RE.exec(text);
  if (hard) return { safe: false, reason: `blocked term: ${hard[1].toLowerCase()}` };

  if (rating === 'family') {
    const soft = FAMILY_RE.exec(text);
    if (soft) return { safe: false, reason: `not family-friendly: ${soft[1].toLowerCase()}` };
  }

  return { safe: true };
}

/** Concatenate every player-visible text field of an encounter and moderate it. */
export function moderateEncounter(enc: Encounter, rating: ContentRating): ModerationResult {
  const parts: string[] = [enc.title, enc.description, enc.goHomeLabel ?? ''];
  for (const c of enc.choices) {
    parts.push(c.label, c.description, c.visibleHint ?? '');
  }
  for (const n of enc.npcSuggestions) parts.push(n.name, n.description, n.role);
  for (const m of enc.memorySuggestions) parts.push(m.content);

  return moderateText(parts.join(' \n '), rating);
}
