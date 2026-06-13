import { Module } from '@nestjs/common';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { ResolutionService } from './resolution.service';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';
import { EconomyModule } from '../economy/economy.module';
import { StoryMemoryModule } from '../story-memory/story-memory.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [AiModule, CharactersModule, EconomyModule, StoryMemoryModule, AchievementsModule],
  controllers: [EncountersController],
  providers: [EncountersService, ResolutionService],
  exports: [EncountersService],
})
export class EncountersModule {}
