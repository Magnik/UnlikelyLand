import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AiSettingsUpdateSchema, type AiSettingsUpdateInput } from '@unlikelyland/contracts';
import { Roles } from '../common/public.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { AdminService } from './admin.service';

/**
 * Admin/moderation surface. The whole controller is gated to admins (and the
 * RolesGuard treats 'admin' as a superset). Read-only debugging views plus the
 * AI on/off + fallback toggles and item-concept review.
 */
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('ai/settings')
  aiSettings() {
    return this.admin.aiSettings();
  }

  @Post('ai/settings')
  updateAiSettings(@Body(new ZodBody(AiSettingsUpdateSchema)) dto: AiSettingsUpdateInput) {
    return this.admin.updateAiSettings(dto);
  }

  @Get('ai/logs')
  aiLogs(@Query('limit') limit?: string) {
    return this.admin.aiLogs(limit ? Number(limit) : 50);
  }

  @Get('players')
  players() {
    return this.admin.players();
  }

  @Get('players/:id/story-memory')
  storyMemory(@Param('id') id: string) {
    return this.admin.playerStoryMemory(id);
  }

  @Get('economy')
  economy(@Query('limit') limit?: string) {
    return this.admin.economy(limit ? Number(limit) : 100);
  }

  @Get('chat')
  chat(@Query('limit') limit?: string) {
    return this.admin.chat(limit ? Number(limit) : 100);
  }

  @Get('item-concepts')
  itemConcepts(@Query('status') status?: string) {
    return this.admin.itemConcepts(status);
  }

  @Post('item-concepts/:id/approve')
  approve(@Param('id') id: string) {
    return this.admin.approveConcept(id);
  }

  @Post('item-concepts/:id/reject')
  reject(@Param('id') id: string, @Body() body: { notes?: string }) {
    return this.admin.rejectConcept(id, body?.notes);
  }

  @Get('npcs')
  npcs(@Query('status') status?: string) {
    return this.admin.npcs(status);
  }

  @Post('npcs/:id/promote')
  promote(@Param('id') id: string, @Body() body: { status?: string }) {
    return this.admin.promoteNpc(id, body?.status ?? 'shared_candidate');
  }
}
