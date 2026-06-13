import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ChatMessageView } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { moderateText } from '../ai/moderation';

/** Simple per-character rate limit: at most RATE_MAX messages per window. */
const RATE_WINDOW_MS = 30_000;
const RATE_MAX = 5;

/**
 * Global chat (MVP): a moderated, rate-limited, polled message feed. Blocking is
 * honoured — a viewer never sees messages from characters they've blocked.
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewerCharacterId: string, limit = 50): Promise<ChatMessageView[]> {
    const blocks = await this.prisma.blockedUser.findMany({
      where: { characterId: viewerCharacterId },
      select: { blockedCharacterId: true },
    });
    const blockedIds = blocks.map((b) => b.blockedCharacterId);

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        channel: 'global',
        deleted: false,
        ...(blockedIds.length ? { characterId: { notIn: blockedIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: { character: { select: { displayName: true } } },
    });

    // Return oldest→newest for natural chat order.
    return rows.reverse().map((r) => ({
      id: r.id,
      characterId: r.characterId,
      displayName: r.character.displayName,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      mine: r.characterId === viewerCharacterId,
    }));
  }

  async send(characterId: string, body: string): Promise<ChatMessageView> {
    const trimmed = body.trim();
    const moderation = moderateText(trimmed, 'pg13');
    if (!moderation.safe) {
      throw new BadRequestException('Message blocked by moderation');
    }

    const since = new Date(Date.now() - RATE_WINDOW_MS);
    const recent = await this.prisma.chatMessage.count({ where: { characterId, createdAt: { gt: since } } });
    if (recent >= RATE_MAX) {
      throw new HttpException('You are sending messages too quickly', HttpStatus.TOO_MANY_REQUESTS);
    }

    const row = await this.prisma.chatMessage.create({
      data: { characterId, channel: 'global', body: trimmed },
      include: { character: { select: { displayName: true } } },
    });

    return {
      id: row.id,
      characterId: row.characterId,
      displayName: row.character.displayName,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      mine: true,
    };
  }
}
