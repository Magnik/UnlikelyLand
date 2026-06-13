import { STAMINA } from './rules';

export interface StaminaState {
  current: number;
  /** Anchor timestamp (ms). Advances by whole points consumed, never partial. */
  lastUpdatedAtMs: number;
  /** Seconds until the next point regenerates, or null when full. */
  nextPointInSeconds: number | null;
}

/**
 * Server-authoritative stamina regeneration. The client is never trusted: we
 * recompute from the stored `current` + `lastUpdatedAt` on every read.
 *
 * Partial progress is preserved by advancing `lastUpdatedAt` by exactly the
 * number of whole points gained (gained * REGEN_MS), not to `now` — so a player
 * who regenerates 2.4 points keeps the 0.4 toward the third.
 */
export function computeStamina(
  current: number,
  max: number,
  lastUpdatedAtMs: number,
  nowMs: number,
): StaminaState {
  const clampedCurrent = Math.max(0, Math.min(current, max));

  if (clampedCurrent >= max) {
    return { current: max, lastUpdatedAtMs: nowMs, nextPointInSeconds: null };
  }

  const elapsed = Math.max(0, nowMs - lastUpdatedAtMs);
  const gained = Math.floor(elapsed / STAMINA.REGEN_MS);
  const newCurrent = Math.min(max, clampedCurrent + gained);

  if (newCurrent >= max) {
    return { current: max, lastUpdatedAtMs: nowMs, nextPointInSeconds: null };
  }

  const newLast = lastUpdatedAtMs + gained * STAMINA.REGEN_MS;
  const sinceAnchor = nowMs - newLast;
  const nextPointInSeconds = Math.max(0, Math.ceil((STAMINA.REGEN_MS - sinceAnchor) / 1000));

  return { current: newCurrent, lastUpdatedAtMs: newLast, nextPointInSeconds };
}

/** Stamina points regenerated per hour, for display. */
export function regenPerHour(): number {
  return Math.round((60 * 60 * 1000) / STAMINA.REGEN_MS);
}
