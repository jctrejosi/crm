import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  appNotifications,
  competitorCategories,
  competitorIngestRuns,
  competitorPrices,
  competitorProductCategories,
  competitorProducts,
  competitorStores,
} from '../../../drizzle/schema';
import {
  MARKET_PRICE_BRACKETS,
  MARKET_REQUEST_DELAY_MS,
  MARKET_STORES,
  MARKET_STORE_KEYS,
  VTEX_MAX_WINDOW,
  VTEX_PAGE_SIZE,
  type MarketStoreConfig,
  type MarketStoreKey,
} from './market.config';
import {
  parseVtexProduct,
  type ParsedCompetitorProduct,
} from './market-parser';
import {
  VtexClient,
  type VtexCategoryNode,
  type VtexRawProduct,
} from './vtex.client';

type RunStatus = 'running' | 'success' | 'partial' | 'failed';

interface PricePartition {
  min: number;
  max: number;
}

interface RunState {
  phase: string;
  seen: Set<string>;
  seenCount: number;
  upserted: number;
  changed: number;
  skipped: number;
  errors: number;
  pending: number;
  aborted: boolean;
  lastProgressAt: number;
  lastError: string | null;
}

interface RunContext {
  store: MarketStoreConfig;
  client: VtexClient;
  runId: number;
  state: RunState;
  queue: PricePartition[];
  categoryMap: Map<string, number>;
  leafPaths: string[];
}

export interface RunOutcome {
  storeId: MarketStoreKey;
  runId: number;
  status: RunStatus;
  totalEstimated: number;
  productsSeen: number;
  productsUpserted: number;
  pricesChanged: number;
  errorsCount: number;
  durationMs: number;
  errorMessage: string | null;
}

const PRODUCT_BATCH_SIZE = 500;
const CATEGORY_BATCH_SIZE = 500;
const HISTORY_BATCH_SIZE = 1000;
const MAX_PRICE = 999_999_999_999;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const formatPriceBound = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

/**
 * Ingesta diaria de los catálogos de la competencia.
 *
 * Estrategia:
 * 1. Árbol de categorías → `competitor_categories`.
 * 2. Catálogo completo troceado por **rangos de precio** (VTEX limita cada
 *    consulta a 2.500 resultados). Los tramos grandes se subdividen.
 * 3. Upsert por lotes en `competitor_products`; el histórico
 *    (`competitor_prices`) solo guarda cambios de precio.
 * 4. Si algo falla, la corrida queda `partial`/`failed` y se crea una
 *    notificación para el dashboard y la campana.
 */
@Injectable()
export class MarketIngestService {
  private readonly logger = new Logger(MarketIngestService.name);
  private readonly active = new Set<MarketStoreKey>();
  /** Súpers encolados por un trigger manual (corren uno detrás de otro). */
  private readonly queued = new Set<MarketStoreKey>();

  constructor(private readonly drizzle: DrizzleService) {}

  private get db() {
    return this.drizzle.db;
  }

  /** Crea/actualiza las filas de `competitor_stores` a partir de la config. */
  async syncStores(): Promise<void> {
    for (const store of Object.values(MARKET_STORES)) {
      await this.db
        .insert(competitorStores)
        .values({
          id: store.id,
          name: store.name,
          baseUrl: store.siteUrl,
          categoryTreeLevels: store.categoryTreeLevels,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: competitorStores.id,
          set: {
            name: store.name,
            baseUrl: store.siteUrl,
            categoryTreeLevels: store.categoryTreeLevels,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  isRunning(storeId: MarketStoreKey): boolean {
    return this.active.has(storeId) || this.queued.has(storeId);
  }

  /**
   * Cierra las corridas que quedaron en `running` por un corte del proceso.
   * El CRM corre en una sola instancia, así que al arrancar ninguna corrida
   * previa puede seguir viva. Debe llamarse al arrancar el backend.
   */
  async recoverStaleRuns(): Promise<number> {
    const stale = await this.db
      .select()
      .from(competitorIngestRuns)
      .where(eq(competitorIngestRuns.status, 'running'));

    for (const run of stale) {
      const store = MARKET_STORES[run.storeId as MarketStoreKey];
      const message =
        'La corrida quedó interrumpida (el backend se reinició antes de terminar).';
      await this.db
        .update(competitorIngestRuns)
        .set({
          status: 'failed',
          finishedAt: sql`now()`,
          errorMessage: message,
        })
        .where(eq(competitorIngestRuns.id, run.id));

      await this.notifyFailure(
        run.storeId,
        run.id,
        store?.name ?? run.storeId,
        'failed',
        run.productsSeen ?? 0,
        run.totalEstimated ?? 0,
        message,
      );
    }

    if (stale.length) {
      this.logger.warn(
        `Se marcaron ${stale.length} corrida(s) interrumpida(s) como fallidas.`,
      );
    }
    return stale.length;
  }

  /**
   * Lanza una ingesta manual sin bloquear la petición HTTP. Los súpers se
   * procesan en serie para no saturar la red ni los sitios de origen.
   */
  trigger(
    storeIds: MarketStoreKey[],
    trigger: 'manual' | 'scheduled' | 'startup' = 'manual',
  ): MarketStoreKey[] {
    const started: MarketStoreKey[] = [];
    for (const storeId of storeIds) {
      if (
        !MARKET_STORES[storeId] ||
        this.active.has(storeId) ||
        this.queued.has(storeId)
      ) {
        continue;
      }
      this.queued.add(storeId);
      started.push(storeId);
    }

    if (started.length) {
      void (async () => {
        for (const storeId of started) {
          try {
            await this.runStore(storeId, trigger);
          } catch (error) {
            this.logger.error(
              `Ingesta de ${storeId} terminó con excepción no controlada: ${this.errorMessage(error)}`,
            );
          } finally {
            this.queued.delete(storeId);
          }
        }
      })();
    }

    return started;
  }

  /** Ingesta secuencial (la usa el cron para no saturar la red). */
  async runAllSequential(
    trigger: 'manual' | 'scheduled' | 'startup' = 'scheduled',
  ): Promise<RunOutcome[]> {
    const outcomes: RunOutcome[] = [];
    for (const storeId of MARKET_STORE_KEYS) {
      if (this.active.has(storeId) || this.queued.has(storeId)) continue;
      outcomes.push(await this.runStore(storeId, trigger));
    }
    return outcomes;
  }

  /**
   * Ejecuta la ingesta de un súper. Nunca lanza: devuelve el resultado y deja
   * la corrida registrada en BD.
   */
  async runStore(
    storeId: MarketStoreKey,
    trigger: 'manual' | 'scheduled' | 'startup' = 'manual',
  ): Promise<RunOutcome> {
    const store = MARKET_STORES[storeId];
    const startedAtMs = Date.now();

    if (this.active.has(storeId)) {
      throw new Error(`La ingesta de ${store.name} ya está en curso`);
    }
    this.active.add(storeId);

    let runId = 0;
    let totalEstimated = 0;

    const state: RunState = {
      phase: 'started',
      seen: new Set<string>(),
      seenCount: 0,
      upserted: 0,
      changed: 0,
      skipped: 0,
      errors: 0,
      pending: 0,
      aborted: false,
      lastProgressAt: 0,
      lastError: null,
    };

    try {
      await this.syncStores();

      // Si quedó una corrida colgada (reinicio del backend), se cierra.
      await this.db
        .update(competitorIngestRuns)
        .set({
          status: 'failed',
          finishedAt: sql`now()`,
          errorMessage: 'Reemplazada por una nueva corrida.',
        })
        .where(
          and(
            eq(competitorIngestRuns.storeId, storeId),
            eq(competitorIngestRuns.status, 'running'),
          ),
        );

      const [run] = await this.db
        .insert(competitorIngestRuns)
        .values({ storeId, status: 'running', trigger, phase: 'categories' })
        .returning({ id: competitorIngestRuns.id });
      runId = run.id;

      this.logger.log(`▶ Ingesta de ${store.name} iniciada (run #${runId})`);

      const client = new VtexClient(store);

      // 1) Categorías -----------------------------------------------------
      const tree = await client.fetchCategoryTree();
      const categoryRows = this.flattenTree(tree);
      await this.upsertCategories(storeId, categoryRows);
      const categoryMap = await this.loadCategoryMap(storeId);
      const leafPaths = categoryRows
        .filter((c) => c.isLeaf)
        .map((c) => c.idPath);

      state.phase = 'counting';
      await this.updateProgress(runId, state, true);

      // 2) Catálogo completo --------------------------------------------
      const fullFilter = `P:[0.01 TO ${MAX_PRICE}]`;
      totalEstimated = await client.countProducts([fullFilter]);
      await this.db
        .update(competitorIngestRuns)
        .set({ totalEstimated, phase: 'products' })
        .where(eq(competitorIngestRuns.id, runId));

      if (totalEstimated <= 0) {
        throw new Error('La API no devolvió productos con precio.');
      }

      const ctx: RunContext = {
        store,
        client,
        runId,
        state,
        queue: MARKET_PRICE_BRACKETS.map(([min, max]) => ({ min, max })),
        categoryMap,
        leafPaths,
      };
      state.pending = ctx.queue.length;

      const workerCount = Math.max(
        1,
        Math.min(store.concurrency, ctx.queue.length),
      );
      this.logger.log(
        `${store.name}: ${totalEstimated.toLocaleString('es-CO')} productos estimados; ` +
          `${ctx.queue.length} tramos de precio; ${workerCount} workers.`,
      );

      await Promise.all(
        Array.from({ length: workerCount }, () =>
          this.worker(ctx, new Map<string, ParsedCompetitorProduct>()),
        ),
      );

      // 3) Estado final --------------------------------------------------
      // El conteo puede variar ligeramente durante la corrida (precios que
      // cambian); nunca reportamos más de 100 %.
      const coverage =
        totalEstimated > 0 ? Math.min(1, state.seenCount / totalEstimated) : 0;
      let status: RunStatus;
      if (state.seenCount === 0) status = 'failed';
      else if (state.errors > 0 || coverage < 0.85) status = 'partial';
      else status = 'success';

      // Solo desactivamos lo que no apareció si la cobertura es buena; con una
      // corrida parcial podríamos desactivar productos que sí existen.
      if (status === 'success') {
        await this.db
          .update(competitorProducts)
          .set({ isActive: false, updatedAt: sql`now()` })
          .where(
            and(
              eq(competitorProducts.storeId, storeId),
              lt(
                competitorProducts.lastSeenAt,
                new Date(startedAtMs).toISOString(),
              ),
            ),
          );
      }

      const durationMs = Date.now() - startedAtMs;
      const errorMessage =
        status === 'success'
          ? null
          : (state.lastError ??
            (coverage < 0.85
              ? `Cobertura baja: ${(coverage * 100).toFixed(1)} % del catálogo.`
              : null));

      await this.db
        .update(competitorIngestRuns)
        .set({
          status,
          phase: 'done',
          finishedAt: sql`now()`,
          lastProgressAt: sql`now()`,
          durationMs,
          totalEstimated,
          categoriesSynced: categoryRows.length,
          productsSeen: state.seenCount,
          productsUpserted: state.upserted,
          pricesChanged: state.changed,
          productsSkipped: state.skipped,
          errorsCount: state.errors,
          errorMessage,
        })
        .where(eq(competitorIngestRuns.id, runId));

      if (status !== 'success') {
        await this.notifyFailure(
          storeId,
          runId,
          store.name,
          status,
          state.seenCount,
          totalEstimated,
          errorMessage,
        );
      }

      this.logger.log(
        `${status === 'success' ? '✅' : '⚠️'} ${store.name}: ` +
          `${state.seenCount.toLocaleString('es-CO')} productos ` +
          `(${(coverage * 100).toFixed(1)} %), ` +
          `${state.changed.toLocaleString('es-CO')} cambios de precio, ` +
          `${state.errors} error(es) en ${(durationMs / 1000).toFixed(0)} s.`,
      );

      return {
        storeId,
        runId,
        status,
        totalEstimated,
        productsSeen: state.seenCount,
        productsUpserted: state.upserted,
        pricesChanged: state.changed,
        errorsCount: state.errors,
        durationMs,
        errorMessage,
      };
    } catch (error) {
      const fatal = this.errorMessage(error);
      state.aborted = true;
      this.logger.error(`❌ Ingesta de ${store.name} falló: ${fatal}`);

      const durationMs = Date.now() - startedAtMs;
      if (runId) {
        await this.db
          .update(competitorIngestRuns)
          .set({
            status: 'failed',
            phase: 'done',
            finishedAt: sql`now()`,
            lastProgressAt: sql`now()`,
            durationMs,
            totalEstimated,
            productsSeen: state.seenCount,
            productsUpserted: state.upserted,
            pricesChanged: state.changed,
            productsSkipped: state.skipped,
            errorsCount: state.errors + 1,
            errorMessage: fatal,
          })
          .where(eq(competitorIngestRuns.id, runId));

        await this.notifyFailure(
          storeId,
          runId,
          store.name,
          'failed',
          state.seenCount,
          totalEstimated,
          fatal,
        );
      }

      return {
        storeId,
        runId,
        status: 'failed',
        totalEstimated,
        productsSeen: state.seenCount,
        productsUpserted: state.upserted,
        pricesChanged: state.changed,
        errorsCount: state.errors + 1,
        durationMs,
        errorMessage: fatal,
      };
    } finally {
      this.active.delete(storeId);
    }
  }

  // ── Árbol de categorías ─────────────────────────────────────────────

  private flattenTree(nodes: VtexCategoryNode[]): Array<{
    externalId: string;
    parentExternalId: string | null;
    idPath: string;
    name: string;
    level: number;
    isLeaf: boolean;
  }> {
    const rows: Array<{
      externalId: string;
      parentExternalId: string | null;
      idPath: string;
      name: string;
      level: number;
      isLeaf: boolean;
    }> = [];

    const walk = (
      list: VtexCategoryNode[],
      parentPath: string,
      parentId: string | null,
      level: number,
    ) => {
      for (const node of list ?? []) {
        const externalId = String(node.id);
        const idPath = `${parentPath}/${externalId}/`;
        const children = node.children ?? [];
        rows.push({
          externalId,
          parentExternalId: parentId,
          idPath,
          name: node.name?.trim() || externalId,
          level,
          isLeaf: children.length === 0,
        });
        if (children.length) {
          walk(children, idPath, externalId, level + 1);
        }
      }
    };

    walk(nodes, '', null, 1);
    return rows;
  }

  private async upsertCategories(
    storeId: string,
    rows: Array<{
      externalId: string;
      parentExternalId: string | null;
      idPath: string;
      name: string;
      level: number;
      isLeaf: boolean;
    }>,
  ): Promise<void> {
    // Dedupe defensivo por externalId.
    const unique = new Map(rows.map((row) => [row.externalId, row]));
    const values = [...unique.values()];

    for (let i = 0; i < values.length; i += CATEGORY_BATCH_SIZE) {
      const batch = values.slice(i, i + CATEGORY_BATCH_SIZE);
      await this.db
        .insert(competitorCategories)
        .values(batch.map((row) => ({ storeId, ...row })))
        .onConflictDoUpdate({
          target: [
            competitorCategories.storeId,
            competitorCategories.externalId,
          ],
          set: {
            parentExternalId: sql`excluded.parent_external_id`,
            idPath: sql`excluded.id_path`,
            name: sql`excluded.name`,
            level: sql`excluded.level`,
            isLeaf: sql`excluded.is_leaf`,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  private async loadCategoryMap(storeId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        id: competitorCategories.id,
        externalId: competitorCategories.externalId,
      })
      .from(competitorCategories)
      .where(eq(competitorCategories.storeId, storeId));
    return new Map(rows.map((row) => [row.externalId, row.id]));
  }

  // ── Workers y particiones ───────────────────────────────────────────

  private async worker(
    ctx: RunContext,
    buffer: Map<string, ParsedCompetitorProduct>,
  ): Promise<void> {
    while (ctx.state.pending > 0 && !ctx.state.aborted) {
      const partition = ctx.queue.shift();
      if (!partition) {
        await sleep(60);
        continue;
      }

      try {
        await this.processPartition(ctx, partition, buffer);
      } catch (error) {
        ctx.state.errors += 1;
        ctx.state.lastError = this.errorMessage(error);
        this.logger.warn(
          `${ctx.store.name} · tramo ${formatPriceBound(partition.min)}–${formatPriceBound(partition.max)}: ${ctx.state.lastError}`,
        );
      } finally {
        ctx.state.pending -= 1;
      }

      if (buffer.size >= PRODUCT_BATCH_SIZE) {
        await this.flushProducts(ctx, buffer);
      }
      await this.updateProgress(ctx.runId, ctx.state);
    }

    if (buffer.size) {
      await this.flushProducts(ctx, buffer);
    }
  }

  private async processPartition(
    ctx: RunContext,
    partition: PricePartition,
    buffer: Map<string, ParsedCompetitorProduct>,
  ): Promise<void> {
    const filters = this.partitionFilters(partition);
    const total = await ctx.client.countProducts(filters);

    if (total === 0) return;

    if (total <= VTEX_MAX_WINDOW) {
      await this.paginate(ctx, filters, total, buffer);
      return;
    }

    // Más de 2.500 resultados: partir el tramo de precio a la mitad.
    if (partition.max > partition.min) {
      const mid = Math.floor((partition.min + partition.max) / 2);
      if (mid >= partition.min && mid < partition.max) {
        ctx.state.pending += 2;
        ctx.queue.push(
          { min: partition.min, max: mid },
          { min: mid + 1, max: partition.max },
        );
        return;
      }
    }

    // Mismo precio con más de 2.500 productos: repartir por categoría hoja.
    this.logger.warn(
      `${ctx.store.name}: el tramo ${formatPriceBound(partition.min)}–${formatPriceBound(partition.max)} ` +
        `tiene ${total} productos y no se puede dividir por precio; ` +
        `se reparte por categorías.`,
    );
    await this.ingestPartitionByCategory(ctx, partition, buffer);
  }

  private partitionFilters(partition: PricePartition): string[] {
    return [
      `P:[${formatPriceBound(partition.min)} TO ${formatPriceBound(partition.max)}]`,
    ];
  }

  private async paginate(
    ctx: RunContext,
    filters: string[],
    total: number,
    buffer: Map<string, ParsedCompetitorProduct>,
  ): Promise<void> {
    const end = Math.min(total, VTEX_MAX_WINDOW);
    for (let from = 0; from < end; from += VTEX_PAGE_SIZE) {
      const to = Math.min(from + VTEX_PAGE_SIZE - 1, end - 1);
      const page = await ctx.client.searchProducts(filters, from, to);
      this.ingestProducts(ctx, page.products, buffer);
      await ctx.client.throttle(MARKET_REQUEST_DELAY_MS);

      if (buffer.size >= PRODUCT_BATCH_SIZE) {
        await this.flushProducts(ctx, buffer);
      }
      await this.updateProgress(ctx.runId, ctx.state);

      if (page.products.length === 0) break;
    }
  }

  private async ingestPartitionByCategory(
    ctx: RunContext,
    partition: PricePartition,
    buffer: Map<string, ParsedCompetitorProduct>,
  ): Promise<void> {
    const priceFilter = this.partitionFilters(partition)[0];
    for (const idPath of ctx.leafPaths) {
      const filters = [`C:${idPath}`, priceFilter];
      const total = await ctx.client.countProducts(filters);
      if (total === 0) continue;

      if (total > VTEX_MAX_WINDOW) {
        ctx.state.errors += 1;
        ctx.state.lastError =
          `La categoría ${idPath} tiene ${total} productos en un solo precio; ` +
          `se ingirieron los primeros ${VTEX_MAX_WINDOW}.`;
        this.logger.warn(`${ctx.store.name}: ${ctx.state.lastError}`);
      }
      await this.paginate(
        ctx,
        filters,
        Math.min(total, VTEX_MAX_WINDOW),
        buffer,
      );
    }
  }

  private ingestProducts(
    ctx: RunContext,
    products: VtexRawProduct[],
    buffer: Map<string, ParsedCompetitorProduct>,
  ): void {
    for (const raw of products) {
      const parsed = parseVtexProduct(raw, ctx.store);
      if (!parsed) {
        ctx.state.skipped += 1;
        continue;
      }
      if (ctx.state.seen.has(parsed.externalId)) continue;
      ctx.state.seen.add(parsed.externalId);
      ctx.state.seenCount = ctx.state.seen.size;
      buffer.set(parsed.externalId, parsed);
    }
  }

  // ── Persistencia ────────────────────────────────────────────────────

  private async flushProducts(
    ctx: RunContext,
    buffer: Map<string, ParsedCompetitorProduct>,
  ): Promise<void> {
    if (buffer.size === 0) return;

    const rows = [...buffer.values()];
    buffer.clear();
    const rowByExternalId = new Map(rows.map((r) => [r.externalId, r]));
    const externalIds = rows.map((r) => r.externalId);

    const previous = await this.db
      .select({
        id: competitorProducts.id,
        externalId: competitorProducts.externalId,
        price: competitorProducts.price,
      })
      .from(competitorProducts)
      .where(
        and(
          eq(competitorProducts.storeId, ctx.store.id),
          inArray(competitorProducts.externalId, externalIds),
        ),
      );
    const previousByExternalId = new Map(
      previous.map((row) => [row.externalId, row]),
    );

    const upserted = await this.db
      .insert(competitorProducts)
      .values(
        rows.map((r) => ({
          storeId: ctx.store.id,
          externalId: r.externalId,
          plu: r.plu,
          ean: r.ean,
          name: r.name,
          brand: r.brand,
          url: r.url,
          imageUrl: r.imageUrl,
          measurementUnit: r.measurementUnit,
          unitValue: r.unitValue,
          price: r.price,
          listPrice: r.listPrice,
          isAvailable: r.isAvailable,
          availableQuantity: r.availableQuantity,
          isActive: true,
          lastSeenAt: sql`now()`,
          priceUpdatedAt: sql`now()`,
          updatedAt: sql`now()`,
        })),
      )
      .onConflictDoUpdate({
        target: [competitorProducts.storeId, competitorProducts.externalId],
        set: {
          plu: sql`excluded.plu`,
          ean: sql`excluded.ean`,
          name: sql`excluded.name`,
          brand: sql`excluded.brand`,
          url: sql`excluded.url`,
          imageUrl: sql`excluded.image_url`,
          measurementUnit: sql`excluded.measurement_unit`,
          unitValue: sql`excluded.unit_value`,
          price: sql`excluded.price`,
          listPrice: sql`excluded.list_price`,
          isAvailable: sql`excluded.is_available`,
          availableQuantity: sql`excluded.available_quantity`,
          isActive: sql`true`,
          lastSeenAt: sql`now()`,
          priceUpdatedAt: sql`case
            when ${competitorProducts.price} is distinct from excluded.price
              then now()
            else ${competitorProducts.priceUpdatedAt}
          end`,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: competitorProducts.id,
        externalId: competitorProducts.externalId,
      });

    ctx.state.upserted += upserted.length;

    // Histórico: solo cuando el precio cambia (o el producto es nuevo).
    const history: Array<{
      productId: number;
      runId: number;
      price: string;
      listPrice: string | null;
      isAvailable: boolean;
      availableQuantity: number | null;
    }> = [];

    for (const row of upserted) {
      const parsed = rowByExternalId.get(row.externalId);
      if (!parsed) continue;
      const prev = previousByExternalId.get(row.externalId);
      const priceChanged =
        !prev ||
        prev.price === null ||
        Number(prev.price) !== Number(parsed.price);
      if (!priceChanged) continue;

      history.push({
        productId: row.id,
        runId: ctx.runId,
        price: parsed.price,
        listPrice: parsed.listPrice,
        isAvailable: parsed.isAvailable,
        availableQuantity: parsed.availableQuantity,
      });
    }

    for (let i = 0; i < history.length; i += HISTORY_BATCH_SIZE) {
      await this.db
        .insert(competitorPrices)
        .values(history.slice(i, i + HISTORY_BATCH_SIZE));
    }
    ctx.state.changed += history.length;

    // Relación producto ↔ categoría (se ignora si ya existe).
    const links: Array<{ productId: number; categoryId: number }> = [];
    for (const row of upserted) {
      const parsed = rowByExternalId.get(row.externalId);
      if (!parsed) continue;
      for (const externalId of parsed.categoryExternalIds) {
        const categoryId = ctx.categoryMap.get(externalId);
        if (categoryId) links.push({ productId: row.id, categoryId });
      }
    }
    for (let i = 0; i < links.length; i += HISTORY_BATCH_SIZE) {
      await this.db
        .insert(competitorProductCategories)
        .values(links.slice(i, i + HISTORY_BATCH_SIZE))
        .onConflictDoNothing();
    }

    await this.updateProgress(ctx.runId, ctx.state, true);
  }

  private async updateProgress(
    runId: number,
    state: RunState,
    force = false,
  ): Promise<void> {
    if (!runId) return;
    const now = Date.now();
    if (!force && now - state.lastProgressAt < 5_000) return;
    state.lastProgressAt = now;

    await this.db
      .update(competitorIngestRuns)
      .set({
        phase: state.phase,
        productsSeen: state.seenCount,
        productsUpserted: state.upserted,
        pricesChanged: state.changed,
        productsSkipped: state.skipped,
        errorsCount: state.errors,
        lastProgressAt: sql`now()`,
      })
      .where(eq(competitorIngestRuns.id, runId));
  }

  private async notifyFailure(
    storeId: string,
    runId: number,
    storeName: string,
    status: RunStatus,
    productsSeen: number,
    totalEstimated: number,
    errorMessage: string | null,
  ): Promise<void> {
    if (status === 'success') return;

    const coverage =
      totalEstimated > 0
        ? Math.min(100, (productsSeen / totalEstimated) * 100)
        : 0;
    const failed = status === 'failed';
    const bodyParts = [
      `${productsSeen.toLocaleString('es-CO')} de ${totalEstimated.toLocaleString('es-CO')} productos (${coverage.toFixed(1)} %).`,
    ];
    if (errorMessage) bodyParts.push(errorMessage);

    await this.db.insert(appNotifications).values({
      severity: failed ? 'error' : 'warning',
      source: 'mercado',
      storeId,
      runId,
      title: failed
        ? `Falló la ingesta de ${storeName}`
        : `Ingesta incompleta de ${storeName}`,
      body: bodyParts.join(' '),
      actionUrl: '/mercado',
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
