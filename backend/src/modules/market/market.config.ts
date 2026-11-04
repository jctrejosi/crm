/**
 * Configuración de los supermercados competidores.
 *
 * Todas las cadenas usan la API legacy de VTEX
 * (`/api/catalog_system/pub/...`). Éxito y Carulla la exponen bajo `/io`,
 * Olímpica y D1 directamente bajo `/api`.
 *
 * Las URLs y el comportamiento de paginación fueron validados contra las APIs
 * en vivo (ver README del módulo).
 */
export type MarketStoreKey = 'exito' | 'carulla' | 'olimpica' | 'd1';

export interface MarketStoreConfig {
  /** Slug estable; es la PK de `competitor_stores`. */
  id: MarketStoreKey;
  /** Nombre comercial que se muestra en el dashboard. */
  name: string;
  /** Raíz del sitio (para armar las URLs de producto y mostrar en la UI). */
  siteUrl: string;
  /** Prefijo del API legacy. */
  apiPrefix: string;
  /** Profundidad del árbol de categorías que acepta cada API. */
  categoryTreeLevels: number;
  /** Peticiones HTTP simultáneas durante la ingesta. */
  concurrency: number;
  /** Plantilla de la ficha pública del producto. */
  productUrl: (linkText: string) => string;
}

const envInt = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
};

/** Pausa entre peticiones por worker (ms) para no gatillar rate limits. */
export const MARKET_REQUEST_DELAY_MS = envInt('MARKET_REQUEST_DELAY_MS', 120);

/** Se apaga con `MARKET_INGEST_ENABLED=false` (p. ej. en tests locales). */
export const MARKET_INGEST_ENABLED =
  (process.env.MARKET_INGEST_ENABLED ?? 'true').toLowerCase() !== 'false';

/** Antigüedad a partir de la cual la UI considera los precios desactualizados. */
export const MARKET_STALE_DATA_HOURS = envInt('MARKET_STALE_DATA_HOURS', 36);

/**
 * Zona horaria del cron. El CRM opera en Colombia.
 * Nota: `@Cron` es estático; la hora se fija en el scheduler.
 */
export const MARKET_TIMEZONE = 'America/Bogota';

export const MARKET_STORES: Record<MarketStoreKey, MarketStoreConfig> = {
  exito: {
    id: 'exito',
    name: 'Éxito',
    siteUrl: 'https://tienda.exito.com',
    apiPrefix: '/io/api',
    categoryTreeLevels: 50,
    concurrency: envInt('MARKET_CONCURRENCY_EXITO', 6),
    productUrl: (linkText) => `https://tienda.exito.com/${linkText}/p`,
  },
  carulla: {
    id: 'carulla',
    name: 'Carulla',
    siteUrl: 'https://www.carulla.com',
    apiPrefix: '/io/api',
    categoryTreeLevels: 50,
    concurrency: envInt('MARKET_CONCURRENCY_CARULLA', 4),
    productUrl: (linkText) => `https://www.carulla.com/${linkText}/p`,
  },
  olimpica: {
    id: 'olimpica',
    name: 'Olímpica',
    siteUrl: 'https://www.olimpica.com',
    apiPrefix: '/api',
    categoryTreeLevels: 20,
    concurrency: envInt('MARKET_CONCURRENCY_OLIMPICA', 4),
    productUrl: (linkText) => `https://www.olimpica.com/${linkText}/p`,
  },
  d1: {
    id: 'd1',
    name: 'D1',
    siteUrl: 'https://d1tiendas.vtexcommercestable.com.br',
    apiPrefix: '/api',
    categoryTreeLevels: 50,
    concurrency: envInt('MARKET_CONCURRENCY_D1', 2),
    productUrl: (linkText) =>
      `https://d1tiendas.vtexcommercestable.com.br/${linkText}/p`,
  },
};

export const MARKET_STORE_KEYS = Object.keys(MARKET_STORES) as MarketStoreKey[];

/**
 * Tramos de precio iniciales (COP) para partir el catálogo.
 *
 * VTEX solo permite `_from <= 2500` por consulta; un catálogo como el de Éxito
 * (300k+ productos) hay que trocearlo. Usamos rangos de precio porque cubren
 * todo el catálogo sin depender de categorías (un producto puede pertenecer a
 * varias y se duplicaría). Los tramos que excedan 2.500 se subdividen
 * recursivamente.
 */
export const MARKET_PRICE_BRACKETS: ReadonlyArray<readonly [number, number]> = [
  [0.01, 500],
  [501, 1000],
  [1001, 1500],
  [1501, 2000],
  [2001, 2500],
  [2501, 3000],
  [3001, 4000],
  [4001, 5000],
  [5001, 7000],
  [7001, 10000],
  [10001, 15000],
  [15001, 20000],
  [20001, 30000],
  [30001, 50000],
  [50001, 80000],
  [80001, 120000],
  [120001, 200000],
  [200001, 500000],
  [500001, 1000000],
  [1000001, 1000000000000],
];

/** Máximo de resultados que devuelve VTEX por consulta paginada. */
export const VTEX_MAX_WINDOW = 2500;

/** Tamaño de página. */
export const VTEX_PAGE_SIZE = 48;
