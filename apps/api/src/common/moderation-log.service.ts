import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ModerationActionType } from '@unlikelyland/contracts';
import { PrismaService } from './prisma.service';

export interface ModerationLogInput {
  moderatorUserId: string;
  actionType: ModerationActionType;
  targetType?: string;
  targetCharacterId?: string | null;
  targetMessageId?: string | null;
  targetGuildId?: string | null;
  targetReportId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only writer for the moderation audit trail. Every privileged action
 * (hide/delete/restore message, mute/warn/ban, guild disband/rename, report
 * resolution, role changes) records one row here with the acting moderator and a
 * timestamp. Accepts an optional transaction client so the audit row commits
 * atomically with the action it describes. Never exposes data to players.
 */
@Injectable()
export class ModerationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: ModerationLogInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.moderationAction.create({
      data: {
        moderatorUserId: input.moderatorUserId,
        actionType: input.actionType,
        targetType: input.targetType ?? '',
        targetCharacterId: input.targetCharacterId ?? null,
        targetMessageId: input.targetMessageId ?? null,
        targetGuildId: input.targetGuildId ?? null,
        targetReportId: input.targetReportId ?? null,
        reason: input.reason ?? '',
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
