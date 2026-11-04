import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MARKET_INGEST_ENABLED, MARKET_TIMEZONE } from './market.config';
import { MarketIngestService } from './market-ingest.service';

/**
 * Programación de la ingesta de catálogos.
 *
 * - Cron diario a las 03:00 (America/Bogota), una sola vez.
 * - Al arrancar: sincroniza `competitor_stores` y cierra corridas colgadas.
 * - `MARKET_CATCHUP_ON_START=true` permite recuperar una corrida perdida si el
 *   backend estuvo apagado a la hora del cron (desactivado por defecto para no
 *   lanzar crawls completos en cada reinicio de desarrollo).
 */
@Injectable()
export class MarketSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MarketSchedulerService.name);

  constructor(private readonly ingest: MarketIngestService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!MARKET_INGEST_ENABLED) {
      this.logger.warn(
        'Ingesta de catálogos desactivada (MARKET_INGEST_ENABLED=false).',
      );
      return;
    }

    try {
      await this.ingest.syncStores();
      await this.ingest.recoverStaleRuns();
    } catch (error) {
      this.logger.error(
        `No se pudo preparar la ingesta de catálogos: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (
      (process.env.MARKET_CATCHUP_ON_START ?? 'false').toLowerCase() === 'true'
    ) {
      // Deja que el backend termine de arrancar antes de saturar la red.
      setTimeout(() => {
        void this.ingest
          .runAllSequential('startup')
          .catch((error) =>
            this.logger.error(
              `Catch-up del mercado falló: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
      }, 90_000);
    }
  }

  @Cron('0 3 * * *', {
    name: 'market-ingest-daily',
    timeZone: MARKET_TIMEZONE,
  })
  async dailyIngest(): Promise<void> {
    if (!MARKET_INGEST_ENABLED) return;

    this.logger.log(
      'Cron diario del mercado: iniciando ingesta de Éxito, Carulla, Olímpica y D1.',
    );
    await this.ingest.runAllSequential('scheduled');
  }
}
