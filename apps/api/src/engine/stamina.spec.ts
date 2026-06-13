import { describe, expect, it } from 'vitest';
import { computeStamina } from './stamina';
import { STAMINA } from './rules';

const REGEN = STAMINA.REGEN_MS;

describe('computeStamina', () => {
  it('does not regenerate when no time has passed', () => {
    const s = computeStamina(40, 100, 1000, 1000);
    expect(s.current).toBe(40);
  });

  it('regenerates one point per REGEN_MS', () => {
    const s = computeStamina(40, 100, 0, REGEN * 3);
    expect(s.current).toBe(43);
  });

  it('preserves partial progress by advancing the anchor by whole points only', () => {
    // 2.5 points worth of time → +2 points, 0.5 point of progress retained.
    const s = computeStamina(40, 100, 0, REGEN * 2.5);
    expect(s.current).toBe(42);
    expect(s.lastUpdatedAtMs).toBe(REGEN * 2);
    // The next point should be ~half a window away.
    expect(s.nextPointInSeconds).toBeLessThanOrEqual(REGEN / 1000 / 2 + 1);
  });

  it('caps at max and reports no next point', () => {
    const s = computeStamina(98, 100, 0, REGEN * 50);
    expect(s.current).toBe(100);
    expect(s.nextPointInSeconds).toBeNull();
  });

  it('never exceeds max even when starting above (defensive clamp)', () => {
    const s = computeStamina(140, 100, 0, REGEN * 5);
    expect(s.current).toBe(100);
  });

  it('reports seconds until the next point when not full', () => {
    const s = computeStamina(10, 100, 0, 0);
    expect(s.nextPointInSeconds).toBe(REGEN / 1000);
  });
});
