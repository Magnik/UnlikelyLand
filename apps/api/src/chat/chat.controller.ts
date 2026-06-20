import { Body, Controller, Get, type MessageEvent, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChatListQuerySchema, SendChatSchema, type SendChatInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(RateLimitGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('channel') channel?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.chat.list(
      user.characterId,
      ChatListQuerySchema.parse({ channel: channel || undefined, limit, before: before || undefined }),
    );
  }

  // Cheap in-memory pre-filter on top of the durable per-character DB rate limit.
  @RateLimit({ limit: 8, windowMs: 30_000, key: 'chat:send' })
  @Post()
  send(@CurrentUser() user: AuthUser, @Body(new ZodBody(SendChatSchema)) dto: SendChatInput) {
    return this.chat.send(user.characterId, dto.body, dto.channel);
  }

  /**
   * Server-Sent Events stream that pulses whenever a chat message is posted. The
   * pulse carries only the channel type (no body), so it is safe to leave public
   * (EventSource cannot send an auth header); the client re-fetches through the
   * normal block/channel-filtered list endpoint. Polling remains the fallback.
   * Single-instance — a multi-replica deploy would back the pulse with Redis.
   */
  @Public()
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.chat.pulses().pipe(map((p) => ({ data: p }) as MessageEvent));
  }
}
