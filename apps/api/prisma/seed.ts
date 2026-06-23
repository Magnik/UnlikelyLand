import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Idempotent seed: region sets, the starter item catalog, public achievements,
 * the AI settings singleton, and the first admin account. Safe to run repeatedly
 * (uses upserts keyed on stable unique fields).
 */
const prisma = new PrismaClient();

const REGION_SETS = [
  { key: 'damply-heroic-coast', name: 'The Damply Heroic Coast', blurb: 'Salt air, soggy valour, and crabs with opinions about property law.', order: 1 },
  { key: 'bureaucratic-jungle', name: 'The Bureaucratic Jungle', blurb: 'Vines, humidity, and an unreasonable number of forms in triplicate.', order: 2 },
  { key: 'unfortunately-magical-suburbs', name: 'The Unfortunately Magical Suburbs', blurb: 'Tidy lawns, polite curses, and a HOA that means it.', order: 3 },
  { key: 'mountain-of-mild-inconvenience', name: 'The Mountain of Mild Inconvenience', blurb: 'Not steep, exactly. Just persistently annoying to climb.', order: 4 },
  { key: 'soup-scented-badlands', name: 'The Soup-Scented Badlands', blurb: 'Arid, lawless, and inexplicably fragrant with broth.', order: 5 },
];

interface SeedItem {
  key: string;
  name: string;
  description: string;
  slot: string;
  rarity: string;
  statModifiers: Record<string, number>;
  powerBudget: number;
  consumableEffectType?: string;
  consumableEffectPower?: number;
}

// 38 approved items spanning every slot and every rarity tier. Rare-and-above
// exist in the catalog but stay scarce as *drops* (loot weighting keeps them
// uncommon) so the economy isn't immediately broken. Consumables carry a stamina
// effect rather than stat modifiers.
const ITEMS: SeedItem[] = [
  // ── weapons ────────────────────────────────────────────────────────────────
  { key: 'rusty-island-sword', name: 'Rusty Island Sword', description: 'It has seen things. Mostly rust.', slot: 'weapon', rarity: 'common', statModifiers: { strength: 1 }, powerBudget: 3 },
  { key: 'overconfident-stick', name: 'Overconfident Stick', description: 'A stick that believes in itself more than you do.', slot: 'weapon', rarity: 'common', statModifiers: { bravery: 1 }, powerBudget: 3 },
  { key: 'polite-bonk-hammer', name: 'Polite Bonk Hammer', description: 'Says "excuse me" on contact. Surprisingly effective.', slot: 'weapon', rarity: 'uncommon', statModifiers: { strength: 1, accuracy: 1 }, powerBudget: 6 },
  { key: 'legally-distinct-excalibur', name: 'Legally Distinct Excalibur', description: 'Pulled from a stone. A different stone. Lawyers were involved.', slot: 'weapon', rarity: 'rare', statModifiers: { strength: 2, accuracy: 1 }, powerBudget: 12 },
  { key: 'the-arguer', name: 'The Arguer', description: 'A blade that wins fights by exhausting everyone involved.', slot: 'weapon', rarity: 'epic', statModifiers: { strength: 2, accuracy: 2 }, powerBudget: 20 },
  { key: 'apologetic-greatsword', name: 'Apologetic Greatsword', description: 'Enormous, devastating, and deeply sorry about all of it.', slot: 'weapon', rarity: 'legendary', statModifiers: { strength: 3, toughness: 2 }, powerBudget: 32 },

  // ── armor ──────────────────────────────────────────────────────────────────
  { key: 'cardboard-aegis', name: 'Cardboard Aegis', description: 'Surprisingly protective until it rains. Then very much not.', slot: 'chest', rarity: 'common', statModifiers: { defense: 1 }, powerBudget: 3 },
  { key: 'slightly-defensive-jacket', name: 'Slightly Defensive Jacket', description: 'Wards off about a third of any given insult.', slot: 'chest', rarity: 'common', statModifiers: { defense: 1 }, powerBudget: 3 },
  { key: 'soupproof-boots', name: 'Soupproof Boots', description: 'Rated for broth up to the ankle. Beyond that, you are on your own.', slot: 'feet', rarity: 'uncommon', statModifiers: { toughness: 1, agility: 1 }, powerBudget: 6 },
  { key: 'suspiciously-clean-boots', name: 'Suspiciously Clean Boots', description: 'Nobody on this island has clean boots. Nobody.', slot: 'chest', rarity: 'uncommon', statModifiers: { agility: 2 }, powerBudget: 6 },
  { key: 'helmet-that-claims-it-is-temporary', name: 'A Helmet That Claims It Is Temporary', description: 'Insists it is just helping out until the real helmet arrives.', slot: 'head', rarity: 'uncommon', statModifiers: { defense: 1, toughness: 1 }, powerBudget: 6 },
  { key: 'emergency-formalwear', name: 'Emergency Formalwear', description: 'For when a situation escalates to "black tie" without warning.', slot: 'chest', rarity: 'rare', statModifiers: { defense: 1, charisma: 2 }, powerBudget: 12 },
  { key: 'overcoat-of-many-pockets', name: 'The Overcoat of Many Pockets', description: 'You have never reached the bottom of any of them.', slot: 'chest', rarity: 'epic', statModifiers: { defense: 2, toughness: 2, curiosity: 1 }, powerBudget: 20 },
  { key: 'impenetrable-bathrobe', name: 'Impenetrable Bathrobe', description: 'Maximum comfort, alarming durability. Smells faintly of victory.', slot: 'chest', rarity: 'legendary', statModifiers: { defense: 3, toughness: 2 }, powerBudget: 32 },

  // ── tools ──────────────────────────────────────────────────────────────────
  { key: 'half-charged-lantern', name: 'Half-Charged Lantern', description: 'Provides exactly enough light to see what is about to go wrong.', slot: 'trinket', rarity: 'common', statModifiers: { curiosity: 1 }, powerBudget: 3 },
  { key: 'bureaucratic-compass', name: 'Bureaucratic Compass', description: 'Always points toward the nearest unfinished form.', slot: 'trinket', rarity: 'uncommon', statModifiers: { accuracy: 1, curiosity: 1 }, powerBudget: 6 },
  { key: 'goblin-approved-work-gloves', name: 'Goblin-Approved Work Gloves', description: 'Bears a small union stamp of grudging approval.', slot: 'trinket', rarity: 'uncommon', statModifiers: { strength: 1, negotiation: 1 }, powerBudget: 6 },
  { key: 'self-important-multitool', name: 'Self-Important Multitool', description: 'Has a tool for everything and a strong opinion about each.', slot: 'trinket', rarity: 'uncommon', statModifiers: { accuracy: 1, curiosity: 1 }, powerBudget: 6 },
  { key: 'divining-spork', name: 'Divining Spork', description: 'Points unerringly toward the nearest buffet, and occasionally treasure.', slot: 'trinket', rarity: 'rare', statModifiers: { curiosity: 2, accuracy: 1 }, powerBudget: 12 },
  { key: 'instruction-manual-for-everything', name: 'The Instruction Manual For Everything', description: 'Chapter One is forty thousand pages. It is, however, correct.', slot: 'trinket', rarity: 'epic', statModifiers: { curiosity: 3, negotiation: 1 }, powerBudget: 20 },

  // ── trinkets ─────────────────────────────────────────────────────────────────
  { key: 'medal-for-trying', name: 'The Medal For Trying', description: 'Awarded for effort, regardless of outcome. Especially regardless of outcome.', slot: 'trinket', rarity: 'common', statModifiers: { bravery: 1 }, powerBudget: 3 },
  { key: 'lucky-button', name: 'Lucky Button', description: 'Statistically no luckier than any other button. Statistically.', slot: 'ring', rarity: 'uncommon', statModifiers: { weirdness: 2 }, powerBudget: 6 },
  { key: 'coin-that-lands-on-edge', name: 'Coin That Always Lands On Edge', description: 'Refuses to make decisions for you. Admirable, infuriating.', slot: 'trinket', rarity: 'uncommon', statModifiers: { weirdness: 2 }, powerBudget: 6 },
  { key: 'crab-lawyer-business-card', name: 'Crab-Lawyer Business Card', description: 'Slightly damp. Implies representation you may not actually have.', slot: 'trinket', rarity: 'rare', statModifiers: { negotiation: 2, deception: 1 }, powerBudget: 12 },
  { key: 'semi-legal-moonlight', name: 'Semi-Legal Moonlight', description: 'Bottled under a permit that is being contested in three jurisdictions.', slot: 'trinket', rarity: 'rare', statModifiers: { deception: 2, mischief: 1 }, powerBudget: 12 },
  { key: 'honorary-mayor-sash', name: 'Honorary Mayor Sash', description: 'Confers no actual authority, which has never once stopped you.', slot: 'trinket', rarity: 'epic', statModifiers: { charisma: 2, negotiation: 2 }, powerBudget: 20 },
  { key: 'absurdly-confident-monocle', name: 'Absurdly Confident Monocle', description: 'Through it, every plan looks excellent. Every single one.', slot: 'trinket', rarity: 'absurd', statModifiers: { deception: 3, charisma: 2, weirdness: 1 }, powerBudget: 50 },

  // ── companions ───────────────────────────────────────────────────────────────
  { key: 'mildly-loyal-seagull', name: 'Mildly Loyal Seagull', description: 'Follows you everywhere, mostly to see if you have snacks.', slot: 'companion', rarity: 'uncommon', statModifiers: { empathy: 1, bravery: 1 }, powerBudget: 6 },
  { key: 'opinionated-houseplant', name: 'Opinionated Houseplant', description: 'Photosynthesises judgement. Roots for you, conditionally.', slot: 'companion', rarity: 'rare', statModifiers: { empathy: 2, weirdness: 1 }, powerBudget: 12 },
  { key: 'pocket-sized-emergency-duck', name: 'Pocket-Sized Emergency Duck', description: 'For emergencies. The duck remains calm so you do not have to.', slot: 'companion', rarity: 'rare', statModifiers: { empathy: 2, weirdness: 1 }, powerBudget: 12 },
  { key: 'retired-guard-dog-gary', name: 'Retired Guard Dog Named Gary', description: 'Gary has guarded enough. Gary now guards you, at his own pace.', slot: 'companion', rarity: 'epic', statModifiers: { bravery: 2, empathy: 2 }, powerBudget: 20 },
  { key: 'the-concept-of-a-friend', name: 'The Concept Of A Friend', description: 'Not a friend exactly, but the strong and abiding idea of one.', slot: 'companion', rarity: 'legendary', statModifiers: { empathy: 3, weirdness: 2 }, powerBudget: 32 },

  // ── consumables (stamina restore; no stat modifiers) ─────────────────────────
  { key: 'flat-soda-of-second-winds', name: 'Flat Soda of Second Winds', description: 'Lost its fizz, kept its spirit. Mostly.', slot: 'consumable', rarity: 'common', statModifiers: {}, powerBudget: 0, consumableEffectType: 'stamina', consumableEffectPower: 15 },
  { key: 'questionable-snack', name: 'Questionable Snack', description: 'Restores a little vigour and a lot of regret.', slot: 'consumable', rarity: 'common', statModifiers: {}, powerBudget: 0, consumableEffectType: 'stamina', consumableEffectPower: 15 },
  { key: 'sandwich-of-dubious-courage', name: 'Sandwich of Dubious Courage', description: 'Filled with something brave. You decide not to ask what.', slot: 'consumable', rarity: 'uncommon', statModifiers: {}, powerBudget: 0, consumableEffectType: 'stamina', consumableEffectPower: 25 },
  { key: 'suspiciously-warm-thermos', name: 'Suspiciously Warm Thermos', description: 'Hot for reasons it declines to explain. The broth is excellent.', slot: 'consumable', rarity: 'rare', statModifiers: {}, powerBudget: 0, consumableEffectType: 'stamina', consumableEffectPower: 40 },
  { key: 'emergency-nap-in-a-can', name: 'Emergency Nap In A Can', description: 'Open in a safe location. You will wake refreshed and slightly elsewhere.', slot: 'consumable', rarity: 'epic', statModifiers: {}, powerBudget: 0, consumableEffectType: 'stamina', consumableEffectPower: 60 },
];

const ACHIEVEMENTS = [
  { key: 'first-steps', name: 'First Steps', description: 'Resolved your first encounter.' },
  { key: 'first-victory', name: 'First Blood, Politely', description: 'Won your first fight.' },
  { key: 'first-death', name: 'Mostly Dead', description: 'Experienced your first death. It happens.' },
  { key: 'first-revival', name: 'Back from the Brink', description: 'Revived for the first time.' },
  { key: 'reached-level-5', name: 'Getting the Hang of It', description: 'Reached level 5.' },
  { key: 'reached-level-10', name: 'Double Digits', description: 'Reached level 10.' },
  { key: 'earned-first-rare-item', name: 'Treasure Hunter', description: 'Found your first rare-or-better item.' },
  { key: 'made-first-friend', name: 'First Friend', description: 'Made your first friend on the island.' },
  { key: 'joined-a-guild', name: 'Found Your People', description: 'Joined a guild.' },
  { key: 'founded-a-guild', name: 'Founder', description: 'Founded a guild of your own.' },
  { key: 'sold-first-item', name: 'Open for Business', description: 'Sold an item on the market.' },
  { key: 'survived-something-ridiculous', name: 'Survived Something Ridiculous', description: 'Lived through a ridiculous-risk choice.' },
  { key: 'escaped-the-island', name: 'Escaped the Island', description: 'Got off this rock. Allegedly.' },
];

async function main(): Promise<void> {
  for (const r of REGION_SETS) {
    await prisma.regionSet.upsert({ where: { key: r.key }, update: { name: r.name, blurb: r.blurb, order: r.order }, create: r });
  }
  console.log(`Seeded ${REGION_SETS.length} region sets`);

  // Seed a few regions inside each set (idempotent: only when the set has none).
  const REGIONS_BY_SET: Record<string, string[]> = {
    'damply-heroic-coast': ['Barnacle Bureau', 'The Weeping Pier', 'Lowtide Court'],
    'bureaucratic-jungle': ['Form 7 Clearing', 'The Triplicate Canopy', 'Permit Falls'],
    'unfortunately-magical-suburbs': ['Cul-de-Sac of Minor Curses', 'HOA Standing Stones', 'The Enchanted Driveway'],
    'mountain-of-mild-inconvenience': ['Gentle Switchbacks', 'The Slightly Steep Bit', 'Mildly Scenic Overlook'],
    'soup-scented-badlands': ['Broth Mesa', 'The Simmering Flats', 'Crouton Gulch'],
  };
  for (const set of await prisma.regionSet.findMany()) {
    const existing = await prisma.region.count({ where: { regionSetId: set.id } });
    if (existing > 0) continue;
    const names = REGIONS_BY_SET[set.key] ?? [];
    if (names.length) {
      await prisma.region.createMany({ data: names.map((name) => ({ regionSetId: set.id, name, blurb: '' })) });
    }
  }
  console.log('Seeded regions for each region set');

  for (const item of ITEMS) {
    const fields = {
      name: item.name,
      description: item.description,
      slot: item.slot,
      rarity: item.rarity,
      statModifiers: item.statModifiers,
      powerBudget: item.powerBudget,
      consumableEffectType: item.consumableEffectType ?? 'none',
      consumableEffectPower: item.consumableEffectPower ?? 0,
    };
    await prisma.itemDefinition.upsert({
      where: { key: item.key },
      update: fields,
      create: { key: item.key, ...fields, source: 'seed' },
    });
  }
  console.log(`Seeded ${ITEMS.length} item definitions`);

  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({ where: { key: a.key }, update: { name: a.name, description: a.description }, create: a });
  }
  console.log(`Seeded ${ACHIEVEMENTS.length} achievements`);

  // AI settings singleton from env defaults.
  await prisma.aiSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      enabled: (process.env.AI_ENABLED ?? 'true') !== 'false',
      forceFallback: false,
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL ?? 'llama3.1:8b',
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 25000),
    },
  });
  console.log('Seeded AI settings singleton');

  // First admin account + character.
  const adminUsername = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'change-me-admin-password';
  const isProd = process.env.NODE_ENV === 'production';
  const existing = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existing && isProd && adminPassword === 'change-me-admin-password') {
    // Never mint a real admin with a publicly-known password in production.
    console.warn(
      `Skipping admin creation: set ADMIN_PASSWORD to a strong value before first production boot ` +
        `(the default password is not allowed in production).`,
    );
  } else if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const regionSets = await prisma.regionSet.findMany();
    const region = regionSets[Math.floor(Math.random() * regionSets.length)];
    const admin = await prisma.user.create({
      data: { username: adminUsername, displayName: 'Island Administrator', passwordHash, role: 'admin' },
    });
    await prisma.character.create({
      data: {
        userId: admin.id,
        displayName: 'Island Administrator',
        regionSetId: region.id,
        stats: { create: {} },
        memories: { create: { memoryType: 'world_fact', content: 'Runs this place, apparently.', importance: 1, regionSetId: region.id } },
      },
    });
    console.log(`Created admin user "${adminUsername}"`);
  } else {
    console.log(`Admin user "${adminUsername}" already exists — skipping`);
  }

  // Re-grant: hand a small starter kit to any character with an empty bag. Covers the
  // gear-migration inventory wipe and is idempotent (skips characters that have items).
  const STARTER_KIT = ['rusty-island-sword', 'cardboard-aegis'];
  const kitDefs = await prisma.itemDefinition.findMany({ where: { key: { in: STARTER_KIT } }, select: { id: true } });
  if (kitDefs.length > 0) {
    const empties = await prisma.character.findMany({ where: { inventory: { none: {} } }, select: { id: true } });
    for (const ch of empties) {
      await prisma.inventoryItem.createMany({
        data: kitDefs.map((d) => ({ characterId: ch.id, itemDefinitionId: d.id, quantity: 1 })),
      });
    }
    if (empties.length > 0) console.log(`Granted starter kit to ${empties.length} empty-inventory character(s)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
