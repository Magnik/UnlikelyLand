import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({
  imports: [AchievementsModule],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
