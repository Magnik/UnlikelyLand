import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { EconomyModule } from '../economy/economy.module';

@Module({
  imports: [EconomyModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
