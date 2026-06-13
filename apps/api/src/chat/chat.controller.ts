import { Body, Controller, Get, Post } from '@nestjs/common';
import { SendChatSchema, type SendChatInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.chat.list(user.characterId);
  }

  @Post()
  send(@CurrentUser() user: AuthUser, @Body(new ZodBody(SendChatSchema)) dto: SendChatInput) {
    return this.chat.send(user.characterId, dto.body);
  }
}
