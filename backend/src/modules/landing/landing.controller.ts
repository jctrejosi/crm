import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LandingService } from './landing.service';

/**
 * Landing público mínimo para el CRM: el panel solo consulta la configuración
 * general (logo) de la tienda.
 */
@ApiTags('Landing')
@Controller('landing')
export class LandingPublicController {
  constructor(private readonly landingService: LandingService) {}

  @Public()
  @Get('general')
  @ApiOperation({ summary: 'Configuración general (logo)' })
  getGeneral() {
    return this.landingService.getGeneralLogo();
  }
}
