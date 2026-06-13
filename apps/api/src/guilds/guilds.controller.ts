import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateGuildSchema, type CreateGuildInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { GuildsService } from './guilds.service';

@Controller('guilds')
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Get()
  list() {
    return this.guilds.list();
  }

  // Declared before ':id' so the literal path wins.
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.guilds.mine(user.characterId);
  }

  @Get(':id')
  view(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.guilds.view(id, user.characterId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodBody(CreateGuildSchema)) dto: CreateGuildInput) {
    return this.guilds.create(user.characterId, dto);
  }

  @Post('leave')
  leave(@CurrentUser() user: AuthUser) {
    return this.guilds.leave(user.characterId);
  }

  @Post(':id/join')
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.guilds.join(user.characterId, id);
  }
}
