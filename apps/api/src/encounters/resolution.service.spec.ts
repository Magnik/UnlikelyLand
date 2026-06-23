import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ResolutionService } from './resolution.service';

const snapshot = {
  narrative: 'n',
  check: { statFocus: 'strength', statValue: 5, difficulty: 10, roll: 10, total: 15, success: true, margin: 5 },
  combat: null,
  rewards: { xp: 1, currencies: {}, items: [] },
  statNudges: [],
  died: false,
  deathReason: null,
};

function makeSvc(over: { encounter?: any; character?: any; expedition?: any } = {}) {
  const prisma = {
    encounter: { findUnique: vi.fn().mockResolvedValue(over.encounter ?? null) },
    character: { findUniqueOrThrow: vi.fn().mockResolvedValue(over.character ?? { id: 'c1', isDead: false, xp: 0, stats: {} }) },
    expedition: { findUnique: vi.fn().mockResolvedValue(over.expedition ?? null) },
    $transaction: vi.fn(),
  } as any;
  const characters = {
    buildView: vi.fn().mockResolvedValue({ id: 'c1' }),
    getEffectiveStats: vi.fn(),
  } as any;
  const encounters = { currentEncounterView: vi.fn().mockResolvedValue(null) } as any;
  const empty = {} as any;
  const svc = new ResolutionService(prisma, characters, empty, empty, empty, encounters, empty);
  return { svc, prisma };
}

describe('ResolutionService.resolve guards + idempotency', () => {
  it('404s when the encounter belongs to another character', async () => {
    const { svc } = makeSvc({ encounter: { id: 'e1', characterId: 'someone-else', resolved: false } });
    await expect(svc.resolve('c1', { encounterId: 'e1', choiceId: 'go' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replays the stored snapshot on a matching clientRequestId without re-running the transaction', async () => {
    const { svc, prisma } = makeSvc({
      encounter: { id: 'e1', characterId: 'c1', resolved: true, clientRequestId: 'req1', resolution: snapshot, expeditionId: null },
    });
    const view = await svc.resolve('c1', { encounterId: 'e1', choiceId: 'go', clientRequestId: 'req1' } as any);
    expect(view.narrative).toBe('n');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('conflicts when re-resolving with a different (or absent) clientRequestId', async () => {
    const { svc } = makeSvc({
      encounter: { id: 'e1', characterId: 'c1', resolved: true, clientRequestId: 'req1', resolution: snapshot, expeditionId: null },
    });
    await expect(svc.resolve('c1', { encounterId: 'e1', choiceId: 'go', clientRequestId: 'different' } as any)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.resolve('c1', { encounterId: 'e1', choiceId: 'go' } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects resolving while downed (no rewards possible from a dead character)', async () => {
    const { svc, prisma } = makeSvc({
      encounter: { id: 'e1', characterId: 'c1', resolved: false, payload: { choices: [] } },
      character: { id: 'c1', isDead: true, xp: 0, stats: {} },
    });
    await expect(svc.resolve('c1', { encounterId: 'e1', choiceId: 'go' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects resolving a dangling encounter whose expedition is no longer active', async () => {
    const { svc, prisma } = makeSvc({
      encounter: { id: 'e1', characterId: 'c1', resolved: false, expeditionId: 'exp1', payload: { choices: [] } },
      expedition: { status: 'abandoned' },
    });
    await expect(svc.resolve('c1', { encounterId: 'e1', choiceId: 'go' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
