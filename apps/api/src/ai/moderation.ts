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

/**
 * Fold common leetspeak/homoglyph substitutions back to letters so trivial
 * evasions (`r4pe`, `p0rn`, `n@zi`) are still caught by the word-boundary
 * blocklist. Word boundaries are preserved so legitimate words that merely
 * contain a blocked substring (e.g. "grape") are not false-positives. Determined
 * separator evasion (`r a p e`) is left to the human report queue as the backstop.
 */
function normalizeLeet(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/(.)\1{2,}/g, '$1$1'); // collapse 3+ repeats: "raaaape" -> "raape"
}

export function moderateText(text: string, rating: ContentRating): ModerationResult {
  const normalized = normalizeLeet(text);
  const hard = HARD_RE.exec(text) ?? HARD_RE.exec(normalized);
  if (hard) return { safe: false, reason: `blocked term: ${hard[1].toLowerCase()}` };

  if (rating === 'family') {
    const soft = FAMILY_RE.exec(text) ?? FAMILY_RE.exec(normalized);
    if (soft) return { safe: false, reason: `not family-friendly: ${soft[1].toLowerCase()}` };
  }

  return { safe: true };
}

/**
 * Stricter check for public identifiers (display names, guild names/tags) which
 * are broadcast across chat, search, leaderboards, and profiles. Applies the
 * hard blocklist (at any rating), rejects empty/whitespace-only input, and
 * rejects embedded URLs/markup that have no business in a name.
 */
export function moderateDisplayName(name: string): ModerationResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { safe: false, reason: 'name cannot be blank' };
  if (/https?:\/\/|www\.|<[^>]+>/i.test(trimmed)) return { safe: false, reason: 'name may not contain links or markup' };
  return moderateText(trimmed, 'pg13');
}

/** Concatenate every player-visible text field of an encounter and moderate it. */
export function moderateEncounter(enc: Encounter, rating: ContentRating): ModerationResult {
  const parts: string[] = [enc.title, enc.description, enc.goHomeLabel ?? ''];
  for (const c of enc.choices) {
    parts.push(c.label, c.description, c.visibleHint ?? '');
  }
  for (const n of enc.npcSuggestions) parts.push(n.name, n.description, n.role);
  for (const m of enc.memorySuggestions) parts.push(m.content);
  // Item-concept text is player-facing once minted into the global catalog, so it
  // is moderated here too (the concept validator re-checks at the family floor).
  for (const ic of enc.itemConceptSuggestions) parts.push(ic.name, ic.description, ic.narrativePurpose);

  return moderateText(parts.join(' \n '), rating);
}
