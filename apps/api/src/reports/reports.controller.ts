import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreateReportSchema, type CreateReportInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(RateLimitGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RateLimit({ limit: 20, windowMs: 60_000, key: 'report:create' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodBody(CreateReportSchema)) dto: CreateReportInput) {
    return this.reports.create(user.characterId, dto);
  }
}
