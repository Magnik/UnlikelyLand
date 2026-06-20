import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BanUserSchema,
  ModerationListQuerySchema,
  ModerationMessageActionSchema,
  MuteUserSchema,
  ResolveReportSchema,
  TargetCharacterIdSchema,
  WarnUserSchema,
  type BanUserInput,
  type ModerationMessageActionInput,
  type MuteUserInput,
  type ResolveReportInput,
  type WarnUserInput,
} from '@unlikelyland/contracts';
import { Roles } from '../common/public.decorator';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { ModerationService } from './moderation.service';

const SetRoleSchema = z.object({ characterId: z.string().uuid(), role: z.enum(['player', 'moderator']) });
const DisbandGuildSchema = z.object({ guildId: z.string().uuid(), reason: z.string().max(300).optional() });

/**
 * Moderation surface. The whole controller requires the 'moderator' role (admin
 * is a superset). The most destructive actions (ban, role changes, guild disband)
 * are additionally narrowed to 'admin' at the handler level. Moderators get report
 * review + chat moderation + mute/warn — but NOT the admin-only AI logs, raw Story
 * Memory, or economy ledger, which live on the separate admin controller.
 */
@Roles('moderator')
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('reports')
  reports(@Query('status') status?: string, @Query('limit') limit?: string) {
    const q = ModerationListQuerySchema.parse({ status, limit });
    return this.moderation.reports(q.status, q.limit ?? 100);
  }

  @Post('reports/resolve')
  resolveReport(@CurrentUser() user: AuthUser, @Body(new ZodBody(ResolveReportSchema)) dto: ResolveReportInput) {
    return this.moderation.resolveReport(user.userId, dto);
  }

  @Post('messages/hide')
  hide(@CurrentUser() user: AuthUser, @Body(new ZodBody(ModerationMessageActionSchema)) dto: ModerationMessageActionInput) {
    return this.moderation.hideMessage(user.userId, dto);
  }

  @Post('messages/delete')
  remove(@CurrentUser() user: AuthUser, @Body(new ZodBody(ModerationMessageActionSchema)) dto: ModerationMessageActionInput) {
    return this.moderation.deleteMessage(user.userId, dto);
  }

  @Post('messages/restore')
  restore(@CurrentUser() user: AuthUser, @Body(new ZodBody(ModerationMessageActionSchema)) dto: ModerationMessageActionInput) {
    return this.moderation.restoreMessage(user.userId, dto);
  }

  @Post('mute')
  mute(@CurrentUser() user: AuthUser, @Body(new ZodBody(MuteUserSchema)) dto: MuteUserInput) {
    return this.moderation.mute(user.userId, dto);
  }

  @Post('unmute')
  unmute(@CurrentUser() user: AuthUser, @Body(new ZodBody(TargetCharacterIdSchema)) dto: { characterId: string }) {
    return this.moderation.unmute(user.userId, dto.characterId);
  }

  @Post('warn')
  warn(@CurrentUser() user: AuthUser, @Body(new ZodBody(WarnUserSchema)) dto: WarnUserInput) {
    return this.moderation.warn(user.userId, dto);
  }

  @Get('users/search')
  searchUsers(@Query('q') q?: string) {
    return this.moderation.searchUsers(q ?? '');
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.moderation.userDetail(id);
  }

  @Get('audit')
  audit(@Query('limit') limit?: string) {
    return this.moderation.auditLog(limit ? Math.min(Number(limit), 200) : 100);
  }

  @Get('stats')
  stats() {
    return this.moderation.stats();
  }

  @Get('chat')
  chat(@Query('limit') limit?: string) {
    return this.moderation.recentChat(limit ? Math.min(Number(limit), 200) : 100);
  }

  // ── Admin-only (override the class-level moderator gate) ──────────────────────

  @Roles('admin')
  @Post('ban')
  ban(@CurrentUser() user: AuthUser, @Body(new ZodBody(BanUserSchema)) dto: BanUserInput) {
    return this.moderation.ban(user.userId, dto);
  }

  @Roles('admin')
  @Post('unban')
  unban(@CurrentUser() user: AuthUser, @Body(new ZodBody(TargetCharacterIdSchema)) dto: { characterId: string }) {
    return this.moderation.unban(user.userId, dto.characterId);
  }

  @Roles('admin')
  @Post('role')
  role(@CurrentUser() user: AuthUser, @Body(new ZodBody(SetRoleSchema)) dto: { characterId: string; role: 'player' | 'moderator' }) {
    return this.moderation.setRole(user.userId, dto.characterId, dto.role);
  }

  @Roles('admin')
  @Post('guild/disband')
  disband(@CurrentUser() user: AuthUser, @Body(new ZodBody(DisbandGuildSchema)) dto: { guildId: string; reason?: string }) {
    return this.moderation.disbandGuild(user.userId, dto.guildId, dto.reason ?? '');
  }
}
