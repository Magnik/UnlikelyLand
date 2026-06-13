import { PrismaClient } from '@prisma/client';

/**
 * UnlikelyLand background worker — the "separate worker container".
 *
 * On an interval it sprinkles ambient "while you were away" events into the
 * private Story Memory of recently-active players. These become hooks the AI
 * can weave into future encounters (async events / unresolved threads). It uses
 * the same Prisma schema as the API; it writes only memory rows, never gameplay
 * state, so it can never grant rewards or otherwise violate server authority.
 *
 * Deliberately a simple interval loop rather than BullMQ — Redis is provisioned
 * for when richer queues/notifications are needed, but this keeps the MVP worker
 * dependency-light. Swap in a BullMQ repeatable job later without changing the
 * gameplay model.
 */
const prisma = new PrismaClient();

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 5 * 60 * 1000);
const ACTIVE_WINDOW_MS = Number(process.env.WORKER_ACTIVE_WINDOW_MS ?? 60 * 60 * 1000);
const PER_CHARACTER_CHANCE = Number(process.env.WORKER_EVENT_CHANCE ?? 0.3);

const AMBIENT_EVENTS: { type: string; content: string }[] = [
  { type: 'unresolved_thread', content: 'While you were away, a goblin left three increasingly passive-aggressive notices about your unpaid bridge toll.' },
  { type: 'unresolved_thread', content: 'A vending machine has been asking around for you. It says it is "not angry, just disappointed."' },
  { type: 'world_fact', content: 'The Soup-Scented Badlands grew slightly more soup-scented overnight. Nobody will explain why.' },
  { type: 'unresolved_thread', content: 'A unionized training dummy filed a grievance with your name on it. A hearing is, allegedly, pending.' },
  { type: 'recurring_npc', content: 'A crab in spectacles was spotted re-measuring a beach you once walked across. It remembers you.' },
  { type: 'world_fact', content: 'A migrating hill passed near your last known location, nine hundred years late and gaining.' },
  { type: 'unresolved_thread', content: 'Your expired shadow was seen applying for a renewal. The forms are, of course, in triplicate.' },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function tick(): Promise<void> {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const actives = await prisma.character.findMany({
    where: { updatedAt: { gt: since }, isDead: false },
    select: { id: true, regionSetId: true },
    take: 50,
  });

  let created = 0;
  for (const c of actives) {
    if (Math.random() > PER_CHARACTER_CHANCE) continue;
    const event = pick(AMBIENT_EVENTS);
    await prisma.storyMemory.create({
      data: { characterId: c.id, memoryType: event.type, content: event.content, importance: 1, regionSetId: c.regionSetId },
    });
    created += 1;
  }
  if (created > 0) {
    // eslint-disable-next-line no-console
    console.log(`[worker] seeded ${created} ambient event(s) across ${actives.length} active player(s)`);
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] UnlikelyLand worker started; tick every ${TICK_MS}ms`);
  await tick().catch((e) => console.error('[worker] tick error', e));
  setInterval(() => {
    tick().catch((e) => console.error('[worker] tick error', e));
  }, TICK_MS);
}

void main();
