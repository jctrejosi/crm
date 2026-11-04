import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  appNotifications,
  competitorIngestRuns,
  competitorProducts,
  competitorStores,
} from '../../../drizzle/schema';
import {
  MARKET_STALE_DATA_HOURS,
  MARKET_STORES,
  MARKET_STORE_KEYS,
  type MarketStoreKey,
} from './market.config';
import { MarketIngestService } from './market-ingest.service';

export type StoreHealth =
  'ok' | 'running' | 'pending' | 'warning' | 'error' | 'stale';

@Injectable()
export class MarketService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly ingest: MarketIngestService,
  ) {}

  private get db() {
    return this.drizzle.db;
  }

  /** Estado consolidado para el banner de `/Mercado` y la campana. */
  async status() {
    const stores = await this.db
      .select()
      .from(competitorStores)
      .orderBy(competitorStores.name);

    const result: any[] = [];
    const alerts: any[] = [];
    const now = Date.now();

    for (const store of stores) {
      const [lastRun] = await this.db
        .select()
        .from(competitorIngestRuns)
        .where(eq(competitorIngestRuns.storeId, store.id))
        .orderBy(desc(competitorIngestRuns.startedAt))
        .limit(1);

      const [lastSuccess] = await this.db
        .select({
          id: competitorIngestRuns.id,
          finishedAt: competitorIngestRuns.finishedAt,
        })
        .from(competitorIngestRuns)
        .where(
          and(
            eq(competitorIngestRuns.storeId, store.id),
            eq(competitorIngestRuns.status, 'success'),
          ),
        )
        .orderBy(desc(competitorIngestRuns.finishedAt))
        .limit(1);

      const [{ value: activeProducts }] = await this.db
        .select({ value: count() })
        .from(competitorProducts)
        .where(
          and(
            eq(competitorProducts.storeId, store.id),
            eq(competitorProducts.isActive, true),
          ),
        );

      const isRunning =
        this.ingest.isRunning(store.id as MarketStoreKey) ||
        lastRun?.status === 'running';

      const successAt = lastSuccess?.finishedAt
        ? new Date(lastSuccess.finishedAt).getTime()
        : null;
      const dataAgeHours =
        successAt !== null ? (now - successAt) / 3_600_000 : null;

      let health: StoreHealth = 'ok';
      if (isRunning) health = 'running';
      else if (!lastRun) health = 'pending';
      else if (lastRun.status === 'failed') health = 'error';
      else if (lastRun.status === 'partial') health = 'warning';
      else if (
        dataAgeHours !== null &&
        dataAgeHours > MARKET_STALE_DATA_HOURS
      ) {
        health = 'stale';
      }

      const coveragePct =
        lastRun && lastRun.totalEstimated > 0
          ? Math.min(100, (lastRun.productsSeen / lastRun.totalEstimated) * 100)
          : null;

      result.push({
        id: store.id,
        name: store.name,
        baseUrl: store.baseUrl,
        isActive: store.isActive,
        isRunning,
        health,
        activeProducts: Number(activeProducts),
        dataAgeHours:
          dataAgeHours !== null ? Number(dataAgeHours.toFixed(1)) : null,
        lastSuccessAt: lastSuccess?.finishedAt ?? null,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              trigger: lastRun.trigger,
              phase: lastRun.phase,
              startedAt: lastRun.startedAt,
              finishedAt: lastRun.finishedAt,
              durationMs: lastRun.durationMs,
              totalEstimated: lastRun.totalEstimated,
              productsSeen: lastRun.productsSeen,
              productsUpserted: lastRun.productsUpserted,
              pricesChanged: lastRun.pricesChanged,
              errorsCount: lastRun.errorsCount,
              errorMessage: lastRun.errorMessage,
              coveragePct:
                coveragePct !== null ? Number(coveragePct.toFixed(1)) : null,
              progressPct:
                isRunning && lastRun.totalEstimated > 0
                  ? Number(
                      Math.min(
                        100,
                        (lastRun.productsSeen / lastRun.totalEstimated) * 100,
                      ).toFixed(1),
                    )
                  : null,
            }
          : null,
      });

      if (health === 'error' || health === 'warning' || health === 'stale') {
        alerts.push({
          storeId: store.id,
          storeName: store.name,
          health,
          title:
            health === 'error'
              ? `La última ingesta de ${store.name} falló`
              : health === 'warning'
                ? `La última ingesta de ${store.name} quedó incompleta`
                : `Los precios de ${store.name} están desactualizados`,
          message:
            lastRun?.errorMessage ??
            (health === 'stale' && dataAgeHours !== null
              ? `Sin datos nuevos hace ${Math.round(dataAgeHours)} h.`
              : null),
          runId: lastRun?.id ?? null,
          startedAt: lastRun?.startedAt ?? null,
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      staleDataHours: MARKET_STALE_DATA_HOURS,
      stores: result,
      alerts,
    };
  }

  async runs(storeId?: string, limit = 50) {
    if (storeId && !MARKET_STORES[storeId as MarketStoreKey]) {
      throw new BadRequestException(`Tienda desconocida: ${storeId}`);
    }
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

    return this.db
      .select()
      .from(competitorIngestRuns)
      .where(storeId ? eq(competitorIngestRuns.storeId, storeId) : sql`true`)
      .orderBy(desc(competitorIngestRuns.startedAt))
      .limit(safeLimit);
  }

  async notifications(unreadOnly = false, limit = 30) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
    return this.db
      .select()
      .from(appNotifications)
      .where(unreadOnly ? isNull(appNotifications.readAt) : sql`true`)
      .orderBy(desc(appNotifications.createdAt))
      .limit(safeLimit);
  }

  async markNotificationRead(id: string) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new BadRequestException('Id de notificación inválido');
    }
    const [updated] = await this.db
      .update(appNotifications)
      .set({ readAt: sql`now()` })
      .where(eq(appNotifications.id, numericId))
      .returning();
    if (!updated) throw new NotFoundException('Notificación no encontrada');
    return updated;
  }

  async markAllNotificationsRead() {
    const updated = await this.db
      .update(appNotifications)
      .set({ readAt: sql`now()` })
      .where(isNull(appNotifications.readAt))
      .returning({ id: appNotifications.id });
    return { updated: updated.length };
  }

  /** Dispara la ingesta manual (no bloquea la respuesta). */
  trigger(storeId?: string) {
    let storeIds: MarketStoreKey[];
    if (storeId) {
      if (!MARKET_STORES[storeId as MarketStoreKey]) {
        throw new BadRequestException(`Tienda desconocida: ${storeId}`);
      }
      storeIds = [storeId as MarketStoreKey];
    } else {
      storeIds = [...MARKET_STORE_KEYS];
    }

    const started = this.ingest.trigger(storeIds, 'manual');
    const skipped = storeIds.filter((id) => !started.includes(id));

    return {
      started,
      skipped,
      alreadyRunning: skipped,
    };
  }
}
