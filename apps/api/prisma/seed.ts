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
}

const ITEMS: SeedItem[] = [
  { key: 'rusty-island-sword', name: 'Rusty Island Sword', description: 'It has seen things. Mostly rust.', slot: 'weapon', rarity: 'common', statModifiers: { strength: 1 }, powerBudget: 3 },
  { key: 'overconfident-stick', name: 'Overconfident Stick', description: 'A stick that believes in itself more than you do.', slot: 'weapon', rarity: 'common', statModifiers: { bravery: 1 }, powerBudget: 3 },
  { key: 'slightly-defensive-jacket', name: 'Slightly Defensive Jacket', description: 'Wards off about a third of any given insult.', slot: 'armor', rarity: 'common', statModifiers: { defense: 1 }, powerBudget: 3 },
  { key: 'soupproof-boots', name: 'Soupproof Boots', description: 'Rated for broth up to the ankle. Beyond that, you are on your own.', slot: 'armor', rarity: 'uncommon', statModifiers: { toughness: 1, agility: 1 }, powerBudget: 6 },
  { key: 'suspiciously-clean-boots', name: 'Suspiciously Clean Boots', description: 'Nobody on this island has clean boots. Nobody.', slot: 'armor', rarity: 'uncommon', statModifiers: { agility: 2 }, powerBudget: 6 },
  { key: 'bureaucratic-compass', name: 'Bureaucratic Compass', description: 'Always points toward the nearest unfinished form.', slot: 'tool', rarity: 'uncommon', statModifiers: { accuracy: 1, curiosity: 1 }, powerBudget: 6 },
  { key: 'half-charged-lantern', name: 'Half-Charged Lantern', description: 'Provides exactly enough light to see what is about to go wrong.', slot: 'tool', rarity: 'common', statModifiers: { curiosity: 1 }, powerBudget: 3 },
  { key: 'goblin-approved-work-gloves', name: 'Goblin-Approved Work Gloves', description: 'Bears a small union stamp of grudging approval.', slot: 'tool', rarity: 'uncommon', statModifiers: { strength: 1, negotiation: 1 }, powerBudget: 6 },
  { key: 'lucky-button', name: 'Lucky Button', description: 'Statistically no luckier than any other button. Statistically.', slot: 'trinket', rarity: 'uncommon', statModifiers: { weirdness: 2 }, powerBudget: 6 },
  { key: 'crab-lawyer-business-card', name: 'Crab-Lawyer Business Card', description: 'Slightly damp. Implies representation you may not actually have.', slot: 'trinket', rarity: 'rare', statModifiers: { negotiation: 2, deception: 1 }, powerBudget: 12 },
  { key: 'questionable-snack', name: 'Questionable Snack', description: 'Restores a little vigour and a lot of regret.', slot: 'consumable', rarity: 'common', statModifiers: {}, powerBudget: 2 },
  { key: 'pocket-sized-emergency-duck', name: 'Pocket-Sized Emergency Duck', description: 'For emergencies. The duck remains calm so you do not have to.', slot: 'companion', rarity: 'rare', statModifiers: { empathy: 2, weirdness: 1 }, powerBudget: 12 },
];

const ACHIEVEMENTS = [
  { key: 'first-steps', name: 'First Steps', description: 'Resolved your first encounter.' },
  { key: 'reached-level-10', name: 'Double Digits', description: 'Reached level 10.' },
  { key: 'survived-something-ridiculous', name: 'Survived Something Ridiculous', description: 'Lived through a ridiculous-risk choice.' },
  { key: 'first-death', name: 'Mostly Dead', description: 'Experienced your first death. It happens.' },
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
    await prisma.itemDefinition.upsert({
      where: { key: item.key },
      update: { name: item.name, description: item.description, slot: item.slot, rarity: item.rarity, statModifiers: item.statModifiers, powerBudget: item.powerBudget },
      create: { ...item, source: 'seed' },
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
  const existing = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existing) {
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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
