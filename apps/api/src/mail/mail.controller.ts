import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  MailActionSchema,
  SendMailSchema,
  type MailActionInput,
  type SendMailInput,
} from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { MailService } from './mail.service';

@Controller('mail')
@UseGuards(RateLimitGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get()
  mailbox(@CurrentUser() user: AuthUser) {
    return this.mail.mailbox(user.characterId);
  }

  // Anti-spam: cap outbound mail volume per sender.
  @RateLimit({ limit: 15, windowMs: 60_000, key: 'mail:send' })
  @Post()
  send(@CurrentUser() user: AuthUser, @Body(new ZodBody(SendMailSchema)) dto: SendMailInput) {
    return this.mail.send(user.characterId, dto);
  }

  @Post('read')
  read(@CurrentUser() user: AuthUser, @Body(new ZodBody(MailActionSchema)) dto: MailActionInput) {
    return this.mail.markRead(user.characterId, dto.mailId);
  }

  @Post('delete')
  remove(@CurrentUser() user: AuthUser, @Body(new ZodBody(MailActionSchema)) dto: MailActionInput) {
    return this.mail.remove(user.characterId, dto.mailId);
  }
}
