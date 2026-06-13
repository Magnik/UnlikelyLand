import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { PrestigeService } from './prestige.service';

@Controller('prestige')
export class PrestigeController {
  constructor(private readonly prestige: PrestigeService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.prestige.status(user.characterId);
  }

  @Post('escape')
  escape(@CurrentUser() user: AuthUser) {
    return this.prestige.escape(user.characterId);
  }
}
