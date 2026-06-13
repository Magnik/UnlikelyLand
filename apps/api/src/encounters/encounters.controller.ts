import { Body, Controller, Get, Post } from '@nestjs/common';
import { ResolveChoiceSchema, type ResolveChoiceInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
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

  @Post('resolve')
  resolve(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(ResolveChoiceSchema)) dto: ResolveChoiceInput,
  ) {
    return this.resolution.resolve(user.characterId, dto);
  }
}
