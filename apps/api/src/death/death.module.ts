import { Module } from '@nestjs/common';
import { DeathController } from './death.controller';
import { DeathService } from './death.service';
import { CharactersModule } from '../characters/characters.module';
import { EconomyModule } from '../economy/economy.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [CharactersModule, EconomyModule, AchievementsModule],
  controllers: [DeathController],
  providers: [DeathService],
})
export class DeathModule {}
