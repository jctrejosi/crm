import { Module } from '@nestjs/common';
import { LandingPublicController } from './landing.controller';
import { LandingService } from './landing.service';

@Module({
  controllers: [LandingPublicController],
  providers: [LandingService],
})
export class LandingModule {}
