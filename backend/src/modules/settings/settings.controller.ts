import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { DrizzleService } from '../../database/drizzle.service';
import { store } from '../../../drizzle/schema';

/**
 * Ajustes mínimos para el CRM: solo la información pública de la tienda
 * (nombre, teléfono y whatsapp). No depende del módulo de pagos.
 */
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly drizzle: DrizzleService) {}

  private get db() {
    return this.drizzle.db;
  }

  @Public()
  @Get('public-info')
  async getPublicInfo() {
    const [row] = await this.db.select().from(store).limit(1);
    if (!row) return {};
    return { phone: row.phone, whatsapp: row.whatsapp, tradeName: row.tradeName };
  }
}
