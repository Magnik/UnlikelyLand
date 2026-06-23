-- Gear paperdoll overhaul:
--   * InventoryItem.equippedSlot: the paperdoll POSITION an item occupies when
--     equipped (e.g. ring1/ring2), distinct from the item's slot type so rings and
--     trinkets can fill two positions each. Null when not equipped.
--   * The item-slot taxonomy changed (armor/tool retired in favour of granular
--     head/shoulders/neck/cloak/chest/wrist/waist/legs/feet + ring/trinket). Per the
--     chosen migration, player inventories are WIPED and re-granted (the seed hands a
--     starter kit to any character with an empty bag), so nothing is left equipped in
--     a slot that no longer exists.
--   * Remap any surviving ItemDefinition rows off the retired slot values so the
--     catalog (including AI-approved items) stays valid under the new enum; the seed
--     re-slots the canonical catalog precisely afterwards.

ALTER TABLE "InventoryItem" ADD COLUMN "equippedSlot" TEXT;

-- Wipe & re-grant: clear all player inventories (the seed re-grants a starter kit).
DELETE FROM "InventoryItem";

-- Keep the catalog valid under the new slot taxonomy.
UPDATE "ItemDefinition" SET "slot" = 'chest' WHERE "slot" = 'armor';
UPDATE "ItemDefinition" SET "slot" = 'trinket' WHERE "slot" = 'tool';
