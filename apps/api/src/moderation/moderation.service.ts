import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BanUserInput,
  ModChatMessageView,
  ModerationActionView,
  ModerationMessageActionInput,
  ModerationStatsView,
  ModerationStatus,
  ModeratedUserView,
  MuteUserInput,
  ReportTargetType,
  ReportView,
  ResolveReportInput,
  UserRole,
  WarnUserInput,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { ModerationLogService } from '../common/moderation-log.service';

/**
 * Moderator/admin tooling. Every state-changing method records a row in the
 * moderation audit trail (with the acting moderator's user id) via
 * ModerationLogService, inside the same transaction where practical. Message
 * removal is a soft status change (hidden/removed) so it is reversible; nothing
 * here exposes private story/economy/AI data — only the reported content itself.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: ModerationLogService,
  ) {}

  // ── Reports ────────────────────────────────────────────────────────────────

  async reports(status: string | undefined, limit = 100): Promise<ReportView[]> {
    const rows = await this.prisma.messageReport.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: Math.min(limit, 200),
      include: { reporter: { select: { displayName: true } } },
    });

    const chatIds = rows.filter((r) => r.targetType === 'chat' && r.targetMessageId).map((r) => r.targetMessageId!);
    const mailIds = rows.filter((r) => r.targetType === 'mail' && r.targetMessageId).map((r) => r.targetMessageId!);
    const charIds = rows.map((r) => r.targetCharacterId).filter((id): id is string => !!id);

    const [chats, mails, chars] = await Promise.all([
      this.prisma.chatMessage.findMany({ where: { id: { in: chatIds } }, select: { id: true, body: true, moderationStatus: true, reportCount: true } }),
      this.prisma.mailMessage.findMany({ where: { id: { in: mailIds } }, select: { id: true, body: true, moderationStatus: true, reportCount: true } }),
      this.prisma.character.findMany({ where: { id: { in: charIds } }, select: { id: true, displayName: true } }),
    ]);
    const chatMap = new Map(chats.map((c) => [c.id, c]));
    const mailMap = new Map(mails.map((m) => [m.id, m]));
    const charMap = new Map(chars.map((c) => [c.id, c.displayName]));

    return rows.map((r) => {
      const msg = r.targetType === 'chat' ? chatMap.get(r.targetMessageId ?? '') : r.targetType === 'mail' ? mailMap.get(r.targetMessageId ?? '') : undefined;
      return {
        id: r.id,
        targetType: r.targetType as ReportTargetType,
        reason: r.reason as ReportView['reason'],
        note: r.note,
        status: r.status as ReportView['status'],
        reporterDisplayName: r.reporter.displayName,
        reportCount: msg?.reportCount ?? 0,
        targetMessageId: r.targetMessageId,
        targetCharacterId: r.targetCharacterId,
        targetGuildId: r.targetGuildId,
        targetDisplayName: r.targetCharacterId ? charMap.get(r.targetCharacterId) ?? null : null,
        messageBody: msg?.body ?? null,
        messageStatus: (msg?.moderationStatus as ModerationStatus | undefined) ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async resolveReport(moderatorUserId: string, dto: ResolveReportInput): Promise<{ resolved: boolean }> {
    const report = await this.prisma.messageReport.findUnique({ where: { id: dto.reportId } });
    if (!report) throw new NotFoundException('Report not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.messageReport.update({
        where: { id: dto.reportId },
        data: { status: dto.status, resolvedByUserId: moderatorUserId, resolutionNote: dto.note ?? null, resolvedAt: new Date() },
      });
      await this.log.record(
        { moderatorUserId, actionType: 'resolve_report', targetType: 'report', targetReportId: dto.reportId, reason: dto.note ?? dto.status },
        tx,
      );
    });
    return { resolved: true };
  }

  // ── Message moderation ───────────────────────────────────────────────────────

  async hideMessage(moderatorUserId: string, dto: ModerationMessageActionInput): Promise<{ ok: boolean }> {
    return this.setMessageStatus(moderatorUserId, dto, 'hidden', 'hide_message');
  }

  async deleteMessage(moderatorUserId: string, dto: ModerationMessageActionInput): Promise<{ ok: boolean }> {
    return this.setMessageStatus(moderatorUserId, dto, 'removed', 'delete_message');
  }

  async restoreMessage(moderatorUserId: string, dto: ModerationMessageActionInput): Promise<{ ok: boolean }> {
    return this.setMessageStatus(moderatorUserId, dto, 'visible', 'restore_message');
  }

  private async setMessageStatus(
    moderatorUserId: string,
    dto: ModerationMessageActionInput,
    status: ModerationStatus,
    actionType: 'hide_message' | 'delete_message' | 'restore_message',
  ): Promise<{ ok: boolean }> {
    const restoring = status === 'visible';
    await this.prisma.$transaction(async (tx) => {
      if (dto.targetType === 'mail') {
        const m = await tx.mailMessage.findUnique({ where: { id: dto.messageId }, select: { id: true, senderCharacterId: true } });
        if (!m) throw new NotFoundException('Message not found');
        await tx.mailMessage.update({ where: { id: dto.messageId }, data: { moderationStatus: status } });
        await this.log.record(
          { moderatorUserId, actionType, targetType: 'mail', targetMessageId: dto.messageId, targetCharacterId: m.senderCharacterId, reason: dto.reason ?? '' },
          tx,
        );
      } else {
        const m = await tx.chatMessage.findUnique({ where: { id: dto.messageId }, select: { id: true, characterId: true } });
        if (!m) throw new NotFoundException('Message not found');
        await tx.chatMessage.update({
          where: { id: dto.messageId },
          data: {
            moderationStatus: status,
            deleted: !restoring,
            deletedAt: restoring ? null : new Date(),
            deletedByUserId: restoring ? null : moderatorUserId,
          },
        });
        await this.log.record(
          { moderatorUserId, actionType, targetType: 'chat', targetMessageId: dto.messageId, targetCharacterId: m.characterId, reason: dto.reason ?? '' },
          tx,
        );
      }
    });
    return { ok: true };
  }

  // ── User actions ─────────────────────────────────────────────────────────────

  /**
   * Role protection for destructive user actions: never let staff action an admin,
   * and only let an admin action a moderator. Prevents a moderator from muting/
   * warning/banning peers or admins, and prevents acting on yourself.
   */
  private async assertCanModerate(actorUserId: string, targetCharacterId: string): Promise<void> {
    const [actor, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actorUserId }, select: { role: true } }),
      this.prisma.character.findUnique({
        where: { id: targetCharacterId },
        select: { user: { select: { id: true, role: true } } },
      }),
    ]);
    if (!target?.user) throw new NotFoundException('Player not found');
    if (target.user.id === actorUserId) throw new ForbiddenException('You cannot use moderation tools on yourself');
    if (target.user.role === 'admin') {
      throw new ForbiddenException('You cannot take this action against an administrator');
    }
    if (target.user.role === 'moderator' && actor?.role !== 'admin') {
      throw new ForbiddenException('Only an administrator can take this action against a moderator');
    }
  }

  async mute(moderatorUserId: string, dto: MuteUserInput): Promise<{ ok: boolean }> {
    await this.assertCanModerate(moderatorUserId, dto.characterId);
    const until = new Date(Date.now() + dto.minutes * 60_000);
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.character.findUnique({ where: { id: dto.characterId }, select: { id: true } });
      if (!c) throw new NotFoundException('Player not found');
      await tx.character.update({ where: { id: dto.characterId }, data: { mutedUntil: until } });
      await this.log.record(
        { moderatorUserId, actionType: 'mute', targetType: 'character', targetCharacterId: dto.characterId, reason: dto.reason ?? '', metadata: { minutes: dto.minutes } },
        tx,
      );
    });
    return { ok: true };
  }

  async unmute(moderatorUserId: string, characterId: string): Promise<{ ok: boolean }> {
    await this.prisma.$transaction(async (tx) => {
      await tx.character.update({ where: { id: characterId }, data: { mutedUntil: null } });
      await this.log.record({ moderatorUserId, actionType: 'unmute', targetType: 'character', targetCharacterId: characterId }, tx);
    });
    return { ok: true };
  }

  async warn(moderatorUserId: string, dto: WarnUserInput): Promise<{ ok: boolean }> {
    await this.assertCanModerate(moderatorUserId, dto.characterId);
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.character.findUnique({ where: { id: dto.characterId }, select: { id: true } });
      if (!c) throw new NotFoundException('Player not found');
      await tx.character.update({ where: { id: dto.characterId }, data: { warningCount: { increment: 1 } } });
      await this.log.record(
        { moderatorUserId, actionType: 'warn', targetType: 'character', targetCharacterId: dto.characterId, reason: dto.reason },
        tx,
      );
    });
    return { ok: true };
  }

  // ── Admin-only user actions ──────────────────────────────────────────────────

  async ban(moderatorUserId: string, dto: BanUserInput): Promise<{ ok: boolean }> {
    await this.assertCanModerate(moderatorUserId, dto.characterId);
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.character.findUnique({ where: { id: dto.characterId }, select: { userId: true } });
      if (!c) throw new NotFoundException('Player not found');
      await tx.user.update({ where: { id: c.userId }, data: { bannedAt: new Date(), bannedReason: dto.reason } });
      await this.log.record(
        { moderatorUserId, actionType: 'ban', targetType: 'character', targetCharacterId: dto.characterId, reason: dto.reason },
        tx,
      );
    });
    return { ok: true };
  }

  async unban(moderatorUserId: string, characterId: string): Promise<{ ok: boolean }> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.character.findUnique({ where: { id: characterId }, select: { userId: true } });
      if (!c) throw new NotFoundException('Player not found');
      await tx.user.update({ where: { id: c.userId }, data: { bannedAt: null, bannedReason: null } });
      await this.log.record({ moderatorUserId, actionType: 'unban', targetType: 'character', targetCharacterId: characterId }, tx);
    });
    return { ok: true };
  }

  /** Grant or revoke the moderator role for a character's account (admin only). */
  async setRole(adminUserId: string, characterId: string, role: UserRole): Promise<{ ok: boolean }> {
    if (role === 'admin') throw new BadRequestException('Admins are provisioned out-of-band, not via this tool');
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.character.findUnique({ where: { id: characterId }, select: { userId: true } });
      if (!c) throw new NotFoundException('Player not found');
      await tx.user.update({ where: { id: c.userId }, data: { role } });
      await this.log.record(
        { moderatorUserId: adminUserId, actionType: role === 'moderator' ? 'promote' : 'demote', targetType: 'character', targetCharacterId: characterId, metadata: { role } },
        tx,
      );
    });
    return { ok: true };
  }

  /** Disband a guild outright (admin only) — removes members and the guild. */
  async disbandGuild(adminUserId: string, guildId: string, reason: string): Promise<{ ok: boolean }> {
    await this.prisma.$transaction(async (tx) => {
      const g = await tx.guild.findUnique({ where: { id: guildId }, select: { id: true, name: true } });
      if (!g) throw new NotFoundException('Guild not found');
      await tx.guild.delete({ where: { id: guildId } }); // cascade removes members
      await this.log.record(
        { moderatorUserId: adminUserId, actionType: 'guild_disband', targetType: 'guild', targetGuildId: guildId, reason, metadata: { name: g.name } },
        tx,
      );
    });
    return { ok: true };
  }

  // ── Read views ───────────────────────────────────────────────────────────────

  async searchUsers(q: string): Promise<ModeratedUserView[]> {
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    const chars = await this.prisma.character.findMany({
      where: { displayName: { contains: term, mode: 'insensitive' } },
      take: 25,
      orderBy: { displayName: 'asc' },
      include: { user: { select: { role: true, bannedAt: true, bannedReason: true } } },
    });
    return Promise.all(chars.map((c) => this.toModeratedUser(c)));
  }

  async userDetail(characterId: string): Promise<ModeratedUserView> {
    const c = await this.prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { role: true, bannedAt: true, bannedReason: true } } },
    });
    if (!c) throw new NotFoundException('Player not found');
    return this.toModeratedUser(c);
  }

  private async toModeratedUser(c: {
    id: string;
    displayName: string;
    level: number;
    mutedUntil: Date | null;
    warningCount: number;
    user: { role: string; bannedAt: Date | null; bannedReason: string | null };
  }): Promise<ModeratedUserView> {
    const reportsAgainst = await this.prisma.messageReport.count({ where: { targetCharacterId: c.id } });
    return {
      characterId: c.id,
      displayName: c.displayName,
      level: c.level,
      role: c.user.role as UserRole,
      mutedUntil: c.mutedUntil && c.mutedUntil.getTime() > Date.now() ? c.mutedUntil.toISOString() : null,
      warningCount: c.warningCount,
      banned: c.user.bannedAt !== null,
      bannedReason: c.user.bannedReason,
      reportsAgainst,
    };
  }

  async auditLog(limit = 100): Promise<ModerationActionView[]> {
    const rows = await this.prisma.moderationAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: { moderator: { select: { displayName: true } } },
    });
    const charIds = rows.map((r) => r.targetCharacterId).filter((id): id is string => !!id);
    const chars = await this.prisma.character.findMany({ where: { id: { in: charIds } }, select: { id: true, displayName: true } });
    const charMap = new Map(chars.map((c) => [c.id, c.displayName]));
    return rows.map((r) => ({
      id: r.id,
      actionType: r.actionType as ModerationActionView['actionType'],
      moderatorName: r.moderator.displayName,
      targetType: r.targetType,
      targetCharacterId: r.targetCharacterId,
      targetDisplayName: r.targetCharacterId ? charMap.get(r.targetCharacterId) ?? null : null,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async stats(): Promise<ModerationStatsView> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const [openReports, hiddenMessages, mutedPlayers, bannedPlayers, actionsLast7d] = await Promise.all([
      this.prisma.messageReport.count({ where: { status: 'open' } }),
      this.prisma.chatMessage.count({ where: { moderationStatus: { not: 'visible' } } }),
      this.prisma.character.count({ where: { mutedUntil: { gt: now } } }),
      this.prisma.user.count({ where: { bannedAt: { not: null } } }),
      this.prisma.moderationAction.count({ where: { createdAt: { gt: sevenDaysAgo } } }),
    ]);
    return { openReports, hiddenMessages, mutedPlayers, bannedPlayers, actionsLast7d };
  }

  /** Recent chat including hidden/removed messages, for moderation review. */
  async recentChat(limit = 100): Promise<ModChatMessageView[]> {
    const rows = await this.prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: { character: { select: { displayName: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      characterId: r.characterId,
      displayName: r.character.displayName,
      body: r.body,
      moderationStatus: r.moderationStatus as ModerationStatus,
      reportCount: r.reportCount,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
