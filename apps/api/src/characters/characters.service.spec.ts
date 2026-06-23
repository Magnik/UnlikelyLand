import { describe, it, expect } from 'vitest';
import { SLOT_POSITIONS } from '@unlikelyland/contracts';
import { chooseEquipPosition } from './characters.service';

const RING = SLOT_POSITIONS.ring; // ['ring1', 'ring2']

describe('chooseEquipPosition', () => {
  it('fills the first empty eligible position', () => {
    expect(chooseEquipPosition(RING, [], 'new')).toBe('ring1');
    expect(chooseEquipPosition(RING, [{ id: 'x', equippedSlot: 'ring1' }], 'new')).toBe('ring2');
  });

  it('is a no-op (null) when the item is already equipped in one of its positions', () => {
    // Both rings full, re-equip the one in ring2 — must NOT evict the ring1 occupant.
    const occupied = [
      { id: 'x', equippedSlot: 'ring1' },
      { id: 'me', equippedSlot: 'ring2' },
    ];
    expect(chooseEquipPosition(RING, occupied, 'me')).toBeNull();
  });

  it('replaces the first position when all are full and the item is new', () => {
    const occupied = [
      { id: 'x', equippedSlot: 'ring1' },
      { id: 'y', equippedSlot: 'ring2' },
    ];
    expect(chooseEquipPosition(RING, occupied, 'new')).toBe('ring1');
  });

  it('honours an explicit valid position', () => {
    expect(chooseEquipPosition(RING, [], 'new', 'ring2')).toBe('ring2');
  });

  it('targets the single position for a one-slot item', () => {
    expect(chooseEquipPosition(SLOT_POSITIONS.chest, [], 'new')).toBe('chest');
  });
});
