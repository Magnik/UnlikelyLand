import type { ExpeditionType } from '@unlikelyland/contracts';

/**
 * Hardcoded island locations. Each region set (a character's stretch of the
 * island) has a handful of NAMED, recurring places with a fixed vibe — so the
 * island feels like a real place, just with weird things happening on it.
 *
 * An expedition locks ONE of these at the start and every step happens there, so
 * a run reads as a continuous visit to a single location instead of teleporting
 * scene to scene. `fits` lets an activity bias toward thematically-appropriate
 * places (a Fight tends to a fight-y spot) without hard-restricting anything.
 */
export interface IslandLocation {
  name: string;
  blurb: string;
  /** Selectable expedition types this place suits best (soft preference). */
  fits: ExpeditionType[];
}

export const LOCATIONS: Record<string, IslandLocation[]> = {
  'damply-heroic-coast': [
    { name: 'The Weeping Pier', blurb: 'A long pier that has, for unexamined reasons, been gently crying since Tuesday. The planks are damp; the gulls are smug.', fits: ['explore', 'socialize'] },
    { name: 'The Capsized Marina', blurb: 'A marina where every boat has politely given up and lies on its side. Useful things wash up here, and so do opinions.', fits: ['scavenge', 'explore'] },
    { name: 'Barnacle Bureau', blurb: 'A waterlogged office where barnacles process maritime grievances. Take a number; the number is also a barnacle.', fits: ['socialize', 'scavenge'] },
    { name: 'Lowtide Court', blurb: 'A tidal courtroom that only convenes when the sea pulls back, where crabs argue property law with alarming competence.', fits: ['socialize', 'fight'] },
    { name: 'Saltwhistle Caves', blurb: 'Sea caves that whistle show tunes at high tide. Something in the dark hums along, slightly off-key.', fits: ['explore', 'fight'] },
    { name: 'The Driftwood Throne', blurb: 'A heap of driftwood the locals insist is a seat of power. Whoever sits there is briefly, damply, in charge.', fits: ['fight', 'socialize'] },
  ],
  'bureaucratic-jungle': [
    { name: 'Form 7 Clearing', blurb: 'A jungle clearing dominated by one enormous in-tray. The vines have filed themselves, in triplicate.', fits: ['socialize', 'scavenge'] },
    { name: 'The Triplicate Canopy', blurb: 'Three identical canopies stacked overhead, each requiring its own permit to look at. Monkeys audit you as you pass.', fits: ['explore', 'fight'] },
    { name: 'Permit Falls', blurb: 'A waterfall of rejected paperwork thunders into a pool of pending requests. Wade carefully — some are still appealing.', fits: ['scavenge', 'explore'] },
    { name: 'The Stapler Temple', blurb: 'A moss-covered shrine to a colossal, idle stapler. Pilgrims leave offerings of correctly-collated documents.', fits: ['explore', 'fight'] },
    { name: 'Queue of the Ancients', blurb: 'A line that has been forming since before the island had a name. The people ahead of you are, technically, fossils.', fits: ['socialize', 'scavenge'] },
  ],
  'unfortunately-magical-suburbs': [
    { name: 'Cul-de-Sac of Minor Curses', blurb: 'A pleasant dead-end where every lawn is hexed 4% too green. The neighbours wave; the wave is also a hex.', fits: ['explore', 'socialize'] },
    { name: 'HOA Standing Stones', blurb: 'An ancient stone circle that doubles as the Homeowners Association. The bylaws are carved, and the fines are eternal.', fits: ['socialize', 'fight'] },
    { name: 'The Enchanted Driveway', blurb: 'A driveway that repaves itself with increasingly passive-aggressive interlocking brick. It judges your parking.', fits: ['scavenge', 'explore'] },
    { name: 'Number 12, Definitely Empty', blurb: 'The one house everyone insists is vacant. The porch light is on. It has always been on.', fits: ['explore', 'fight'] },
    { name: 'The Apologetic Graveyard', blurb: 'A cemetery so well-kept the residents apologise for the inconvenience of being dead.', fits: ['socialize', 'scavenge'] },
  ],
  'mountain-of-mild-inconvenience': [
    { name: 'The Gentle Switchbacks', blurb: 'A path that is never steep, merely endless, looping back to insist you forgot something at the bottom.', fits: ['explore', 'socialize'] },
    { name: 'The Slightly Steep Bit', blurb: 'The one genuinely difficult stretch, spoken of for generations. It is about a meter long.', fits: ['fight', 'explore'] },
    { name: 'Mildly Scenic Overlook', blurb: 'A viewpoint with a plaque apologising for the view, which is mostly of another, better mountain.', fits: ['socialize', 'explore'] },
    { name: 'The Lost & Found Cairn', blurb: 'A pile of stones where the mountain returns everything you have ever dropped — plus a few things you have not dropped yet.', fits: ['scavenge', 'explore'] },
    { name: 'Base Camp Disappointment', blurb: 'A cheerful little camp for people who have decided that is quite far enough, actually. The cocoa is excellent.', fits: ['socialize', 'scavenge'] },
  ],
  'soup-scented-badlands': [
    { name: 'Broth Mesa', blurb: 'A flat-topped butte that steams gently at dawn. Locals swear the rock is seasoned. They are not wrong.', fits: ['explore', 'fight'] },
    { name: 'The Simmering Flats', blurb: 'A cracked plain that bubbles like a forgotten pot. The mirages here smell distinctly of leek.', fits: ['explore', 'scavenge'] },
    { name: 'Crouton Gulch', blurb: 'A ravine littered with suspiciously square, suspiciously crunchy boulders. Something nests inside them.', fits: ['scavenge', 'fight'] },
    { name: 'The Last Ladle Saloon', blurb: 'A lawless watering hole that serves exactly one thing, ladled by a bartender who has seen broth-related violence.', fits: ['socialize', 'fight'] },
    { name: 'Stock Pot Springs', blurb: 'Hot springs that are, on closer inspection, an enormous simmering stock. Bathing is discouraged but delicious.', fits: ['scavenge', 'socialize'] },
  ],
};

/** Selection happens once per expedition, so a plain random pick is fine. */
function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick a location for a region set, biased toward those that fit the activity.
 * Returns null when the region set has no catalog entry (caller falls back).
 */
export function pickLocation(regionSetKey: string | undefined, type: ExpeditionType): IslandLocation | null {
  if (!regionSetKey) return null;
  const all = LOCATIONS[regionSetKey];
  if (!all || all.length === 0) return null;
  const preferred = all.filter((l) => l.fits.includes(type));
  return randomOf(preferred.length ? preferred : all);
}

/** Look up a known location's vibe by name (to re-derive its blurb for the prompt). */
export function findLocation(regionSetKey: string | undefined, name: string | null | undefined): IslandLocation | null {
  if (!regionSetKey || !name) return null;
  return LOCATIONS[regionSetKey]?.find((l) => l.name === name) ?? null;
}
