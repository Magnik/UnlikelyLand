import {
  ItemConceptSuggestionSchema,
  RaritySchema,
  ItemSlotSchema,
  type ConsumableEffectType,
  type ItemSlot,
  type Rarity,
  type StatKey,
} from '@unlikelyland/contracts';
import { ITEM } from '../engine/rules';
import { generateBalancedModifiers } from '../engine/loot';
import { seedFromString } from '../engine/rng';
import { moderateText } from './moderation';

/**
 * The single safety gate for turning an AI (or admin) item *concept* into a real,
 * balanced ItemDefinition. The AI may only propose name / description / slot /
 * rarity / narrative purpose — it never supplies stat numbers. This validator:
 *
 *   1. Re-checks shape (slot/rarity enums, name/description length).
 *   2. Moderates all proposed text at the strictest (family) floor, because an
 *      approved item enters the GLOBAL catalog and can drop for any player.
 *   3. Generates a balanced, budget-capped stat block on the server side.
 *   4. Decides auto-approval eligibility (only low-power common/uncommon that
 *      pass every rule); everything else requires an admin.
 *
 * Nothing here trusts AI-provided power. A broken stat combination is impossible
 * by construction.
 */

export interface ItemConceptInput {
  name: string;
  description: string;
  narrativePurpose?: string;
  intendedSlot: string;
  intendedRarity: string;
}

export interface ItemConceptValidation {
  valid: boolean;
  autoApprovable: boolean;
  issues: string[];
  normalized: {
    name: string;
    description: string;
    slot: ItemSlot;
    rarity: Rarity;
    statModifiers: Partial<Record<StatKey, number>>;
    powerBudget: number;
    consumableEffectType: ConsumableEffectType;
    consumableEffectPower: number;
  };
}

/** Stamina restored by a server-minted consumable, by rarity. */
const CONSUMABLE_STAMINA_BY_RARITY: Record<Rarity, number> = {
  common: 15,
  uncommon: 25,
  rare: 40,
  epic: 60,
  legendary: 80,
  absurd: 100,
};

/**
 * Validate a proposed item concept. The moderation floor is 'family' because
 * approved items are globally visible. Always returns a fully normalized item
 * (with server-generated stats) even when invalid, so the admin UI can preview
 * what *would* be minted.
 */
export function validateItemConcept(input: ItemConceptInput): ItemConceptValidation {
  const issues: string[] = [];

  // 1. Shape re-validation (defends against admin edits and schema drift).
  const shape = ItemConceptSuggestionSchema.safeParse({
    name: input.name,
    description: input.description,
    intendedRarity: input.intendedRarity,
    intendedSlot: input.intendedSlot,
    narrativePurpose: input.narrativePurpose ?? '',
  });
  if (!shape.success) {
    issues.push(`shape: ${shape.error.issues.map((i) => i.message).join('; ')}`);
  }

  const slot = (ItemSlotSchema.safeParse(input.intendedSlot).success ? input.intendedSlot : 'trinket') as ItemSlot;
  const rarity = (RaritySchema.safeParse(input.intendedRarity).success ? input.intendedRarity : 'common') as Rarity;
  if (!ItemSlotSchema.safeParse(input.intendedSlot).success) issues.push(`invalid slot: ${input.intendedSlot}`);
  if (!RaritySchema.safeParse(input.intendedRarity).success) issues.push(`invalid rarity: ${input.intendedRarity}`);

  const name = (input.name ?? '').trim();
  const description = (input.description ?? '').trim();
  if (name.length < 1 || name.length > ITEM.NAME_MAX) issues.push(`name length out of range (1-${ITEM.NAME_MAX})`);
  if (description.length > ITEM.DESC_MAX) issues.push(`description too long (>${ITEM.DESC_MAX})`);

  // 2. Content moderation at the family floor (globally-visible item).
  const moderation = moderateText([name, description, input.narrativePurpose ?? ''].join(' \n '), 'family');
  if (!moderation.safe) issues.push(`prohibited content: ${moderation.reason ?? 'unsafe'}`);

  // 3. Server-generated, budget-capped stat block.
  const seed = seedFromString(`item:${name}:${slot}:${rarity}`);
  const { statModifiers, powerBudget } = generateBalancedModifiers(slot, rarity, seed);

  // Consumables carry an effect instead of stat modifiers.
  let consumableEffectType: ConsumableEffectType = 'none';
  let consumableEffectPower = 0;
  if (slot === 'consumable') {
    consumableEffectType = 'stamina';
    consumableEffectPower = CONSUMABLE_STAMINA_BY_RARITY[rarity];
  }

  // 4. Economy impact / power-budget guard (defensive; generator already caps).
  const budgetCeiling = ITEM.RARITY_POWER_BUDGET[rarity] ?? 3;
  if (powerBudget > budgetCeiling) issues.push(`power budget ${powerBudget} exceeds ceiling ${budgetCeiling}`);

  const valid = issues.length === 0;
  const autoApprovable =
    valid && ITEM.AUTO_APPROVE_RARITIES.has(rarity) && powerBudget <= ITEM.AUTO_APPROVE_MAX_POWER;

  return {
    valid,
    autoApprovable,
    issues,
    normalized: {
      name: name || 'Unnamed Oddity',
      description,
      slot,
      rarity,
      statModifiers,
      powerBudget,
      consumableEffectType,
      consumableEffectPower,
    },
  };
}
