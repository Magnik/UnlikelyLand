import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateReportInput } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';

/**
 * Player-facing reporting. A report identifies an offending message/profile/guild
 * and a reason; the server derives the offending author so moderators have context.
 * Reporters are never revealed to the reported party, and a player cannot report
 * the same message twice (enforced by a unique constraint for messages and an
 * explicit check for profiles/guilds). Reporting bumps the target's reportCount so
 * heavily-reported content surfaces to moderators.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reporterCharacterId: string, dto: CreateReportInput): Promise<{ reported: boolean }> {
    let targetCharacterId: string | null = dto.targetCharacterId ?? null;

    if (dto.targetType === 'chat') {
      const m = await this.prisma.chatMessage.findUnique({
        where: { id: dto.targetMessageId! },
        select: { characterId: true },
      });
      if (!m) throw new NotFoundException('Message not found');
      if (m.characterId === reporterCharacterId) throw new BadRequestException('You cannot report your own message');
      targetCharacterId = m.characterId;
    } else if (dto.targetType === 'mail') {
      const m = await this.prisma.mailMessage.findUnique({
        where: { id: dto.targetMessageId! },
        select: { senderCharacterId: true, recipientCharacterId: true },
      });
      if (!m) throw new NotFoundException('Message not found');
      // Only the recipient can report mail (it is private to the two parties).
      if (m.recipientCharacterId !== reporterCharacterId) throw new ForbiddenException('You can only report mail sent to you');
      targetCharacterId = m.senderCharacterId;
    } else if (dto.targetType === 'profile') {
      if (dto.targetCharacterId === reporterCharacterId) throw new BadRequestException('You cannot report yourself');
      // De-dupe profile/guild reports (no message id to key the unique index on).
      const dup = await this.prisma.messageReport.findFirst({
        where: { reporterCharacterId, targetType: 'profile', targetCharacterId: dto.targetCharacterId },
        select: { id: true },
      });
      if (dup) return { reported: true };
    } else if (dto.targetType === 'guild') {
      const dup = await this.prisma.messageReport.findFirst({
        where: { reporterCharacterId, targetType: 'guild', targetGuildId: dto.targetGuildId },
        select: { id: true },
      });
      if (dup) return { reported: true };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.messageReport.create({
          data: {
            reporterCharacterId,
            targetType: dto.targetType,
            targetMessageId: dto.targetMessageId ?? null,
            targetCharacterId,
            targetGuildId: dto.targetGuildId ?? null,
            reason: dto.reason,
            note: dto.note ?? '',
          },
        });
        if (dto.targetType === 'chat') {
          await tx.chatMessage.update({ where: { id: dto.targetMessageId! }, data: { reportCount: { increment: 1 } } });
        } else if (dto.targetType === 'mail') {
          await tx.mailMessage.update({ where: { id: dto.targetMessageId! }, data: { reportCount: { increment: 1 } } });
        }
      });
    } catch (e) {
      // Unique violation = the same reporter already reported this message. Treat
      // as success so the reporter learns nothing about prior reports.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { reported: true };
      }
      throw e;
    }

    return { reported: true };
  }
}
