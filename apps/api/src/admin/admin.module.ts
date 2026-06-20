import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [AiModule, CharactersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
