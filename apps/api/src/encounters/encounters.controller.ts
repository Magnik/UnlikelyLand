import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ResolveChoiceSchema, type ResolveChoiceInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { EncountersService } from './encounters.service';
import { ResolutionService } from './resolution.service';

@Controller('encounters')
export class EncountersController {
  constructor(
    private readonly encounters: EncountersService,
    private readonly resolution: ResolutionService,
  ) {}

  /** The player's current unresolved encounter (if any). */
  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.encounters.currentEncounterView(user.characterId);
  }

  // Resolving drives the (potentially AI-backed) next-encounter generation, so it
  // is throttled per character. Idempotent replays still count toward the window
  // but are cheap; the limit is generous enough for normal play.
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 40, windowMs: 60 * 1000, key: 'encounter:resolve' })
  @Post('resolve')
  resolve(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(ResolveChoiceSchema)) dto: ResolveChoiceInput,
  ) {
    return this.resolution.resolve(user.characterId, dto);
  }
}
