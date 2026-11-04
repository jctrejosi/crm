import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketIngestService } from './market-ingest.service';
import { MarketSchedulerService } from './market-scheduler.service';
import { MarketService } from './market.service';

@Module({
  controllers: [MarketController],
  providers: [MarketService, MarketIngestService, MarketSchedulerService],
  exports: [MarketService, MarketIngestService],
})
export class MarketModule {}
