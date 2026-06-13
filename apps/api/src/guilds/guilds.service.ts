import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateGuildInput, GuildSummary, GuildView } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';

/**
 * Guild lifecycle (MVP): create, join, leave, view. One guild per character.
 * The owner can only leave once they are the sole member (which deletes the
 * guild) — otherwise they must remove members / transfer first.
 */
@Injectable()
export class GuildsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<GuildSummary[]> {
    const guilds = await this.prisma.guild.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return guilds.map((g) => ({ id: g.id, name: g.name, description: g.description, memberCount: g._count.members }));
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
      role: m.role as 'owner' | 'officer' | 'member',
      level: m.character.level,
      joinedAt: m.joinedAt.toISOString(),
    }));

    return {
      id: guild.id,
      name: guild.name,
      description: guild.description,
      ownerCharacterId: guild.ownerCharacterId,
      memberCount: members.length,
      createdAt: guild.createdAt.toISOString(),
      members,
      isMine: members.some((m) => m.characterId === viewerCharacterId),
    };
  }

  async mine(characterId: string): Promise<GuildView | null> {
    const membership = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (!membership) return null;
    return this.view(membership.guildId, characterId);
  }

  async create(characterId: string, dto: CreateGuildInput): Promise<GuildView> {
    const existing = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (existing) throw new BadRequestException('Leave your current guild first');
    const nameTaken = await this.prisma.guild.findUnique({ where: { name: dto.name } });
    if (nameTaken) throw new ConflictException('That guild name is taken');

    const guild = await this.prisma.$transaction(async (tx) => {
      const g = await tx.guild.create({
        data: { name: dto.name, description: dto.description ?? '', ownerCharacterId: characterId },
      });
      await tx.guildMember.create({ data: { guildId: g.id, characterId, role: 'owner' } });
      return g;
    });
    return this.view(guild.id, characterId);
  }

  async join(characterId: string, guildId: string): Promise<GuildView> {
    const existing = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (existing) throw new BadRequestException('Leave your current guild first');
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new NotFoundException('Guild not found');
    await this.prisma.guildMember.create({ data: { guildId, characterId, role: 'member' } });
    return this.view(guildId, characterId);
  }

  async leave(characterId: string): Promise<{ left: boolean }> {
    const membership = await this.prisma.guildMember.findUnique({ where: { characterId } });
    if (!membership) throw new BadRequestException('You are not in a guild');

    const memberCount = await this.prisma.guildMember.count({ where: { guildId: membership.guildId } });
    if (membership.role === 'owner' && memberCount > 1) {
      throw new ForbiddenException('As owner you must remove the other members before leaving');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.guildMember.delete({ where: { characterId } });
      if (membership.role === 'owner') {
        await tx.guild.delete({ where: { id: membership.guildId } });
      }
    });
    return { left: true };
  }
}
