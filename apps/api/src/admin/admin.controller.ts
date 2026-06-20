import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  AdminLimitSchema,
  AiSettingsUpdateSchema,
  ApproveConceptSchema,
  ConceptStatusFilterSchema,
  PromoteNpcBodySchema,
  RejectConceptSchema,
  type AiSettingsUpdateInput,
  type ApproveConceptInput,
  type RejectConceptInput,
} from '@unlikelyland/contracts';
import { Roles } from '../common/public.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { AdminService } from './admin.service';

/**
 * Admin/moderation surface. The whole controller is gated to admins (and the
 * RolesGuard treats 'admin' as a superset). Read-only debugging views plus the
 * AI on/off + fallback toggles and item-concept review. All query/body params are
 * Zod-validated (bounded limits, enum-only statuses) so a malformed request can't
 * pull unbounded data or inject an arbitrary status filter.
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
    return this.admin.aiLogs(AdminLimitSchema.parse({ limit }).limit ?? 50);
  }

  @Get('players')
  players() {
    return this.admin.players();
  }

  @Get('players/:id/story-memory')
  storyMemory(@Param('id') id: string) {
    return this.admin.playerStoryMemory(id);
  }

  @Get('players/:id/inventory')
  characterInventory(@Param('id') id: string) {
    return this.admin.characterInventory(id);
  }

  @Get('economy')
  economy(@Query('limit') limit?: string) {
    return this.admin.economy(AdminLimitSchema.parse({ limit }).limit ?? 100);
  }

  @Get('chat')
  chat(@Query('limit') limit?: string) {
    return this.admin.chat(AdminLimitSchema.parse({ limit }).limit ?? 100);
  }

  // ── Item catalog + concept review ────────────────────────────────────────────

  @Get('items')
  items(@Query('limit') limit?: string) {
    return this.admin.itemsCatalog(AdminLimitSchema.parse({ limit }).limit ?? 200);
  }

  @Get('item-concepts')
  itemConcepts(@Query('status') status?: string) {
    return this.admin.itemConcepts(ConceptStatusFilterSchema.parse({ status }).status);
  }

  @Post('item-concepts/:id/approve')
  approve(@Param('id') id: string, @Body(new ZodBody(ApproveConceptSchema)) dto: ApproveConceptInput) {
    return this.admin.approveConcept(id, dto);
  }

  @Post('item-concepts/:id/reject')
  reject(@Param('id') id: string, @Body(new ZodBody(RejectConceptSchema)) dto: RejectConceptInput) {
    return this.admin.rejectConcept(id, dto.notes);
  }

  @Get('npcs')
  npcs(@Query('status') status?: string) {
    return this.admin.npcs(status);
  }

  @Post('npcs/:id/promote')
  promote(@Param('id') id: string, @Body(new ZodBody(PromoteNpcBodySchema)) body: { status: string }) {
    return this.admin.promoteNpc(id, body.status);
  }
}
