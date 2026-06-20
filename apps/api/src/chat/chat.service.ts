import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import type { ChatChannel, ChatListQueryInput, ChatMessageView, ChatPageView } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { RelationshipService } from '../common/relationship.service';
import { moderateText } from '../ai/moderation';

/** A near-realtime "something was posted" nudge for the SSE stream. Carries only
 *  the channel type — no message body — so listeners learn nothing private; the
 *  client re-fetches through the normal (block/channel-filtered) list endpoint. */
export interface ChatPulse {
  channelType: 'global' | 'region' | 'guild';
}

/** Resolved channel scope: a channelType plus the id that bounds region/guild. */
interface ChannelScope {
  channelType: 'global' | 'region' | 'guild';
  regionSetId?: string;
  guildId?: string;
}

/** Per-character rate limit: at most RATE_MAX messages per window. */
const RATE_WINDOW_MS = 30_000;
const RATE_MAX = 5;
/** Reject a message identical to the sender's previous one within this window. */
const DUPLICATE_WINDOW_MS = 60_000;
const PAGE_SIZE = 50;

/**
 * Global chat (MVP): a moderated, rate-limited, polled message feed. Blocking is
 * honoured bidirectionally (via RelationshipService) so neither party in a block
 * relationship sees the other. Only messages with moderationStatus 'visible' are
 * shown; staff can hide/remove without hard-deleting. Structured so a WebSocket
 * transport can be added later without changing these business rules.
 */
@Injectable()
export class ChatService {
  /** In-process pulse stream consumed by the SSE endpoint. Single-instance; a
   *  multi-replica deploy would back this with Redis pub/sub (see docs). */
  private readonly pulse = new Subject<ChatPulse>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipService,
  ) {}

  /** Observable of chat activity pulses for the SSE stream. */
  pulses(): Subject<ChatPulse> {
    return this.pulse;
  }

  /** Map of characterId → guild tag, for the inline [TAG] shown next to names. */
  private async guildTagsFor(characterIds: string[]): Promise<Map<string, string>> {
    if (characterIds.length === 0) return new Map();
    const members = await this.prisma.guildMember.findMany({
      where: { characterId: { in: characterIds } },
      select: { characterId: true, guild: { select: { tag: true } } },
    });
    const map = new Map<string, string>();
    for (const m of members) if (m.guild.tag) map.set(m.characterId, m.guild.tag);
    return map;
  }

  private async assertNotMuted(characterId: string): Promise<void> {
    const c = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: { mutedUntil: true },
    });
    if (c?.mutedUntil && c.mutedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((c.mutedUntil.getTime() - Date.now()) / 60_000);
      throw new ForbiddenException(`You are muted for another ${mins} minute(s)`);
    }
  }

  /**
   * Resolve which channel the caller is acting on. Region chat is bounded to the
   * caller's region set; guild chat to their guild. Returns null when the caller
   * has no guild (so guild chat is empty / cannot be posted to).
   */
  private async resolveScope(characterId: string, channel: ChatChannel): Promise<ChannelScope | null> {
    if (channel === 'region') {
      const c = await this.prisma.character.findUnique({ where: { id: characterId }, select: { regionSetId: true } });
      return c ? { channelType: 'region', regionSetId: c.regionSetId } : null;
    }
    if (channel === 'guild') {
      const m = await this.prisma.guildMember.findUnique({ where: { characterId }, select: { guildId: true } });
      return m ? { channelType: 'guild', guildId: m.guildId } : null;
    }
    return { channelType: 'global' };
  }

  private scopeWhere(scope: ChannelScope): Record<string, unknown> {
    if (scope.channelType === 'region') return { channelType: 'region', regionSetId: scope.regionSetId };
    if (scope.channelType === 'guild') return { channelType: 'guild', guildId: scope.guildId };
    return { channelType: 'global' };
  }

  async list(viewerCharacterId: string, query: Partial<ChatListQueryInput> = {}): Promise<ChatPageView> {
    const take = Math.min(query.limit ?? PAGE_SIZE, 100);
    const channel = query.channel ?? 'global';
    const scope = await this.resolveScope(viewerCharacterId, channel);
    // Guild channel with no guild → empty feed (nothing to show).
    if (!scope) return { messages: [], olderCursor: null, hasOlder: false };

    const blockedIds = await this.relationships.blockedIdsForFeed(viewerCharacterId);

    // Cursor: only messages strictly older than the `before` anchor.
    let beforeCreatedAt: Date | undefined;
    if (query.before) {
      const anchor = await this.prisma.chatMessage.findUnique({
        where: { id: query.before },
        select: { createdAt: true },
      });
      if (anchor) beforeCreatedAt = anchor.createdAt;
    }

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        ...this.scopeWhere(scope),
        moderationStatus: 'visible',
        ...(blockedIds.length ? { characterId: { notIn: blockedIds } } : {}),
        ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1, // one extra row tells us whether older history exists
      include: { character: { select: { displayName: true } } },
    });

    const hasOlder = rows.length > take;
    const ordered = rows.slice(0, take).reverse(); // oldest → newest for display
    const tags = await this.guildTagsFor(ordered.map((r) => r.characterId));

    const messages: ChatMessageView[] = ordered.map((r) => ({
      id: r.id,
      characterId: r.characterId,
      displayName: r.character.displayName,
      guildTag: tags.get(r.characterId) ?? null,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      mine: r.characterId === viewerCharacterId,
    }));

    return {
      messages,
      olderCursor: hasOlder && messages.length ? messages[0].id : null,
      hasOlder,
    };
  }

  async send(characterId: string, body: string, channel: ChatChannel = 'global'): Promise<ChatMessageView> {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Message is empty');

    const scope = await this.resolveScope(characterId, channel);
    if (!scope) throw new BadRequestException('Join a guild to use guild chat');

    await this.assertNotMuted(characterId);

    const moderation = moderateText(trimmed, 'pg13');
    if (!moderation.safe) {
      throw new BadRequestException('Message blocked by moderation');
    }

    const since = new Date(Date.now() - RATE_WINDOW_MS);
    const recent = await this.prisma.chatMessage.findMany({
      where: { characterId, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      take: RATE_MAX,
      select: { body: true, createdAt: true },
    });
    if (recent.length >= RATE_MAX) {
      throw new HttpException('You are sending messages too quickly', HttpStatus.TOO_MANY_REQUESTS);
    }
    const last = recent[0];
    if (last && last.body === trimmed && Date.now() - last.createdAt.getTime() < DUPLICATE_WINDOW_MS) {
      throw new BadRequestException('That message is identical to your last one');
    }

    const row = await this.prisma.chatMessage.create({
      data: {
        characterId,
        channel: scope.channelType,
        channelType: scope.channelType,
        regionSetId: scope.regionSetId ?? null,
        guildId: scope.guildId ?? null,
        body: trimmed,
      },
      include: { character: { select: { displayName: true } } },
    });
    const tag = (await this.guildTagsFor([characterId])).get(characterId) ?? null;

    // Nudge SSE listeners (carries no private content).
    this.pulse.next({ channelType: scope.channelType });

    return {
      id: row.id,
      characterId: row.characterId,
      displayName: row.character.displayName,
      guildTag: tag,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      mine: true,
    };
  }
}
