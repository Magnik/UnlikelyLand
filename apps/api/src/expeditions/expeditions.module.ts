import { Module } from '@nestjs/common';
import { ExpeditionsController } from './expeditions.controller';
import { ExpeditionsService } from './expeditions.service';
import { CharactersModule } from '../characters/characters.module';
import { EncountersModule } from '../encounters/encounters.module';

@Module({
  imports: [CharactersModule, EncountersModule],
  controllers: [ExpeditionsController],
  providers: [ExpeditionsService],
})
export class ExpeditionsModule {}
