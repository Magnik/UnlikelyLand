import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { GoHomeSchema, StartExpeditionSchema, type GoHomeInput, type StartExpeditionInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { ExpeditionsService } from './expeditions.service';

@Controller('expeditions')
export class ExpeditionsController {
  constructor(private readonly expeditions: ExpeditionsService) {}

  @Get('types')
  types() {
    return this.expeditions.listTypes();
  }

  @Get('active')
  active(@CurrentUser() user: AuthUser) {
    return this.expeditions.getActive(user.characterId);
  }

  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60 * 1000, key: 'expedition:start' })
  @Post('start')
  start(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(StartExpeditionSchema)) dto: StartExpeditionInput,
  ) {
    return this.expeditions.start(user.characterId, dto.type);
  }

  @Post('go-home')
  goHome(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(GoHomeSchema)) dto: GoHomeInput,
  ) {
    return this.expeditions.goHome(user.characterId, dto.expeditionId);
  }
}
