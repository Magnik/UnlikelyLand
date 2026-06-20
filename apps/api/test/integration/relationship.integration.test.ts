import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { RelationshipService } from '../../src/common/relationship.service';

/**
 * Sample Postgres-backed integration test. It exercises the REAL
 * RelationshipService against a real database, proving bidirectional block
 * enforcement end-to-end (not just against mocks).
 *
 * Run it by pointing TEST_DATABASE_URL at a throwaway database that already has
 * the migrations applied, e.g.:
 *
 *   createdb unlikelyland_test
 *   DATABASE_URL=postgres://.../unlikelyland_test npx prisma migrate deploy
 *   TEST_DATABASE_URL=postgres://.../unlikelyland_test \
 *     npm run test:integration -w @unlikelyland/api
 *
 * Without TEST_DATABASE_URL the suite skips itself, so it never breaks the
 * default unit run or CI.
 */
const url = process.env.TEST_DATABASE_URL;

describe.runIf(!!url)('RelationshipService (integration)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const rel = new RelationshipService(prisma as never);
  const suffix = randomUUID().slice(0, 8);

  let regionId: string;
  let userAId: string;
  let userBId: string;
  let charAId: string;
  let charBId: string;

  beforeAll(async () => {
    const region = await prisma.regionSet.create({ data: { key: `it-${suffix}`, name: `IT Region ${suffix}` } });
    regionId = region.id;

    const userA = await prisma.user.create({ data: { username: `it-a-${suffix}`, displayName: `ITA-${suffix}`, passwordHash: 'x' } });
    const userB = await prisma.user.create({ data: { username: `it-b-${suffix}`, displayName: `ITB-${suffix}`, passwordHash: 'x' } });
    userAId = userA.id;
    userBId = userB.id;

    const charA = await prisma.character.create({
      data: { userId: userA.id, displayName: `ITA-${suffix}`, regionSetId: region.id, stats: { create: {} } },
    });
    const charB = await prisma.character.create({
      data: { userId: userB.id, displayName: `ITB-${suffix}`, regionSetId: region.id, stats: { create: {} } },
    });
    charAId = charA.id;
    charBId = charB.id;

    // A blocks B (one direction).
    await prisma.blockedUser.create({ data: { characterId: charAId, blockedCharacterId: charBId } });
  });

  afterAll(async () => {
    await prisma.blockedUser.deleteMany({ where: { OR: [{ characterId: charAId }, { blockedCharacterId: charAId }] } });
    if (userAId) await prisma.user.delete({ where: { id: userAId } }); // cascades to character A
    if (userBId) await prisma.user.delete({ where: { id: userBId } });
    if (regionId) await prisma.regionSet.delete({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it('enforces a block bidirectionally even though only A blocked B', async () => {
    expect(await rel.isBlockedEitherWay(charAId, charBId)).toBe(true);
    expect(await rel.isBlockedEitherWay(charBId, charAId)).toBe(true);
  });

  it('lists the other party from both perspectives in blockedIdsForFeed', async () => {
    expect(await rel.blockedIdsForFeed(charAId)).toContain(charBId);
    expect(await rel.blockedIdsForFeed(charBId)).toContain(charAId);
  });

  it('reports isBlocked in the viewer relationship status', async () => {
    const rA = await rel.relationshipStatus(charAId, charBId);
    expect(rA.isBlocked).toBe(true);
    expect(rA.isFriend).toBe(false);
  });
});
