import { Module } from '@nestjs/common';
import { PrestigeController } from './prestige.controller';
import { PrestigeService } from './prestige.service';
import { CharactersModule } from '../characters/characters.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [CharactersModule, AchievementsModule],
  controllers: [PrestigeController],
  providers: [PrestigeService],
})
export class PrestigeModule {}
