import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './common/decorators/public.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('discovery')
  @ApiOperation({
    summary: 'Descubrimiento en la red local',
    description:
      'Responde con la identidad del backend para que las apps móviles lo encuentren al escanear la LAN.',
  })
  discovery() {
    return {
      service: 'mercaldas-crm-backend',
      name: 'Mercaldas CRM',
      port: Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3100),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('api-status')
  @ApiOperation({
    summary: 'API Status',
    description: 'Verifica el estado de la API y sus servicios (base de datos)',
  })
  @ApiOkResponse({
    description: 'API saludable',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-01-15T10:00:00.000Z',
        services: {
          database: {
            status: 'connected',
            message: 'Database connection successful',
            timestamp: '2026-01-15T10:00:00.000Z',
          },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'La base de datos no está disponible',
    schema: {
      example: {
        status: 'error',
        timestamp: '2026-01-15T10:00:00.000Z',
        services: {
          database: {
            status: 'disconnected',
            message: 'Database connection failed: Connection refused',
            timestamp: '2026-01-15T10:00:00.000Z',
          },
        },
      },
    },
  })
  async getHealth(@Res() res: Response) {
    const health = await this.appService.getHealth();
    // 503 cuando la BD está caída: así el polling de los clientes detecta
    // el backend degradado (res.ok === false) aunque el proceso siga vivo.
    res
      .status(
        health.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
      )
      .json(health);
  }

  @Get('db-status')
  @ApiOperation({
    summary: 'Database Status',
    description:
      'Verifica exclusivamente el estado de la conexión a la base de datos',
  })
  @ApiOkResponse({
    description: 'Conexión a base de datos exitosa',
    schema: {
      example: {
        status: 'connected',
        message: 'Database connection successful',
        timestamp: '2026-01-15T10:00:00.000Z',
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Error de conexión a la base de datos',
    schema: {
      example: {
        status: 'disconnected',
        message: 'Database connection failed: Connection refused',
        timestamp: '2026-01-15T10:00:00.000Z',
      },
    },
  })
  async getDbStatus(@Res() res: Response) {
    const dbStatus = await this.appService.checkDatabaseConnection();
    res
      .status(
        dbStatus.status === 'connected'
          ? HttpStatus.OK
          : HttpStatus.SERVICE_UNAVAILABLE,
      )
      .json(dbStatus);
  }
}
