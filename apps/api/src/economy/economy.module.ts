import { Module } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { LootService } from './loot.service';

@Module({
  providers: [EconomyService, LootService],
  exports: [EconomyService, LootService],
})
export class EconomyModule {}
