import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../drizzle/schema';

/**
 * Crea una instancia directa de Drizzle (sin NestJS)
 * Útil para scripts o migraciones
 */
export function createDirectDb(
  databaseUrl?: string,
): NodePgDatabase<typeof schema> {
  const url = databaseUrl ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30000,
  });

  return drizzle(pool, { schema });
}

/**
 * Crea un pool de conexiones para uso directo
 */
export function createPool(databaseUrl: string) {
  return new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}
