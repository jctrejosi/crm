import { Logger } from '@nestjs/common';
import type { MarketStoreConfig } from './market.config';

/** Nodo del árbol de categorías que devuelve VTEX. */
export interface VtexCategoryNode {
  id: number | string;
  name: string;
  hasChildren?: boolean;
  children?: VtexCategoryNode[];
  url?: string;
}

export interface VtexOffer {
  Price?: number | string;
  ListPrice?: number | string;
  IsAvailable?: boolean;
  AvailableQuantity?: number | string;
}

export interface VtexSeller {
  commertialOffer?: VtexOffer;
}

export interface VtexImage {
  imageUrl?: string;
}

export interface VtexReference {
  Key?: string;
  Value?: string;
}

export interface VtexItem {
  ean?: string;
  measurementUnit?: string;
  unitMultiplier?: number | string;
  images?: VtexImage[];
  sellers?: VtexSeller[];
  referenceId?: VtexReference[];
}

/** Producto tal cual lo devuelve `/products/search` (campos de especificación incluidos). */
export interface VtexRawProduct {
  productId?: string | number;
  productName?: string;
  brand?: string;
  linkText?: string;
  productReference?: string;
  productReferenceCode?: string;
  categoriesIds?: string[];
  ean?: string[] | string;
  items?: VtexItem[];
  /** Especificaciones: "Factor Neto PUM", "Unidad de Medida", etc. */
  [key: string]: unknown;
}

export interface VtexSearchPage {
  products: VtexRawProduct[];
  /** Total de resultados que reporta VTEX en la cabecera `resources`. */
  total: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente mínimo de la API legacy de VTEX.
 *
 * - Paginación `_from`/`_to` **inclusiva**, máximo 2.500 por ventana.
 * - Varios `fq` se envían como parámetros repetidos (`fq=...&fq=...`).
 * - Reintentos con backoff en 429/5xx y errores de red.
 */
export class VtexClient {
  private readonly logger: Logger;

  constructor(private readonly store: MarketStoreConfig) {
    this.logger = new Logger(`VtexClient:${store.id}`);
  }

  private buildUrl(path: string, params: Array<[string, string]>): string {
    const base = `${this.store.siteUrl}${this.store.apiPrefix}${path}`;
    // Ojo: `URLSearchParams` codifica los espacios como `+` y VTEX responde 400
    // en los `fq` (`P:[1 TO 1000]`). `encodeURIComponent` usa `%20`.
    const query = params
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      )
      .join('&');
    return query ? `${base}?${query}` : base;
  }

  private async requestRaw(url: string): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 40_000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'es-CO,es;q=0.9',
            'User-Agent':
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
        });

        // 400/404 son errores de la consulta: reintentar no ayuda.
        if (response.ok || response.status === 400 || response.status === 404) {
          return response;
        }

        lastError = new Error(`HTTP ${response.status} en ${url}`);
        if (response.status === 429 || response.status >= 500) {
          const wait = 600 * 2 ** (attempt - 1) + Math.random() * 400;
          this.logger.warn(
            `${response.status} — reintento ${attempt}/4 en ${Math.round(wait)} ms`,
          );
          await sleep(wait);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        const wait = 600 * 2 ** (attempt - 1) + Math.random() * 400;
        this.logger.warn(
          `Error de red (${(error as Error)?.message ?? error}) — ` +
            `reintento ${attempt}/4 en ${Math.round(wait)} ms`,
        );
        await sleep(wait);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`No se pudo consultar ${url}`);
  }

  /** Árbol completo de categorías. */
  async fetchCategoryTree(): Promise<VtexCategoryNode[]> {
    const url = this.buildUrl(
      `/catalog_system/pub/category/tree/${this.store.categoryTreeLevels}`,
      [],
    );
    const response = await this.requestRaw(url);
    if (!response.ok) {
      throw new Error(
        `Árbol de categorías de ${this.store.name}: HTTP ${response.status}`,
      );
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(
        `Árbol de categorías de ${this.store.name}: respuesta inesperada`,
      );
    }
    return data as VtexCategoryNode[];
  }

  private parseTotal(response: Response): number {
    const header = response.headers.get('resources');
    if (!header) return 0;
    const total = Number(header.split('/').pop());
    return Number.isFinite(total) ? total : 0;
  }

  /**
   * Una página de `/products/search`. `from`/`to` son inclusivos.
   */
  async searchProducts(
    filters: string[],
    from: number,
    to: number,
  ): Promise<VtexSearchPage> {
    const params: Array<[string, string]> = filters.map((fq) => ['fq', fq]);
    params.push(['_from', String(from)], ['_to', String(to)]);
    const url = this.buildUrl('/catalog_system/pub/products/search', params);

    const response = await this.requestRaw(url);
    if (!response.ok) {
      throw new Error(
        `Búsqueda de ${this.store.name} (${from}-${to}): HTTP ${response.status}`,
      );
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`Búsqueda de ${this.store.name}: respuesta inesperada`);
    }
    return {
      products: data as VtexRawProduct[],
      total: this.parseTotal(response),
    };
  }

  /** Cuenta resultados para un conjunto de filtros (petición de 1 registro). */
  async countProducts(filters: string[]): Promise<number> {
    const page = await this.searchProducts(filters, 0, 0);
    return page.total;
  }

  /** Pausa entre peticiones para respetar el ritmo del sitio. */
  async throttle(delayMs: number): Promise<void> {
    if (delayMs > 0) await sleep(delayMs);
  }
}
