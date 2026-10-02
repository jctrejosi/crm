import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DrizzleService } from './database/drizzle.service';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  // El health endpoint es consultado por cada cliente (polling cada 5s).
  // Para no golpear la BD en cada llamada se cachea el último resultado
  // y solo se vuelve a consultar cuando pasa el TTL.
  private readonly CHECK_TTL_MS = 10_000;
  private lastCheckAt = 0;
  private lastResult: {
    status: string;
    message: string;
    timestamp: string;
  } | null = null;
  private lastConnected = false;

  /**
   * Validar conexión a la base de datos al iniciar
   */
  async onModuleInit() {
    await this.checkDatabaseConnection();

    // Log único de la versión de PostgreSQL al arrancar (no en cada health check)
    try {
      const result = await this.drizzle.execute('SELECT version() as pg_version');
      this.logger.log(
        `📊 PostgreSQL version: ${result[0]?.pg_version?.split(',')[0] || 'unknown'}`,
      );
    } catch {
      /* la falla de conexión ya se reportó en checkDatabaseConnection */
    }
  }

  /**
   * Verifica la conexión a la base de datos (con caché de 10s).
   * Solo loguea y avisa a los clientes cuando el estado cambia
   * (arranque o desconectado → conectado).
   */
  async checkDatabaseConnection(): Promise<{
    status: string;
    message: string;
    timestamp: string;
  }> {
    const now = Date.now();

    // Servir el último resultado si es reciente (los polls de health
    // de todos los clientes comparten esta caché).
    if (this.lastResult && now - this.lastCheckAt < this.CHECK_TTL_MS) {
      return this.lastResult;
    }

    try {
      // Chequeo barato: SELECT 1 basta para el health check.
      await this.drizzle.execute('SELECT 1');

      const justConnected = !this.lastConnected;
      this.lastConnected = true;

      // Solo al arrancar o al recuperarse de una caída: loguear y avisar
      // a los frontends que el backend está disponible.
      if (justConnected) {
        this.logger.log('✅ Database connection successful');
      }

      this.lastResult = {
        status: 'connected',
        message: 'Database connection successful',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.lastConnected = false;
      this.logger.error(
        '❌ Database connection failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );

      this.lastResult = {
        status: 'disconnected',
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
    }

    this.lastCheckAt = Date.now();
    return this.lastResult;
  }

  /**
   * Obtiene el estado de la aplicación (health check)
   */
  async getHealth() {
    const dbStatus = await this.checkDatabaseConnection();

    return {
      status: dbStatus.status === 'connected' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
      },
    };
  }
}
