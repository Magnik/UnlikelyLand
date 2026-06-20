import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { EconomyModule } from '../economy/economy.module';
import { GuildsController } from './guilds.controller';
import { GuildsService } from './guilds.service';

@Module({
  imports: [AchievementsModule, EconomyModule],
  controllers: [GuildsController],
  providers: [GuildsService],
})
export class GuildsModule {}
