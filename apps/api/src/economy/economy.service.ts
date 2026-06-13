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

  /** Spend normal currency (Clams), e.g. to pay for a faster revive. */
  async spendNormal(
    tx: Prisma.TransactionClient,
    characterId: string,
    amount: number,
    reason: string,
    refId?: string,
  ): Promise<void> {
    if (amount <= 0) return;
    const character = await tx.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { normalMoney: true },
    });
    if (character.normalMoney < amount) {
      throw new BadRequestException('Not enough Clams');
    }
    await tx.character.update({
      where: { id: characterId },
      data: { normalMoney: { decrement: amount } },
    });
    await tx.economyTransaction.create({
      data: { characterId, currency: 'normal', amount: -amount, reason, refType: 'spend', refId },
    });
  }
}
