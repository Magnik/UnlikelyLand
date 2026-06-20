import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { EconomyModule } from '../economy/economy.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [EconomyModule, AchievementsModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
