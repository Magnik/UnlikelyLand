import { Controller, Get, Param } from '@nestjs/common';
import { LeaderboardTypeSchema } from '@unlikelyland/contracts';
import { LeaderboardsService } from './leaderboards.service';

@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  @Get(':type')
  top(@Param('type') type: string) {
    // Unknown types fall back to the level board rather than erroring.
    const parsed = LeaderboardTypeSchema.catch('level').parse(type);
    return this.leaderboards.top(parsed);
  }
}
