import { Controller, Get, Param, Query } from '@nestjs/common';
import { LeaderboardQuerySchema, LeaderboardTypeSchema } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { LeaderboardsService } from './leaderboards.service';

@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  @Get(':type')
  board(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('regionSetId') regionSetId?: string,
  ) {
    // Unknown types fall back to the level board rather than erroring.
    const parsed = LeaderboardTypeSchema.catch('level').parse(type);
    const query = LeaderboardQuerySchema.parse({ page, pageSize, regionSetId: regionSetId || undefined });
    return this.leaderboards.board(parsed, user.characterId, query);
  }
}
