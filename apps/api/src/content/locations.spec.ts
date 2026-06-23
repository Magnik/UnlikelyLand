import { describe, it, expect } from 'vitest';
import { LOCATIONS, pickLocation, findLocation } from './locations';

describe('island location catalog', () => {
  it('has named, described, activity-tagged locations for every region set', () => {
    for (const locs of Object.values(LOCATIONS)) {
      expect(locs.length).toBeGreaterThan(0);
      for (const l of locs) {
        expect(l.name.length).toBeGreaterThan(0);
        expect(l.blurb.length).toBeGreaterThan(10);
        expect(l.fits.length).toBeGreaterThan(0);
      }
    }
  });

  it('pickLocation returns a location belonging to the requested region set', () => {
    const loc = pickLocation('damply-heroic-coast', 'fight');
    expect(loc).not.toBeNull();
    expect(LOCATIONS['damply-heroic-coast'].some((l) => l.name === loc!.name)).toBe(true);
  });

  it('pickLocation prefers locations whose fits include the activity', () => {
    // The soup set has scavenge-tagged spots, so the preferred filter is non-empty
    // and the "fall back to all" branch should never run for scavenge here.
    for (let i = 0; i < 25; i++) {
      expect(pickLocation('soup-scented-badlands', 'scavenge')!.fits).toContain('scavenge');
    }
  });

  it('returns null for an unknown or missing region set', () => {
    expect(pickLocation('does-not-exist', 'explore')).toBeNull();
    expect(pickLocation(undefined, 'explore')).toBeNull();
  });

  it('findLocation resolves a known name to its vibe, else null', () => {
    expect(findLocation('damply-heroic-coast', 'The Weeping Pier')?.blurb).toContain('pier');
    expect(findLocation('damply-heroic-coast', 'Nowhere Real')).toBeNull();
    expect(findLocation(undefined, 'The Weeping Pier')).toBeNull();
  });
});
