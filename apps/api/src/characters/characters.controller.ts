import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ItemActionSchema,
  UpdateCharacterSchema,
  type ItemActionInput,
  type UpdateCharacterInput,
} from '@unlikelyland/contracts';
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

  /** Full inventory screen: items + equipped-per-slot + effective stat breakdown. */
  @Get('me/inventory')
  inventory(@CurrentUser() user: AuthUser) {
    return this.characters.getInventoryView(user.characterId);
  }

  @Get('me/effective-stats')
  effectiveStats(@CurrentUser() user: AuthUser) {
    return this.characters.getEffectiveStatsView(user.characterId);
  }

  /** Public profile for any character (public-only fields). Auth required; the
   *  viewer is passed so blocking is enforced (blocked => not found). */
  @Get(':id/profile')
  publicProfile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.characters.getPublicProfile(user.characterId, id);
  }

  @Post('equip')
  equip(@CurrentUser() user: AuthUser, @Body(new ZodBody(ItemActionSchema)) dto: ItemActionInput) {
    return this.characters.equip(user.characterId, dto.inventoryItemId);
  }

  @Post('unequip')
  unequip(@CurrentUser() user: AuthUser, @Body(new ZodBody(ItemActionSchema)) dto: ItemActionInput) {
    return this.characters.unequip(user.characterId, dto.inventoryItemId);
  }

  @Post('use')
  use(@CurrentUser() user: AuthUser, @Body(new ZodBody(ItemActionSchema)) dto: ItemActionInput) {
    return this.characters.useConsumable(user.characterId, dto.inventoryItemId);
  }
}
