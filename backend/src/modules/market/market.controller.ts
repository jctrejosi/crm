import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MarketService } from './market.service';

@ApiTags('Admin - Mercado')
@Controller('admin/market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('status')
  @ApiOperation({
    summary:
      'Estado de la ingesta por supermercado (última corrida, cobertura, antigüedad)',
  })
  @ApiResponse({ status: 200, description: 'Estado consolidado + alertas' })
  status() {
    return this.marketService.status();
  }

  @Get('runs')
  @ApiOperation({ summary: 'Historial de corridas de ingesta' })
  @ApiResponse({ status: 200, description: 'Corridas' })
  runs(@Query('store') store?: string, @Query('limit') limit?: string) {
    return this.marketService.runs(store, limit ? Number(limit) : 50);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Notificaciones de la app (campana del topbar)' })
  @ApiResponse({ status: 200, description: 'Notificaciones' })
  notifications(
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketService.notifications(
      unread === 'true' || unread === '1',
      limit ? Number(limit) : 30,
    );
  }

  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  markAllRead() {
    return this.marketService.markAllNotificationsRead();
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  markRead(@Param('id') id: string) {
    return this.marketService.markNotificationRead(id);
  }

  @Post('ingest')
  @ApiOperation({
    summary:
      'Disparar la ingesta de los 4 catálogos (los súpers que ya estén corriendo se omiten)',
  })
  ingestAll() {
    return this.marketService.trigger();
  }

  @Post('ingest/:store')
  @ApiOperation({ summary: 'Disparar la ingesta de un supermercado' })
  ingestOne(@Param('store') store: string) {
    return this.marketService.trigger(store);
  }
}
