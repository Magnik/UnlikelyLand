import { Controller, Get, Query } from '@nestjs/common';
import { ActivityFeedQuerySchema } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { AchievementsService } from './achievements.service';

@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.achievements.list(user.characterId);
  }

  /** Public world activity feed (recent major milestones), blocked players hidden. */
  @Get('feed')
  feed(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const { limit: n } = ActivityFeedQuerySchema.parse({ limit });
    return this.achievements.recentFeed(user.characterId, n ?? 30);
  }
}
