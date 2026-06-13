import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  CreateListingSchema,
  ListingActionSchema,
  type CreateListingInput,
  type ListingActionInput,
} from '@unlikelyland/contracts';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.market.list(user.characterId);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.market.mine(user.characterId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodBody(CreateListingSchema)) dto: CreateListingInput) {
    return this.market.create(user.characterId, dto);
  }

  @Post('buy')
  buy(@CurrentUser() user: AuthUser, @Body(new ZodBody(ListingActionSchema)) dto: ListingActionInput) {
    return this.market.buy(user.characterId, dto.listingId);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser, @Body(new ZodBody(ListingActionSchema)) dto: ListingActionInput) {
    return this.market.cancel(user.characterId, dto.listingId);
  }
}
