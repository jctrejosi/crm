import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DrizzleModule } from './database/drizzle.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { LandingModule } from './modules/landing/landing.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SettingsController } from './modules/settings/settings.controller';
import {
  appConfig,
  databaseConfig,
  jwtConfig,
  corsConfig,
  helmetConfig,
} from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig, databaseConfig, jwtConfig, corsConfig, helmetConfig],
      isGlobal: true,
    }),
    DrizzleModule,
    AuthModule,
    CatalogModule,
    LandingModule,
    CampaignsModule,
    DashboardModule,
    OrdersModule,
  ],
  controllers: [AppController, SettingsController],
  providers: [AppService],
})
export class AppModule {}
