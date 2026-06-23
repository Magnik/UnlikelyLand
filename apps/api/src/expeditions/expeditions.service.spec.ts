import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExpeditionsService } from './expeditions.service';
import { LOCATIONS } from '../content/locations';

function expeditionRow(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    characterId: 'c1',
    type: 'explore',
    status: 'active',
    step: 1,
    maxSteps: 3,
    staminaPerStep: 10,
    premise: 'p',
    goal: 'g',
    regionName: 'The Foo',
    startedAt: new Date(0),
    endedAt: null,
    summary: null,
    ...over,
  };
}

describe('ExpeditionsService.advanceStep (decoupled, race-safe next-encounter)', () => {
  const content = () => ({ encounter: { itemConceptSuggestions: [] }, source: 'ai', regionSetId: 'rs1' });

  it('returns the existing encounter scoped to THIS expedition, without charging or regenerating', async () => {
    const prisma = {
      expedition: { findUnique: vi.fn().mockResolvedValue(expeditionRow()), update: vi.fn() },
      $transaction: vi.fn(),
    } as any;
    const characters = { consumeStamina: vi.fn() } as any;
    const encounters = {
      currentEncounterForExpedition: vi.fn().mockResolvedValue({ id: 'enc-existing' }),
      generateStepContent: vi.fn(),
      createStepEncounter: vi.fn(),
    } as any;
    const svc = new ExpeditionsService(prisma, characters, encounters);

    const res = await svc.advanceStep('c1', 'e1');
    expect(res.encounter).toEqual({ id: 'enc-existing' });
    expect(encounters.currentEncounterForExpedition).toHaveBeenCalledWith('c1', 'e1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(encounters.generateStepContent).not.toHaveBeenCalled();
  });

  it('charges stamina and persists the next step atomically when none exists yet', async () => {
    const prisma = {
      expedition: { findUnique: vi.fn().mockResolvedValue(expeditionRow({ step: 1 })), update: vi.fn() },
      $transaction: vi.fn(async (cb: any) => cb({})),
    } as any;
    const characters = { consumeStamina: vi.fn().mockResolvedValue(undefined) } as any;
    const encounters = {
      currentEncounterForExpedition: vi.fn().mockResolvedValue(null),
      generateStepContent: vi.fn().mockResolvedValue(content()),
      createStepEncounter: vi.fn().mockResolvedValue({ id: 'enc-new' }),
      ingestStepConcepts: vi.fn().mockResolvedValue(undefined),
    } as any;
    const svc = new ExpeditionsService(prisma, characters, encounters);

    const res = await svc.advanceStep('c1', 'e1');
    expect(characters.consumeStamina).toHaveBeenCalledWith({}, 'c1', 10);
    // expedition.step is 1, so the next step is 2. The create runs inside the tx ({}).
    expect(encounters.generateStepContent).toHaveBeenCalledWith('c1', 'e1', 2);
    expect(encounters.createStepEncounter).toHaveBeenCalledWith({}, 'c1', 'e1', 2, expect.anything());
    expect(res.encounter).toEqual({ id: 'enc-new' });
  });

  it('returns the winner without double-charging when a concurrent advance already claimed the step (P2002)', async () => {
    const prisma = {
      expedition: { findUnique: vi.fn().mockResolvedValue(expeditionRow()), update: vi.fn() },
      $transaction: vi
        .fn()
        .mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' })),
    } as any;
    const characters = { consumeStamina: vi.fn() } as any;
    const encounters = {
      currentEncounterForExpedition: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'enc-winner' }),
      generateStepContent: vi.fn().mockResolvedValue(content()),
      createStepEncounter: vi.fn(),
      ingestStepConcepts: vi.fn(),
    } as any;
    const svc = new ExpeditionsService(prisma, characters, encounters);

    const res = await svc.advanceStep('c1', 'e1');
    expect(res.encounter).toEqual({ id: 'enc-winner' });
    expect(prisma.expedition.update).not.toHaveBeenCalled();
  });

  it('ends the expedition with no encounter when the player is out of stamina', async () => {
    const prisma = {
      expedition: {
        findUnique: vi.fn().mockResolvedValue(expeditionRow()),
        update: vi
          .fn()
          .mockResolvedValue(expeditionRow({ status: 'completed', endedAt: new Date(0), summary: 'Ran out of steam and headed back.' })),
      },
      $transaction: vi.fn(async (cb: any) => cb({})),
    } as any;
    const characters = { consumeStamina: vi.fn().mockRejectedValue(new BadRequestException('Not enough stamina')) } as any;
    const encounters = {
      currentEncounterForExpedition: vi.fn().mockResolvedValue(null),
      generateStepContent: vi.fn().mockResolvedValue(content()),
      createStepEncounter: vi.fn(),
      ingestStepConcepts: vi.fn(),
    } as any;
    const svc = new ExpeditionsService(prisma, characters, encounters);

    const res = await svc.advanceStep('c1', 'e1');
    expect(res.encounter).toBeNull();
    expect(prisma.expedition.update).toHaveBeenCalled();
    expect(encounters.createStepEncounter).not.toHaveBeenCalled();
  });

  it('404s when the expedition belongs to another character', async () => {
    const prisma = {
      expedition: { findUnique: vi.fn().mockResolvedValue(expeditionRow({ characterId: 'someone-else' })) },
      $transaction: vi.fn(),
    } as any;
    const encounters = { currentEncounterForExpedition: vi.fn() } as any;
    const svc = new ExpeditionsService(prisma, {} as any, encounters);
    await expect(svc.advanceStep('c1', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ExpeditionsService.start (narrative framing)', () => {
  it('locks one region and stores an interpolated premise + goal', async () => {
    let createArgs: any;
    const created = expeditionRow();
    const prisma = {
      character: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'c1', isDead: false, regionSetId: 'rs1' }) },
      expedition: { findFirst: vi.fn().mockResolvedValue(null) },
      region: { findMany: vi.fn().mockResolvedValue([{ name: 'The Foo' }]) },
      $transaction: vi.fn(async (cb: any) =>
        cb({
          expedition: {
            create: vi.fn(async (a: any) => {
              createArgs = a;
              return created;
            }),
          },
        }),
      ),
    } as any;
    const characters = { consumeStamina: vi.fn() } as any;
    const encounters = { generateForStep: vi.fn().mockResolvedValue({ id: 'enc' }) } as any;
    const svc = new ExpeditionsService(prisma, characters, encounters);

    const res = await svc.start('c1', 'explore');
    expect(createArgs.data.regionName).toBe('The Foo');
    expect(createArgs.data.premise).toContain('The Foo');
    expect(createArgs.data.goal).toContain('The Foo');
    expect(res.encounter).toEqual({ id: 'enc' });
  });

  it('locks ONE hardcoded catalog location for the region set (no DB region fallback)', async () => {
    let createArgs: any;
    const prisma = {
      character: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: 'c1', isDead: false, regionSetId: 'rs1', regionSet: { key: 'damply-heroic-coast' } }),
      },
      expedition: { findFirst: vi.fn().mockResolvedValue(null) },
      region: { findMany: vi.fn() },
      $transaction: vi.fn(async (cb: any) =>
        cb({
          expedition: {
            create: vi.fn(async (a: any) => {
              createArgs = a;
              return expeditionRow();
            }),
          },
        }),
      ),
    } as any;
    const characters = { consumeStamina: vi.fn() } as any;
    const encounters = { generateForStep: vi.fn().mockResolvedValue({ id: 'enc' }) } as any;
    const svc = new ExpeditionsService(prisma, characters, encounters);

    await svc.start('c1', 'explore');
    const validNames = LOCATIONS['damply-heroic-coast'].map((l) => l.name);
    expect(validNames).toContain(createArgs.data.regionName);
    // The catalog had an entry, so the seeded-region DB fallback must not be used.
    expect(prisma.region.findMany).not.toHaveBeenCalled();
  });

  it('refuses to start a non-selectable (folded) expedition type', async () => {
    const prisma = {
      character: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'c1', isDead: false, regionSetId: 'rs1' }) },
      expedition: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const svc = new ExpeditionsService(prisma, {} as any, {} as any);
    await expect(svc.start('c1', 'work' as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ExpeditionsService.listTypes (consolidated picker set)', () => {
  it('offers only the four selectable pillars, each with a distinct identity', () => {
    const svc = new ExpeditionsService({} as any, {} as any, {} as any);
    const types = svc.listTypes();
    expect(types.map((t) => t.type).sort()).toEqual(['explore', 'fight', 'scavenge', 'socialize']);
    for (const t of types) {
      expect(t.icon).toBeTruthy();
      expect(t.specialty).toBeTruthy();
      expect(t.rewardHint).toBeTruthy();
      expect(t.accent).toMatch(/^#/);
    }
  });
});
