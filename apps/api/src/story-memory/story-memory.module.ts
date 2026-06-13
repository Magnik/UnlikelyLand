import { Module } from '@nestjs/common';
import { StoryMemoryService } from './story-memory.service';

@Module({
  providers: [StoryMemoryService],
  exports: [StoryMemoryService],
})
export class StoryMemoryModule {}
