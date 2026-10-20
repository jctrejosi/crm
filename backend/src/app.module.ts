import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
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
  providers: [
    AppService,
    // Guard global: todo exige JWT salvo lo marcado con @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
