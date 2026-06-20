import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateGuildInput,
  GuildRole,
  GuildSummary,
  GuildView,
  UpdateGuildInput,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { moderateText, moderateDisplayName } from '../ai/moderation';
import { AchievementsService } from '../achievements/achievements.service';
import { EconomyService } from '../economy/economy.service';

/** Guild level derived from accumulated guild XP (1 + floor(sqrt(xp / 100))). */
export function guildLevelFromXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

/** Guild XP earned per Oddment deposited into the bank. */
const XP_PER_ODDMENT = 1;

/**
 * Guild lifecycle + roles. One guild per character (DB-enforced). Names/tags/
 * descriptions are moderated. Roles are owner (founder) → officer → member, with
 * server-side rank checks on every privileged action and transactions wherever
 * more than one row changes. The owner cannot abandon a populated guild: they
 * must transfer ownership or remove the other members first.
 */
@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly achievements: AchievementsService,
    private readonly economy: EconomyService,
  ) {}

  async list(q?: string, page = 1): Promise<GuildSummary[]> {
    const term = (q ?? '').trim();
    const guilds = await this.prisma.guild.findMany({
      where: term
        ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { tag: { contains: term.toUpperCase() } }] }
        : undefined,
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (Math.max(1, page) - 1) * 25,
      take: 25,
    });
    return guilds.map((g) => ({
      id: g.id,
      name: g.name,
      tag: g.tag,
      description: g.description,
      memberCount: g._count.members,
    }));
  }

  async view(guildId: string, viewerCharacterId: string): Promise<GuildView> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: {
        members: {
          include: { character: { select: { displayName: true, level: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!guild) throw new NotFoundException('Guild not found');

    const members = guild.members.map((m) => ({
      characterId: m.characterId,
      displayName: m.character.displayName,
      role: m.role as GuildRole,
      level: m.character.level,
      joinedAt: m.joinedAt.toISOString(),
    }));
    // Owner first, then officers, then members — by rank, then join order.
    const rank: Record<GuildRole, number> = { owner: 0, officer: 1, member: 2 };
    members.sort((a, b) => rank[a.role] - rank[b.role]);

    const mine = members.find((m) => m.characterId === viewerCharacterId);
    return {
      id: guild.id,
      name: guild.name,
      tag: guild.tag,
      description: guild.description,
      ownerCharacterId: guild.ownerCharacterId,
      memberCount: members.length,
      bankBalance: guild.bankBalance,
      xp: guild.xp,
      level: guildLevelFromXp(guild.xp),
      createdAt: guild.createdAt.toISOString(),
      members,
      isMine: !!mine,
      myRole: mine ? mine.role : null,
    };
  }

  /** Deposit Oddments into the guild bank (any member). Grants the guild XP. */
  async depositToBank(characterId: string, amount: number): Promise<GuildView> {
    const member = await this.prisma.guildMember.findUnique({ where: { characterId }, select: { guildId: true } });
    if (!member) throw new BadRequestException('You are not in a guild');

    await this.prisma.$transaction(async (tx) => {
      // Atomic, race-safe debit of the member's Oddments (also writes the ledger).
      // Throws BadRequestException if they can't afford it, so concurrent deposits
      // can never drive their balance negative.
      await this.economy.spendCrafting(tx, characterId, amount, 'guild:deposit', member.guildId);
      await tx.guild.update({
        where: { id: member.guildId },
        data: { bankBalance: { increment: amount }, xp: { increment: amount * XP_PER_ODDMENT } },
      });
    });
    return this.view(member.guildId, characterId);
  }

  /** Withdraw Oddments from the guild bank (owner/officer only). */
  async withdrawFromBank(characterId: string, amount: number): Promise<GuildView> {
    const caller = await this.requireRole(characterId, ['owner', 'officer']);

    await this.prisma.$transaction(async (tx) => {
      // Atomic claim on the bank balance: the affordability check and the decrement
      // are one conditional update, so concurrent withdrawals can't overdraw the bank.
      const debited = await tx.guild.updateMany({
        where: { id: caller.guildId, bankBalance: { gte: amount } },
        data: { bankBalance: { decrement: amount } },
      });
      if (debited.count === 0) throw new BadRequestException('The guild bank does not hold that many Oddments');
      await this.economy.applyDeltas(tx, characterId, { crafting: amount }, 'guild:withdraw', caller.guildId);
    });
    return this.view(caller.guildId, characterId);
  }

  async mine(characterId: string): Promise<GuildView | null> {
    const membership = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (!membership) return null;
    return this.view(membership.guildId, characterId);
  }

  async create(characterId: string, dto: CreateGuildInput): Promise<GuildView> {
    const existing = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (existing) throw new BadRequestException('Leave your current guild first');

    const nameCheck = moderateDisplayName(dto.name);
    if (!nameCheck.safe) throw new BadRequestException(`Guild name rejected (${nameCheck.reason ?? 'unsafe'})`);
    if (dto.description) {
      const descCheck = moderateText(dto.description, 'pg13');
      if (!descCheck.safe) throw new BadRequestException('Guild description blocked by moderation');
    }
    if (dto.tag) {
      const tagCheck = moderateDisplayName(dto.tag);
      if (!tagCheck.safe) throw new BadRequestException('Guild tag blocked by moderation');
    }

    const nameTaken = await this.prisma.guild.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (nameTaken) throw new ConflictException('That guild name is taken');
    if (dto.tag) {
      const tagTaken = await this.prisma.guild.findUnique({ where: { tag: dto.tag }, select: { id: true } });
      if (tagTaken) throw new ConflictException('That guild tag is taken');
    }

    const guild = await this.prisma.$transaction(async (tx) => {
      const g = await tx.guild.create({
        data: { name: dto.name, tag: dto.tag ?? null, description: dto.description ?? '', ownerCharacterId: characterId },
      });
      await tx.guildMember.create({ data: { guildId: g.id, characterId, role: 'owner' } });
      await this.achievements.onGuildFounded(tx, characterId, g.name);
      return g;
    });
    return this.view(guild.id, characterId);
  }

  async join(characterId: string, guildId: string): Promise<GuildView> {
    const existing = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (existing) throw new BadRequestException('Leave your current guild first');
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId }, select: { id: true, name: true } });
    if (!guild) throw new NotFoundException('Guild not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.guildMember.create({ data: { guildId, characterId, role: 'member' } });
      await this.achievements.onGuildJoined(tx, characterId, guild.name);
    });
    return this.view(guildId, characterId);
  }

  async leave(characterId: string): Promise<{ left: boolean }> {
    const membership = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (!membership) throw new BadRequestException('You are not in a guild');

    const memberCount = await this.prisma.guildMember.count({ where: { guildId: membership.guildId } });
    if (membership.role === 'owner' && memberCount > 1) {
      throw new ForbiddenException('As owner you must transfer ownership or remove the other members before leaving');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.guildMember.delete({ where: { characterId } });
      if (membership.role === 'owner') {
        await tx.guild.delete({ where: { id: membership.guildId } });
      }
    });
    return { left: true };
  }

  async updateGuild(characterId: string, dto: UpdateGuildInput): Promise<GuildView> {
    const caller = await this.requireRole(characterId, ['owner', 'officer']);
    const data: Prisma.GuildUpdateInput = {};
    if (dto.description !== undefined) {
      const mod = moderateText(dto.description, 'pg13');
      if (!mod.safe) throw new BadRequestException('Guild description blocked by moderation');
      data.description = dto.description;
    }
    if (dto.tag !== undefined) {
      if (dto.tag === null) {
        data.tag = null;
      } else {
        const mod = moderateDisplayName(dto.tag);
        if (!mod.safe) throw new BadRequestException('Guild tag blocked by moderation');
        const taken = await this.prisma.guild.findFirst({
          where: { tag: dto.tag, id: { not: caller.guildId } },
          select: { id: true },
        });
        if (taken) throw new ConflictException('That guild tag is taken');
        data.tag = dto.tag;
      }
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.guild.update({ where: { id: caller.guildId }, data });
    }
    return this.view(caller.guildId, characterId);
  }

  async promote(characterId: string, targetId: string): Promise<GuildView> {
    const caller = await this.requireRole(characterId, ['owner']);
    const target = await this.memberInGuild(targetId, caller.guildId);
    if (target.role !== 'member') throw new BadRequestException('Only a member can be promoted to officer');
    await this.prisma.guildMember.update({ where: { characterId: targetId }, data: { role: 'officer' } });
    return this.view(caller.guildId, characterId);
  }

  async demote(characterId: string, targetId: string): Promise<GuildView> {
    const caller = await this.requireRole(characterId, ['owner']);
    const target = await this.memberInGuild(targetId, caller.guildId);
    if (target.role !== 'officer') throw new BadRequestException('Only an officer can be demoted');
    await this.prisma.guildMember.update({ where: { characterId: targetId }, data: { role: 'member' } });
    return this.view(caller.guildId, characterId);
  }

  async kick(characterId: string, targetId: string): Promise<GuildView> {
    const caller = await this.requireRole(characterId, ['owner', 'officer']);
    if (characterId === targetId) throw new BadRequestException('Use leave to exit your guild');
    const target = await this.memberInGuild(targetId, caller.guildId);
    if (target.role === 'owner') throw new ForbiddenException('The guild owner cannot be removed');
    if (caller.role === 'officer' && target.role !== 'member') {
      throw new ForbiddenException('Officers can only remove members');
    }
    await this.prisma.guildMember.delete({ where: { characterId: targetId } });
    return this.view(caller.guildId, characterId);
  }

  async transferOwnership(characterId: string, targetId: string): Promise<GuildView> {
    const caller = await this.requireRole(characterId, ['owner']);
    if (characterId === targetId) throw new BadRequestException('You already own this guild');
    await this.memberInGuild(targetId, caller.guildId);
    await this.prisma.$transaction(async (tx) => {
      await tx.guildMember.update({ where: { characterId: targetId }, data: { role: 'owner' } });
      await tx.guildMember.update({ where: { characterId }, data: { role: 'officer' } });
      await tx.guild.update({ where: { id: caller.guildId }, data: { ownerCharacterId: targetId } });
    });
    return this.view(caller.guildId, characterId);
  }

  /** Load the caller's membership and assert their role is one of `roles`. */
  private async requireRole(characterId: string, roles: GuildRole[]): Promise<{ guildId: string; role: GuildRole }> {
    const m = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (!m) throw new BadRequestException('You are not in a guild');
    if (!roles.includes(m.role as GuildRole)) throw new ForbiddenException('Your guild rank cannot do that');
    return { guildId: m.guildId, role: m.role as GuildRole };
  }

  /** Assert a target character is a member of the given guild; return their membership. */
  private async memberInGuild(characterId: string, guildId: string): Promise<{ role: GuildRole }> {
    const m = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (!m || m.guildId !== guildId) throw new NotFoundException('That player is not in your guild');
    return { role: m.role as GuildRole };
  }
}
