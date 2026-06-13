import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateCharacterSchema, type UpdateCharacterInput } from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { CharactersService } from './characters.service';

@Controller('characters')
export class CharactersController {
  constructor(private readonly characters: CharactersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.characters.buildView(user.characterId);
  }

  @Patch('me')
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(UpdateCharacterSchema)) dto: UpdateCharacterInput,
  ) {
    return this.characters.update(user.characterId, dto);
  }

  @Get('me/inventory')
  inventory(@CurrentUser() user: AuthUser) {
    return this.characters.getInventory(user.characterId);
  }
}
