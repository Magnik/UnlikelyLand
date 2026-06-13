import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { CharactersModule } from './characters/characters.module';
import { ExpeditionsModule } from './expeditions/expeditions.module';
import { EncountersModule } from './encounters/encounters.module';
import { DeathModule } from './death/death.module';
import { AdminModule } from './admin/admin.module';
import { LeaderboardsModule } from './leaderboards/leaderboards.module';
import { GuildsModule } from './guilds/guilds.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    // Load env from the repo root (dev) — missing files are ignored (prod uses
    // real environment variables injected by Docker Compose).
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    CommonModule,
    AuthModule,
    CharactersModule,
    ExpeditionsModule,
    EncountersModule,
    DeathModule,
    AdminModule,
    LeaderboardsModule,
    GuildsModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
