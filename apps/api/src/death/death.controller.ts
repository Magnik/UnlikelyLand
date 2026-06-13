import { Body, Controller, Get, Post } from '@nestjs/common';
import { ReviveSchema, type ReviveInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { DeathService } from './death.service';

@Controller('death')
export class DeathController {
  constructor(private readonly death: DeathService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.death.status(user.characterId);
  }

  @Post('revive')
  revive(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(ReviveSchema)) dto: ReviveInput,
  ) {
    return this.death.revive(user.characterId, dto);
  }
}
