import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface CurrencyDeltas {
  xp?: number;
  normal?: number;
  crafting?: number;
  reputation?: number;
  premium?: number;
}

/**
 * Centralised economy mutations. Every currency/XP change goes through here so
 * each one is (a) applied to the character row and (b) recorded as an immutable
 * EconomyTransaction for auditing and exploit investigation. All methods take a
 * Prisma transaction client — callers wrap related changes in one transaction.
 */
@Injectable()
export class EconomyService {
  async applyDeltas(
    tx: Prisma.TransactionClient,
    characterId: string,
    deltas: CurrencyDeltas,
    reason: string,
    refId?: string,
  ): Promise<void> {
    const data: Prisma.CharacterUpdateInput = {};
    if (deltas.xp) data.xp = { increment: deltas.xp };
    if (deltas.normal) data.normalMoney = { increment: deltas.normal };
    if (deltas.crafting) data.craftingResources = { increment: deltas.crafting };
    if (deltas.reputation) data.reputation = { increment: deltas.reputation };
    if (deltas.premium) data.premiumMoney = { increment: deltas.premium };

    if (Object.keys(data).length === 0) return;

    await tx.character.update({ where: { id: characterId }, data });

    const rows: Prisma.EconomyTransactionCreateManyInput[] = [];
    const push = (currency: string, amount?: number) => {
      if (amount) rows.push({ characterId, currency, amount, reason, refType: 'encounter', refId });
    };
    push('xp', deltas.xp);
    push('normal', deltas.normal);
    push('crafting', deltas.crafting);
    push('reputation', deltas.reputation);
    push('premium', deltas.premium);
    if (rows.length) await tx.economyTransaction.createMany({ data: rows });
  }

  /**
   * Record an awarded item in the reward-audit trail. Items aren't a currency,
   * but every grant is logged here (currency 'item', amount = quantity) so the
   * economy/reward history is the single place to investigate "where did this
   * item come from". Must be called inside the same transaction as the grant.
   */
  async logItemReward(
    tx: Prisma.TransactionClient,
    characterId: string,
    itemDefinitionId: string,
    quantity: number,
    reason: string,
    refId?: string,
  ): Promise<void> {
    await tx.economyTransaction.create({
      data: {
        characterId,
        currency: 'item',
        amount: quantity,
        reason,
        refType: 'item_drop',
        refId: refId ?? itemDefinitionId,
      },
    });
  }

  /** Spend normal currency (Clams), e.g. to pay for a faster revive. */
  async spendNormal(
    tx: Prisma.TransactionClient,
    characterId: string,
    amount: number,
    reason: string,
    refId?: string,
  ): Promise<void> {
    await this.spend(tx, characterId, 'normal', amount, reason, refId);
  }

  /** Spend crafting currency (Oddments), e.g. to deposit into a guild bank. */
  async spendCrafting(
    tx: Prisma.TransactionClient,
    characterId: string,
    amount: number,
    reason: string,
    refId?: string,
  ): Promise<void> {
    await this.spend(tx, characterId, 'crafting', amount, reason, refId);
  }

  /**
   * Atomic, race-safe currency debit. The affordability check and the decrement
   * are a SINGLE conditional update (`where: { <column>: { gte: amount } }`), so
   * concurrent spends can never drive a balance negative regardless of isolation
   * level — unlike a read-then-write, which can both pass the check on a stale read.
   */
  private async spend(
    tx: Prisma.TransactionClient,
    characterId: string,
    currency: 'normal' | 'crafting' | 'reputation' | 'premium',
    amount: number,
    reason: string,
    refId?: string,
  ): Promise<void> {
    if (amount <= 0) return;
    const column = SPEND_COLUMN[currency];
    const insufficient = SPEND_INSUFFICIENT[currency];
    const res = await tx.character.updateMany({
      where: { id: characterId, [column]: { gte: amount } },
      data: { [column]: { decrement: amount } },
    });
    if (res.count === 0) throw new BadRequestException(insufficient);
    await tx.economyTransaction.create({
      data: { characterId, currency, amount: -amount, reason, refType: 'spend', refId },
    });
  }
}

/** Character column backing each spendable currency. */
const SPEND_COLUMN = {
  normal: 'normalMoney',
  crafting: 'craftingResources',
  reputation: 'reputation',
  premium: 'premiumMoney',
} as const;

const SPEND_INSUFFICIENT = {
  normal: 'Not enough Clams',
  crafting: 'Not enough Oddments',
  reputation: 'Not enough Notoriety',
  premium: 'Not enough Escape Tokens',
} as const;
