import { describe, it, expect } from 'vitest';
import {
  ItemSlotSchema,
  EQUIPMENT_SLOTS,
  SLOT_POSITIONS,
  EQUIPMENT_SLOT_LABEL,
  ITEM_SLOT_LABEL,
} from './enums';

describe('gear slot taxonomy', () => {
  it('maps every item slot to valid equipment positions and a label', () => {
    for (const slot of ItemSlotSchema.options) {
      expect(SLOT_POSITIONS[slot]).toBeDefined();
      for (const pos of SLOT_POSITIONS[slot]) {
        expect(EQUIPMENT_SLOTS).toContain(pos);
      }
      expect(ITEM_SLOT_LABEL[slot]).toBeTruthy();
    }
  });

  it('gives rings and trinkets two positions, consumables none, and single-slot items one', () => {
    expect(SLOT_POSITIONS.ring).toHaveLength(2);
    expect(SLOT_POSITIONS.trinket).toHaveLength(2);
    expect(SLOT_POSITIONS.consumable).toHaveLength(0);
    expect(SLOT_POSITIONS.weapon).toEqual(['weapon']);
    expect(SLOT_POSITIONS.chest).toEqual(['chest']);
  });

  it('labels every equipment position', () => {
    for (const pos of EQUIPMENT_SLOTS) expect(EQUIPMENT_SLOT_LABEL[pos]).toBeTruthy();
  });
});
