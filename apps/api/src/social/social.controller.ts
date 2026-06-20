import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  FriendRequestActionSchema,
  TargetCharacterSchema,
  type FriendRequestActionInput,
  type TargetCharacterInput,
} from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { SocialService } from './social.service';

@Controller('social')
@UseGuards(RateLimitGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.social.overview(user.characterId);
  }

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.social.search(user.characterId, q ?? '');
  }

  @RateLimit({ limit: 20, windowMs: 60_000, key: 'social:request' })
  @Post('request')
  send(@CurrentUser() user: AuthUser, @Body(new ZodBody(TargetCharacterSchema)) dto: TargetCharacterInput) {
    return this.social.sendRequest(user.characterId, dto.characterId);
  }

  @Post('accept')
  accept(@CurrentUser() user: AuthUser, @Body(new ZodBody(FriendRequestActionSchema)) dto: FriendRequestActionInput) {
    return this.social.acceptRequest(user.characterId, dto.requestId);
  }

  @Post('reject')
  reject(@CurrentUser() user: AuthUser, @Body(new ZodBody(FriendRequestActionSchema)) dto: FriendRequestActionInput) {
    return this.social.rejectRequest(user.characterId, dto.requestId);
  }

  @Post('remove')
  remove(@CurrentUser() user: AuthUser, @Body(new ZodBody(TargetCharacterSchema)) dto: TargetCharacterInput) {
    return this.social.removeFriend(user.characterId, dto.characterId);
  }

  @Post('block')
  block(@CurrentUser() user: AuthUser, @Body(new ZodBody(TargetCharacterSchema)) dto: TargetCharacterInput) {
    return this.social.block(user.characterId, dto.characterId);
  }

  @Post('unblock')
  unblock(@CurrentUser() user: AuthUser, @Body(new ZodBody(TargetCharacterSchema)) dto: TargetCharacterInput) {
    return this.social.unblock(user.characterId, dto.characterId);
  }
}
