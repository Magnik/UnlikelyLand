import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateGuildSchema,
  GuildBankActionSchema,
  GuildMemberActionSchema,
  UpdateGuildSchema,
  type CreateGuildInput,
  type GuildBankActionInput,
  type GuildMemberActionInput,
  type UpdateGuildInput,
} from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { GuildsService } from './guilds.service';

@Controller('guilds')
@UseGuards(RateLimitGuard)
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Get()
  list(@Query('q') q?: string, @Query('page') page?: string) {
    return this.guilds.list(q, page ? Number(page) : 1);
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

  // Founding a guild is rate-limited to blunt spam guild creation.
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: 'guild:create' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodBody(CreateGuildSchema)) dto: CreateGuildInput) {
    return this.guilds.create(user.characterId, dto);
  }

  @Post('update')
  update(@CurrentUser() user: AuthUser, @Body(new ZodBody(UpdateGuildSchema)) dto: UpdateGuildInput) {
    return this.guilds.updateGuild(user.characterId, dto);
  }

  @Post('promote')
  promote(@CurrentUser() user: AuthUser, @Body(new ZodBody(GuildMemberActionSchema)) dto: GuildMemberActionInput) {
    return this.guilds.promote(user.characterId, dto.characterId);
  }

  @Post('demote')
  demote(@CurrentUser() user: AuthUser, @Body(new ZodBody(GuildMemberActionSchema)) dto: GuildMemberActionInput) {
    return this.guilds.demote(user.characterId, dto.characterId);
  }

  @Post('kick')
  kick(@CurrentUser() user: AuthUser, @Body(new ZodBody(GuildMemberActionSchema)) dto: GuildMemberActionInput) {
    return this.guilds.kick(user.characterId, dto.characterId);
  }

  @Post('transfer')
  transfer(@CurrentUser() user: AuthUser, @Body(new ZodBody(GuildMemberActionSchema)) dto: GuildMemberActionInput) {
    return this.guilds.transferOwnership(user.characterId, dto.characterId);
  }

  @Post('bank/deposit')
  deposit(@CurrentUser() user: AuthUser, @Body(new ZodBody(GuildBankActionSchema)) dto: GuildBankActionInput) {
    return this.guilds.depositToBank(user.characterId, dto.amount);
  }

  @Post('bank/withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Body(new ZodBody(GuildBankActionSchema)) dto: GuildBankActionInput) {
    return this.guilds.withdrawFromBank(user.characterId, dto.amount);
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
