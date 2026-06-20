import { describe, it, expect, vi } from 'vitest';
import { AchievementsService } from './achievements.service';

const CATALOG = [
  { id: 'A', key: 'first-steps', name: 'First Steps' },
  { id: 'B', key: 'first-victory', name: 'First Victory' },
  { id: 'C', key: 'survived-something-ridiculous', name: 'Survived Something Ridiculous' },
  { id: 'D', key: 'reached-level-5', name: 'Getting the Hang of It' },
  { id: 'E', key: 'reached-level-10', name: 'Double Digits' },
  { id: 'F', key: 'earned-first-rare-item', name: 'Treasure Hunter' },
  { id: 'G', key: 'first-death', name: 'Mostly Dead' },
];

function makePrisma() {
  return {
    achievement: { findMany: vi.fn().mockResolvedValue(CATALOG) },
    characterAchievement: { findMany: vi.fn() },
    activityEvent: { findMany: vi.fn() },
  } as any;
}

function makeTx(alreadyHeld: string[] = []) {
  return {
    characterAchievement: {
      findMany: vi.fn().mockResolvedValue(alreadyHeld.map((id) => ({ achievementId: id }))),
      upsert: vi.fn().mockResolvedValue({}),
    },
    activityEvent: { create: vi.fn().mockResolvedValue({}) },
    character: { update: vi.fn().mockResolvedValue({}) },
  } as any;
}

describe('AchievementsService.award (idempotency)', () => {
  it('only unlocks (and returns) keys not already held, and ignores unknown keys', async () => {
    const svc = new AchievementsService(makePrisma(), {} as any);
    const tx = makeTx(['A']); // already has first-steps
    const newly = await svc.award(tx, 'c1', ['first-steps', 'first-victory', 'totally-unknown']);
    expect(newly).toEqual(['first-victory']);
    expect(tx.characterAchievement.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns [] when nothing new is unlocked', async () => {
    const svc = new AchievementsService(makePrisma(), {} as any);
    const tx = makeTx(['A', 'B']);
    const newly = await svc.award(tx, 'c1', ['first-steps', 'first-victory']);
    expect(newly).toEqual([]);
    expect(tx.characterAchievement.upsert).not.toHaveBeenCalled();
  });
});

describe('AchievementsService.evaluateEncounter', () => {
  it('awards the right achievements for a surviving ridiculous combat win that hits level 5 with a rare drop', async () => {
    const svc = new AchievementsService(makePrisma(), {} as any);
    const tx = makeTx([]);
    await svc.evaluateEncounter(tx, 'c1', {
      died: false,
      riskLevel: 'ridiculous',
      wonCombat: true,
      oldLevel: 4,
      newLevel: 5,
      droppedRarity: 'rare',
    });
    // first-steps, survived-something-ridiculous, first-victory, reached-level-5, earned-first-rare-item
    expect(tx.characterAchievement.upsert).toHaveBeenCalledTimes(5);
    // Activity emitted for each new achievement (5) + one level milestone for reaching 5.
    expect(tx.activityEvent.create).toHaveBeenCalledTimes(6);
  });

  it('awards first-death on death and not victory/level achievements', async () => {
    const svc = new AchievementsService(makePrisma(), {} as any);
    const tx = makeTx([]);
    await svc.evaluateEncounter(tx, 'c1', {
      died: true,
      riskLevel: 'high',
      wonCombat: false,
      oldLevel: 7,
      newLevel: 7,
      droppedRarity: null,
    });
    // first-steps + first-death only.
    expect(tx.characterAchievement.upsert).toHaveBeenCalledTimes(2);
  });
});
