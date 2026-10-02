import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../drizzle/schema';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  public db: NodePgDatabase<typeof schema>;

  constructor(private configService: ConfigService) {
    const databaseUrl =
      this.configService.get<string>('database.url') ??
      process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is not defined. Please check your .env file or environment variables.',
      );
    }

    // SSL automático:
    // - Render (y la mayoría de Postgres gestionados) exige SSL para conexiones
    //   externas; sin SSL el servidor corta la conexión con ECONNRESET.
    // - Se activa si: DB_SSL=true, o la URL trae ssl/sslmode=require,
    //   o estamos en producción (Render). DB_SSL=false fuerza a desactivarlo.
    const hasSslInUrl =
      /[?&](sslmode=(require|verify-ca|verify-full)|ssl=(true|require))([&#]|$)/i.test(
        databaseUrl,
      );
    const sslEnabled =
      process.env.DB_SSL === 'true' ||
      (process.env.DB_SSL !== 'false' &&
        (hasSslInUrl || process.env.NODE_ENV === 'production'));

    this.pool = new Pool({
      connectionString: databaseUrl,
      // max 15: el pooler de sesión de Supabase limita a ~15 clientes
      // (pool_size). Con más, el pooler rechaza con EMAXCONNSESSION.
      max: 15,
      idleTimeoutMillis: 30000, // Tiempo de inactividad antes de cerrar conexión
      connectionTimeoutMillis: 10000, // Timeout de conexión (Render free tier despierta la DB)
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    });

    // El pool de pg emite 'error' cuando un cliente inactivo falla (p. ej. si
    // PostgreSQL se reinicia o se cae). Sin listener es un 'error' no escuchado
    // y Node mata el proceso. Con el pool vivo, el health check puede detectar
    // la caída y el StatusGateway avisa a los frontends cuando la BD vuelve.
    this.pool.on('error', (err) => {
      console.error(
        '⚠️ PostgreSQL pool error (la BD puede estar caída o reiniciando):',
        err.message,
      );
    });

    this.db = drizzle(this.pool, {
      schema,
      // mode: 'default', // No es necesario para PostgreSQL
    });
  }

  async onModuleInit() {
    // Verificar conexión al iniciar el módulo, con reintentos (los pools
    // gestionados tipo Supabase/Neon pueden tardar en despertar).
    const host =
      this.pool.options.host ||
      (this.pool.options.connectionString || '').split('@').pop() ||
      'desconocido';
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.pool.query('SELECT 1');
        console.log(`✅ Database connected successfully (${host})`);
        return;
      } catch (error) {
        lastError = error;
        console.error(
          `❌ Intento ${attempt}/3 de conexión a ${host} falló:`,
          error,
        );
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    console.error(
      '\n   ⚠️  Verifica DATABASE_URL en Render:' +
        '\n      - Host: usa el POOLER de Supabase (aws-0-<region>.pooler.supabase.com),' +
        '        NO el host directo db.<ref>.supabase.co (solo IPv6, inalcanzable).' +
        '\n      - Usuario: postgres.<project-ref> (ej: postgres.idiypzqlbjeqgphjlabz).' +
        '\n      - Define DB_SSL=true (Supabase exige TLS; no uses ?sslmode=require en la URL' +
        '        porque node-postgres lo trata como verify-full y falla con certificados propios).',
    );
    throw lastError;
  }

  async onModuleDestroy() {
    // Cerrar el pool de conexiones al destruir el módulo
    await this.pool.end();
    console.log('🔌 Database connection closed');
  }

  // Método para ejecutar queries SQL raw (cuando sea necesario)
  async execute<T = any>(query: string, params?: any[]): Promise<T[]> {
    const result = await this.pool.query(query, params);
    return result.rows as T[];
  }

  // Método para obtener una transacción
  async transaction<T>(
    callback: (tx: NodePgDatabase<typeof schema>) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const txDb = drizzle(client, { schema });
      const result = await callback(txDb);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
