import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { AchievementsService } from './achievements.service';

@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.achievements.list(user.characterId);
  }
}
