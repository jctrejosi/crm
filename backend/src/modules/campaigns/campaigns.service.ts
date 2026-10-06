import {
  BadRequestException,
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  campaignHistory,
  campaignMessages,
  campaignProducts,
  campaignRecipients,
  campaigns,
  customers,
  products,
} from '../../../drizzle/schema';
import {
  CampaignMessageDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

const CHANNELS = ['whatsapp', 'email', 'sms'] as const;
type Channel = (typeof CHANNELS)[number];

/** Orden por defecto del canal prioritario: whatsapp → email → sms. */
const CHANNEL_PRIORITY_ORDER: Channel[] = ['whatsapp', 'email', 'sms'];

/**
 * Resuelve el canal prioritario de una campaña: devuelve el preferido si está
 * entre los canales activos; si no, el primer canal activo en el orden por
 * defecto (whatsapp → email → sms). Sin canales activos devuelve null.
 */
function resolvePriorityChannel(
  channels: readonly string[] | null | undefined,
  preferred: Channel | null | undefined,
): Channel | null {
  const active = (channels ?? []).filter((c): c is Channel =>
    CHANNELS.includes(c as Channel),
  );
  if (preferred && active.includes(preferred)) return preferred;
  return CHANNEL_PRIORITY_ORDER.find((c) => active.includes(c)) ?? null;
}

interface SegRecipient {
  cedula: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  segment?: number;
  features?: {
    frecuencia?: number;
    monetario?: number;
    ticket_promedio?: number;
    categorias_distintas?: number;
  };
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  private get db() {
    return this.drizzle.db;
  }

  private iaServiceUrl(): string {
    return process.env.IA_SERVICE_URL ?? 'http://127.0.0.1:8002';
  }

  private clusteringApiUrl(): string {
    return process.env.CLUSTERING_API_URL ?? 'http://127.0.0.1:8010';
  }

  private clusteringApiKey(): string {
    return process.env.CLUSTERING_API_KEY ?? 'change-me';
  }

  private clusteringModelName(): string {
    return process.env.CLUSTERING_MODEL_NAME ?? 'seg_rfm_v1';
  }

  private xgboostApiUrl(): string {
    return process.env.XGBOOST_API_URL ?? 'http://127.0.0.1:8011';
  }

  private xgboostModel(): string {
    return process.env.XGBOOST_PROPENSITY_MODEL ?? 'prop_activo';
  }

  private upliftApiUrl(): string {
    return process.env.UPLIFT_API_URL ?? 'http://127.0.0.1:8012';
  }

  private upliftModel(): string {
    return process.env.UPLIFT_MODEL ?? 'uplift_dr_learner';
  }

  // Vista RFM de la réplica de analytics (cédula + features). El clustering
  // la lee server-side y devuelve ids (= cédula/NIT) + labels.
  private readonly RFM_QUERY = 'SELECT * FROM analytics.vw_rfm_clientes';
  private readonly RFM_ID_COLUMN = 'cliente_cod';

  /* ── Helpers de serialización (bigint → number) ─── */

  private toCampaign(row: typeof campaigns.$inferSelect) {
    return {
      ...row,
      id: Number(row.id),
      productId: row.productId == null ? null : Number(row.productId),
      createdBy: row.createdBy == null ? null : Number(row.createdBy),
    };
  }

  private toMessage(row: typeof campaignMessages.$inferSelect) {
    return { ...row, id: Number(row.id) };
  }

  private toRecipient(row: typeof campaignRecipients.$inferSelect) {
    const { segmento, ...rest } = row;
    return {
      ...rest,
      // Nombre amigable en la API: segment (no segmento, como la columna).
      segment: segmento ?? null,
      id: Number(row.id),
      customerId: row.customerId == null ? null : Number(row.customerId),
    };
  }

  /** Registra un evento en el historial inmutable de la campaña. */
  private async logHistory(
    campaignId: number,
    action: string,
    status: string | null = null,
    details: Record<string, unknown> = {},
    createdBy: number | null = null,
  ) {
    await this.db.insert(campaignHistory).values({
      campaignId,
      action,
      status,
      details: details as object,
      createdBy,
    });
  }

  /* ── CRUD ───────────────────────────────────────────── */

  async list(status?: string) {
    const rows = await this.db
      .select()
      .from(campaigns)
      .where(
        and(
          isNull(campaigns.deletedAt),
          status ? eq(campaigns.status, status as never) : undefined,
        ),
      )
      .orderBy(desc(campaigns.updatedAt));

    const messages = rows.length
      ? await this.db
          .select()
          .from(campaignMessages)
          .where(
            sql`${campaignMessages.campaignId} = ANY(${sql`ARRAY[${sql.join(
              rows.map((r) => Number(r.id)),
              sql`, `,
            )}]::bigint[]`})`,
          )
      : [];

    const productsById = await this.loadProducts(rows.map((r) => r.productId));
    const campaignProductsById = await this.loadCampaignProducts(
      rows.map((r) => Number(r.id)),
    );

    return rows.map((c) => {
      const products = (campaignProductsById.get(Number(c.id)) ?? [])
        .map((pid) => productsById.get(pid) ?? null)
        .filter((p): p is { id: number; name: string } => p !== null);
      return {
        ...this.toCampaign(c),
        product:
          c.productId != null
            ? (productsById.get(Number(c.productId)) ?? null)
            : null,
        products,
        messages: messages
          .filter((m) => Number(m.campaignId) === Number(c.id))
          .map((m) => this.toMessage(m)),
      };
    });
  }

  async findOne(id: number) {
    const [row] = await this.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, BigInt(id)), isNull(campaigns.deletedAt)));
    if (!row) throw new NotFoundException('Campaña no encontrada');

    const messages = await this.db
      .select()
      .from(campaignMessages)
      .where(eq(campaignMessages.campaignId, id))
      .orderBy(asc(campaignMessages.id));

    const [product] = row.productId != null
      ? await this.db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(eq(products.id, BigInt(row.productId)))
      : [null];

    const campaignProductIds = (
      await this.db
        .select({ productId: campaignProducts.productId })
        .from(campaignProducts)
        .where(eq(campaignProducts.campaignId, id))
        .orderBy(asc(campaignProducts.position))
    ).map((r) => Number(r.productId));

    const productRows = campaignProductIds.length
      ? await this.db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(
            sql`${products.id} = ANY(${sql`ARRAY[${sql.join(
              campaignProductIds.map((v) => BigInt(v)),
              sql`, `,
            )}]::bigint[]`})`,
          )
      : [];
    const productListById = new Map(
      productRows.map((p) => [Number(p.id), { id: Number(p.id), name: p.name }]),
    );

    const recipientsCount = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, id));

    return {
      ...this.toCampaign(row),
      product: product ? { id: Number(product.id), name: product.name } : null,
      products: campaignProductIds
        .map((pid) => productListById.get(pid) ?? null)
        .filter((p): p is { id: number; name: string } => p !== null),
      messages: messages.map((m) => this.toMessage(m)),
      recipientsCount: recipientsCount[0]?.count ?? 0,
    };
  }

  async create(dto: CreateCampaignDto, userId?: number) {
    const productIds = dto.productIds?.length
      ? dto.productIds
      : dto.productId != null
        ? [dto.productId]
        : [];
    const channels = dto.channels ?? [];
    const priorityChannel = resolvePriorityChannel(channels, dto.priorityChannel);
    const [row] = await this.db
      .insert(campaigns)
      .values({
        name: dto.name,
        productId: productIds[0] ?? null,
        prompt: dto.prompt ?? null,
        tone: dto.tone ?? null,
        channels,
        priorityChannel,
        mode: dto.mode ?? 'multi',
        draftState: (dto.draftState as object) ?? null,
        createdBy: userId ?? null,
      })
      .returning();

    await this.upsertCampaignProducts(Number(row.id), productIds);
    await this.upsertMessages(Number(row.id), dto.messages ?? []);
    await this.logHistory(
      Number(row.id),
      'created',
      'borrador',
      {
        name: dto.name,
        productIds,
        channels: dto.channels ?? [],
        mode: dto.mode ?? 'multi',
        messages: dto.messages?.length ?? 0,
      },
      userId,
    );
    return this.findOne(Number(row.id));
  }

  async update(id: number, dto: UpdateCampaignDto) {
    const existing = await this.findOne(id);

    let productId = dto.productId ?? existing.productId;
    if (dto.productIds) {
      const ids = [...new Set(dto.productIds)];
      await this.upsertCampaignProducts(id, ids);
      productId = ids[0] ?? existing.productId;
    }

    const [row] = await this.db
      .update(campaigns)
      .set({
        name: dto.name ?? existing.name,
        productId,
        prompt: dto.prompt ?? existing.prompt,
        tone: dto.tone ?? existing.tone,
        channels: dto.channels ?? existing.channels,
        priorityChannel: resolvePriorityChannel(
          dto.channels ?? existing.channels,
          dto.priorityChannel ?? (existing.priorityChannel as Channel | null),
        ),
        mode: (dto.mode as never) ?? existing.mode,
        status: (dto.status as never) ?? existing.status,
        scheduledAt: dto.scheduledAt ?? existing.scheduledAt,
        draftState: (dto.draftState as object) ?? existing.draftState,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(campaigns.id, BigInt(id)))
      .returning();
    if (!row) throw new NotFoundException('Campaña no encontrada');

    if (dto.messages) await this.upsertMessages(id, dto.messages);
    await this.logHistory(id, 'updated', (dto.status as never) ?? existing.status, {
      name: dto.name ?? existing.name,
      productIds: dto.productIds ?? undefined,
      channels: dto.channels ?? undefined,
      mode: dto.mode ?? undefined,
      status: (dto.status as never) ?? existing.status,
      scheduledAt: dto.scheduledAt ?? undefined,
      messages: dto.messages?.length ?? undefined,
    });
    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.findOne(id);
    await this.logHistory(id, 'deleted', existing.status, {
      name: existing.name,
      productId: existing.productId,
      mode: existing.mode,
    });
    await this.db
      .update(campaigns)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(campaigns.id, BigInt(id)));
    return { success: true };
  }

  /**
   * Relanza una campaña: re-segmenta el público (mismos productos y modo),
   * reinicia las métricas y deja el envío registrado. El historial anterior
   * se conserva intacto (nueva entrada 'relaunched').
   */
  async relaunch(id: number) {
    const existing = await this.findOne(id);
    const gen = await this.generateRecipients(
      id,
      100000,
      undefined,
      undefined,
      (existing.mode ?? 'multi') as 'multi' | 'bundle',
    ).catch(() => null);
    const sentAt = new Date().toISOString();
    await this.db
      .update(campaigns)
      .set({
        status: 'enviada',
        sentAt,
        sentCount: 0,
        openedCount: 0,
        convertedCount: 0,
        updatedAt: sentAt,
      })
      .where(eq(campaigns.id, BigInt(id)));
    await this.logHistory(id, 'relaunched', 'enviada', {
      name: existing.name,
      mode: existing.mode ?? 'multi',
      recipientsCount: gen?.total ?? 0,
    });
    return this.findOne(id);
  }

  /** Historial inmutable de eventos de la campaña (accesible aunque esté borrada). */
  async history(id: number) {
    const rows = await this.db
      .select()
      .from(campaignHistory)
      .where(eq(campaignHistory.campaignId, id))
      .orderBy(desc(campaignHistory.id));
    return rows.map((r) => ({
      id: Number(r.id),
      campaignId: Number(r.campaignId),
      action: r.action,
      status: r.status,
      details: r.details,
      createdAt: r.createdAt,
    }));
  }

  /* ── Mensajes por canal ─────────────────────────────── */

  private async upsertMessages(campaignId: number, messages: CampaignMessageDto[]) {
    for (const m of messages) {
      await this.db
        .insert(campaignMessages)
        .values({
          campaignId,
          channel: m.channel,
          subject: m.subject ?? null,
          content: m.content ?? null,
          html: m.html ?? null,
          emailBlocks: (m.emailBlocks as object) ?? null,
        })
        .onConflictDoUpdate({
          target: [campaignMessages.campaignId, campaignMessages.channel],
          set: {
            subject: sql`EXCLUDED.subject`,
            content: sql`EXCLUDED.content`,
            html: sql`EXCLUDED.html`,
            emailBlocks: sql`EXCLUDED.email_blocks`,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  /* ── Productos de la campaña (multi-selección) ────────── */

  private async upsertCampaignProducts(
    campaignId: number,
    productIds: number[],
  ) {
    await this.db
      .delete(campaignProducts)
      .where(eq(campaignProducts.campaignId, campaignId));
    if (!productIds.length) return;
    await this.db.insert(campaignProducts).values(
      [...new Set(productIds)].map((pid, i) => ({
        campaignId,
        productId: pid,
        position: i,
      })),
    );
  }

  private async loadCampaignProducts(campaignIds: number[]) {
    const map = new Map<number, number[]>();
    if (!campaignIds.length) return map;
    const rows = await this.db
      .select({
        campaignId: campaignProducts.campaignId,
        productId: campaignProducts.productId,
        position: campaignProducts.position,
      })
      .from(campaignProducts)
      .where(
        sql`${campaignProducts.campaignId} = ANY(${sql`ARRAY[${sql.join(
          campaignIds,
          sql`, `,
        )}]::bigint[]`})`,
      )
      .orderBy(asc(campaignProducts.position));
    for (const r of rows) {
      const list = map.get(Number(r.campaignId)) ?? [];
      list.push(Number(r.productId));
      map.set(Number(r.campaignId), list);
    }
    return map;
  }

  /* ── Recomendación de clientes (segmentación inteligente) ──
     Con `segment` llama a clustering-api y mapea cédulas → clientes.
     Sin `segment` mantiene el fallback aleatorio. */

  async listRecipients(id: number) {
    await this.findOne(id);
    const rows = await this.db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, id))
      .orderBy(asc(campaignRecipients.id));
    return rows.map((r) => this.toRecipient(r));
  }

  /* ── Clientes con score (analítica / segmentación manual) ── */

  private scoreCache: {
    key: string;
    at: number;
    scores: Map<string, { propensity: number; uplift: number; percentile: number }>;
  } | null = null;
  private readonly SCORE_CACHE_TTL = 5 * 60 * 1000; // 5 min

  private async fetchSegmentClients(
    filters: Record<string, unknown>,
    offset = 0,
    limit = 100,
    withContacts = true,
  ) {
    return (await this.postToClustering('/segment-clients', {
      model_name: this.clusteringModelName(),
      filters,
      offset,
      limit,
      with_contacts: withContacts,
    })) as {
      total: number;
      clients: {
        cedula: string;
        segment: number;
        features: {
          frecuencia: number;
          monetario: number;
          ticket_promedio: number;
          categorias_distintas: number;
        };
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        consent_email?: boolean;
        consent_whatsapp?: boolean;
        consent_sms?: boolean;
      }[];
    };
  }

  /**
   * Clientes con probabilidad de compra (XGBoost) y persuasibilidad (uplift).
   * Puntúa el conjunto filtrado completo (con caché corta) y pagina/ordena.
   */
  async scoreClients(dto: {
    filters?: {
      segment?: number;
      minFrecuencia?: number;
      maxFrecuencia?: number;
      minMonetario?: number;
      maxMonetario?: number;
      minTicketPromedio?: number;
      maxTicketPromedio?: number;
      minCategoriasDistintas?: number;
      maxCategoriasDistintas?: number;
      ciudades?: string[];
      barrios?: string[];
      direccionContiene?: string;
      minEdad?: number;
      maxEdad?: number;
      sexos?: string[];
      estadosCiviles?: string[];
      minHijos?: number;
      maxHijos?: number;
      profesiones?: string[];
      minValorTotal?: number;
      maxValorTotal?: number;
      minPuntos?: number;
      maxPuntos?: number;
      tieneMascota?: boolean;
      tieneCarro?: boolean;
      esEmpleado?: boolean;
      clubs?: string[];
      consentimientos?: string[];
      sucursales?: string[];
    };
    minPropensity?: number;
    excludeCedulas?: string[];
    sort?: 'propensity' | 'uplift' | 'segment' | 'cedula';
    dir?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }) {
    const filters = dto.filters ?? {};
    const limit = Math.min(Math.max(dto.limit ?? 100, 1), 500);
    const offset = Math.max(dto.offset ?? 0, 0);

    // 1) Todos los que cumplen los filtros (sin contacto) para puntuar.
    const all = await this.fetchSegmentClients(
      this.toSnakeFilters(filters),
      0,
      100000,
      false,
    );

    // 2) Scores con caché corta (el conjunto depende de los filtros).
    const key = JSON.stringify({ f: filters, m: this.clusteringModelName() });
    if (
      !this.scoreCache ||
      this.scoreCache.key !== key ||
      Date.now() - this.scoreCache.at > this.SCORE_CACHE_TTL
    ) {
      // Scoring por lotes: cuando el conjunto filtrado es grande (p. ej. toda
      // la base) se puntúa en chunks para acotar la memoria pico de los
      // servicios de análisis y de este proceso.
      const SCORE_CHUNK = 5000;
      const scores = new Map<string, { propensity: number; uplift: number; percentile: number }>();
      for (let i = 0; i < all.clients.length; i += SCORE_CHUNK) {
        const chunk = all.clients.slice(i, i + SCORE_CHUNK);
        const recipients: SegRecipient[] = chunk.map((c) => ({
          cedula: c.cedula,
          segment: c.segment,
          features: c.features,
          name: null,
          email: null,
          phone: null,
        }));
        const propensity = await this.scorePropensity(recipients);
        const uplift = await this.scoreUplift(recipients);
        chunk.forEach((c, j) => {
          scores.set(c.cedula, {
            propensity: propensity ? (propensity[j] ?? 0) : 0,
            uplift: uplift ? (uplift[j]?.uplift ?? 0) : 0,
            percentile: uplift ? (uplift[j]?.percentile ?? 0) : 0,
          });
        });
      }
      this.scoreCache = { key, at: Date.now(), scores };
    }
    const scores = this.scoreCache.scores;

    // 3) Filtro por propensión mínima + orden + paginación. Los clientes en
    //    `excludeCedulas` (p. ej. los ya recomendados cuando el público es
    //    "Recomendada + manual") se restan para no contar repetidos.
    const exclude = new Set(
      (dto.excludeCedulas ?? []).map((c) => String(c).trim()).filter(Boolean),
    );
    let rows = all.clients
      .map((c) => ({
        ...c,
        ...(scores.get(c.cedula) ?? { propensity: 0, uplift: 0, percentile: 0 }),
      }))
      .filter((r) => dto.minPropensity == null || r.propensity >= dto.minPropensity)
      .filter((r) => !exclude.has(r.cedula));

    const dir = dto.dir === 'asc' ? 1 : -1;
    switch (dto.sort ?? 'propensity') {
      case 'uplift':
        rows.sort((a, b) => (a.uplift - b.uplift) * dir);
        break;
      case 'segment':
        rows.sort((a, b) => (a.segment - b.segment) * dir);
        break;
      case 'cedula':
        rows.sort((a, b) => a.cedula.localeCompare(b.cedula) * dir);
        break;
      default:
        rows.sort((a, b) => (a.propensity - b.propensity) * dir);
    }

    const total = rows.length;
    const page = rows.slice(offset, offset + limit);

    // 4) Contactos solo de la página.
    let contacts = new Map<string, Record<string, unknown>>();
    if (page.length) {
      const c = await this.fetchSegmentClients(
        { cedulas: page.map((r) => r.cedula) },
        0,
        100000,
        true,
      );
      contacts = new Map(c.clients.map((x) => [x.cedula, x]));
    }

    return {
      total,
      clients: page.map((r) => {
        const ct = contacts.get(r.cedula) ?? {};
        return {
          cedula: r.cedula,
          segment: r.segment,
          features: r.features,
          propensity: r.propensity,
          uplift: r.uplift,
          percentile: r.percentile,
          name: ct.name ?? null,
          email: ct.email ?? null,
          phone: ct.phone ?? null,
          consent_email: ct.consent_email ?? false,
          consent_whatsapp: ct.consent_whatsapp ?? false,
          consent_sms: ct.consent_sms ?? false,
        };
      }),
    };
  }

  /** Resuelve el conjunto de clientes de la segmentación manual: o bien las
   *  cédulas explícitas, o bien TODOS los que cumplen los filtros de
   *  perfil/RFM (los "clientes con esas características" que muestra la UI). */
  private async resolveManualAudience(
    cedulas?: string[],
    filters?: Record<string, unknown>,
  ) {
    let query: Record<string, unknown>;
    if (filters && Object.keys(filters).length > 0) {
      query = this.toSnakeFilters(filters);
    } else if (cedulas?.length) {
      const list = [...new Set(cedulas.filter((c) => c && c.trim()))].slice(0, 10000);
      if (!list.length) {
        throw new BadRequestException('No se recibieron cédulas válidas');
      }
      query = { cedulas: list };
    } else {
      throw new BadRequestException(
        'Para la audiencia manual define filtros o envía la lista de cédulas',
      );
    }
    const data = await this.fetchSegmentClients(query, 0, 100000, true);
    if (!data.clients.length) {
      throw new BadRequestException(
        filters && Object.keys(filters).length > 0
          ? 'Ningún cliente cumple los filtros seleccionados'
          : 'Ninguna cédula coincide con la base de clientes',
      );
    }
    return data.clients;
  }

  /**
   * Añade clientes a los destinatarios de una campaña (por cédulas o por
   * filtros manuales). Evita duplicados por email/teléfono contra los ya
   * guardados. Deja la audiencia 'mixed' si había recomendación, si no 'manual'.
   */
  async addManualRecipients(
    campaignId: number,
    cedulas?: string[],
    filters?: Record<string, unknown>,
  ) {
    await this.findOne(campaignId);
    const clients = await this.resolveManualAudience(cedulas, filters);

    const existing = await this.db
      .select({
        email: campaignRecipients.email,
        phone: campaignRecipients.phone,
        cedula: campaignRecipients.cedula,
      })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));
    const seenEmails = new Set(
      existing.map((r) => r.email?.toLowerCase()).filter(Boolean),
    );
    const seenPhones = new Set(
      existing.map((r) => r.phone?.toLowerCase()).filter(Boolean),
    );
    const seenCedulas = new Set(
      existing.map((r) => r.cedula).filter((c): c is string => Boolean(c)),
    );

    const toInsert = clients.filter((c) => {
      const em = c.email?.toLowerCase();
      const ph = c.phone?.toLowerCase();
      // Un cliente ya guardado (p. ej. llegó por la recomendación) no se suma
      // dos veces: ni por cédula ni por email/teléfono.
      if (c.cedula && seenCedulas.has(c.cedula)) return false;
      if (em && seenEmails.has(em)) return false;
      if (ph && seenPhones.has(ph)) return false;
      if (c.cedula) seenCedulas.add(c.cedula);
      if (em) seenEmails.add(em);
      if (ph) seenPhones.add(ph);
      return true;
    });

    if (toInsert.length) {
      await this.db.insert(campaignRecipients).values(
        toInsert.map((c) => ({
          campaignId,
          customerId: null,
          cedula: c.cedula ?? null,
          segmento: c.segment ?? null,
          frecuencia: c.features?.frecuencia ?? null,
          monetario: c.features?.monetario ?? null,
          ticketPromedio: c.features?.ticket_promedio ?? null,
          categoriasDistintas: c.features?.categorias_distintas ?? null,
          propensity: null,
          name: c.name ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
        })),
      );
      // Origen de la audiencia tras añadir manuales.
      const row = await this.db
        .select({ audienceMode: campaigns.audienceMode })
        .from(campaigns)
        .where(eq(campaigns.id, BigInt(campaignId)));
      const prev = row[0]?.audienceMode ?? 'auto';
      const next = prev === 'manual' ? 'manual' : 'mixed';
      await this.db
        .update(campaigns)
        .set({
          audienceMode: next,
          audienceCount: existing.length + toInsert.length,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(campaigns.id, BigInt(campaignId)));
    }
    return this.findOne(campaignId);
  }

  /**
   * Reemplaza TODO el público de la campaña por una audiencia manual (cédulas
   * o filtros). Deja la audiencia en modo 'manual'.
   */
  async replaceManualRecipients(
    campaignId: number,
    cedulas?: string[],
    filters?: Record<string, unknown>,
  ) {
    await this.findOne(campaignId);
    const clients = await this.resolveManualAudience(cedulas, filters);

    await this.db
      .delete(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));
    await this.db.insert(campaignRecipients).values(
      clients.map((c) => ({
        campaignId,
        customerId: null,
        cedula: c.cedula ?? null,
        segmento: c.segment ?? null,
        frecuencia: c.features?.frecuencia ?? null,
        monetario: c.features?.monetario ?? null,
        ticketPromedio: c.features?.ticket_promedio ?? null,
        categoriasDistintas: c.features?.categorias_distintas ?? null,
        propensity: null,
        name: c.name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
      })),
    );
    await this.db
      .update(campaigns)
      .set({
        audienceCount: clients.length,
        audienceMode: 'manual',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(campaigns.id, BigInt(campaignId)));
    return this.findOne(campaignId);
  }

  /** Aplica el origen del público objetivo elegido en la UI:
   *  'auto' → solo recomendación por producto (re-segmenta),
   *  'manual' → reemplaza TODO el público por la audiencia manual,
   *  'mixed' → recomendación por producto + audiencia manual (dedupe).
   *  Devuelve la campaña actualizada. */
  async applyAudience(
    campaignId: number,
    mode: 'auto' | 'manual' | 'mixed',
    cedulas?: string[],
    filters?: Record<string, unknown>,
  ) {
    const existing = await this.findOne(campaignId);
    if (mode === 'manual') {
      await this.replaceManualRecipients(campaignId, cedulas, filters);
    } else {
      await this.generateRecipients(
        campaignId,
        100000,
        undefined,
        undefined,
        existing.mode === 'bundle' ? 'bundle' : 'multi',
      );
      if (mode === 'mixed') {
        await this.addManualRecipients(campaignId, cedulas, filters);
      }
    }
    return this.findOne(campaignId);
  }

  /**
   * Usa (de nuevo) la recomendación por producto: re-segmenta y reemplaza
   * el público, dejando la audiencia en modo 'auto'. No registra envío.
   */
  async useRecommendedAudience(id: number) {
    const existing = await this.findOne(id);
    await this.generateRecipients(
      id,
      100000,
      undefined,
      undefined,
      existing.mode === 'bundle' ? 'bundle' : 'multi',
    );
    return this.findOne(id);
  }

  /**
   * Convierte los filtros del DTO (camelCase) a las claves snake_case
   * que espera clustering-api (/segment-clients). Omite undefined/null.
   */
  private toSnakeFilters(f: Record<string, unknown>): Record<string, unknown> {
    const mapping: Record<string, string> = {
      minFrecuencia: 'min_frecuencia',
      maxFrecuencia: 'max_frecuencia',
      minMonetario: 'min_monetario',
      maxMonetario: 'max_monetario',
      minTicketPromedio: 'min_ticket_promedio',
      maxTicketPromedio: 'max_ticket_promedio',
      minCategoriasDistintas: 'min_categorias_distintas',
      maxCategoriasDistintas: 'max_categorias_distintas',
      direccionContiene: 'direccion_contiene',
      minEdad: 'min_edad',
      maxEdad: 'max_edad',
      estadosCiviles: 'estados_civiles',
      minHijos: 'min_hijos',
      maxHijos: 'max_hijos',
      minValorTotal: 'min_valor_total',
      maxValorTotal: 'max_valor_total',
      minPuntos: 'min_puntos',
      maxPuntos: 'max_puntos',
      tieneMascota: 'tiene_mascota',
      tieneCarro: 'tiene_carro',
      esEmpleado: 'es_empleado',
    };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      out[mapping[k] ?? k] = v;
    }
    return out;
  }

  /** Opciones de los selects de segmentación manual (proxy a clustering-api). */
  async clientFilterOptions() {
    return this.getFromClustering('/client-filter-options');
  }

  /**
   * GET genérico a clustering-api (protegido con X-Admin-Key).
   */
  private async getFromClustering(path: string) {
    const url = `${this.clusteringApiUrl()}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: { 'X-Admin-Key': this.clusteringApiKey() },
      });
    } catch (e) {
      this.logger.error(`No se pudo contactar clustering-api en ${url}: ${e}`);
      throw new BadRequestException(
        'El servicio de segmentación (clustering-api) no está disponible',
      );
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`clustering-api respondió ${resp.status}: ${text}`);
      throw new BadRequestException(
        'El servicio de segmentación no pudo completar la operación',
      );
    }
    return resp.json();
  }

  /**
   * POST genérico a clustering-api (protegido con X-Admin-Key).
   */
  private async postToClustering(path: string, body: Record<string, unknown>) {
    const url = `${this.clusteringApiUrl()}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': this.clusteringApiKey(),
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`No se pudo contactar clustering-api en ${url}: ${e}`);
      throw new BadRequestException(
        'El servicio de segmentación (clustering-api) no está disponible',
      );
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`clustering-api respondió ${resp.status}: ${text}`);
      throw new BadRequestException(
        'El servicio de segmentación no pudo completar la operación',
      );
    }
    return resp.json();
  }

  /**
   * Consulta a clustering-api las cédulas (cliente_cod) que pertenecen a un
   * cluster. Devuelve la lista de cédulas para mapearlas a `customers`.
   */
  private async fetchSegmentCedulas(
    segment: number,
    modelName?: string,
  ): Promise<string[]> {
    const data = (await this.postToClustering('/assign-from-db', {
      model_name: modelName ?? this.clusteringModelName(),
      query: this.RFM_QUERY,
      id_column: this.RFM_ID_COLUMN,
      label: segment,
    })) as { ids?: unknown[] };
    return (data.ids ?? []).map((v) => String(v));
  }

  /**
   * Evalúa en clustering-api el mejor segmento para los productos de la
   * campaña. Con `auto_fit: true` entrena el modelo si aún no existe.
   */
  private async segmentForProducts(
    modelName: string | undefined,
    products: string[],
    limit?: number,
    mode?: 'multi' | 'bundle',
  ) {
    const data = (await this.postToClustering('/segment-for-products', {
      model_name: modelName ?? this.clusteringModelName(),
      products,
      auto_fit: true,
      ...(limit ? { limit } : {}),
      mode: mode ?? 'multi',
    })) as {
      best_segment: number;
      buyers: number;
      segment_total: number;
      total: number;
      recipients: SegRecipient[];
    };
    return {
      best_segment: data.best_segment,
      buyers: data.buyers,
      segment_total: data.segment_total,
      total: data.total,
      recipients: data.recipients ?? [],
    };
  }

  /**
   * POST genérico a un servicio de análisis (XGBoost / Uplift) sin admin key.
   * Levanta un error claro si el servicio no responde.
   */
  private async postToService(baseUrl: string, path: string, body: Record<string, unknown>) {
    const url = `${baseUrl}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`No se pudo contactar ${url}: ${e}`);
      throw new BadRequestException('Un servicio de análisis no está disponible');
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`${url} respondió ${resp.status}: ${text}`);
      throw new BadRequestException('Un servicio de análisis no pudo completar la operación');
    }
    return resp.json();
  }

  /** Filas de features (RFM + segmento) que esperan los modelos de xgboost/uplift. */
  private buildModelRows(recipients: SegRecipient[]) {
    return recipients.map((r) => ({
      frecuencia: r.features?.frecuencia ?? 0,
      monetario: r.features?.monetario ?? 0,
      ticket_promedio: r.features?.ticket_promedio ?? 0,
      categorias_distintas: r.features?.categorias_distintas ?? 0,
      segmento: String(r.segment ?? 0),
    }));
  }

  /** Propensión de compra por cliente (XGBoost). Devuelve null si falla. */
  private async scorePropensity(recipients: SegRecipient[]): Promise<number[] | null> {
    try {
      const data = (await this.postToService(this.xgboostApiUrl(), '/propensity/predict', {
        model_name: this.xgboostModel(),
        data: this.buildModelRows(recipients),
      })) as {
        predictions?: { index: number; label: string; probabilities?: Record<string, number> }[];
      };
      return (data.predictions ?? []).map((p) => p.probabilities?.['1'] ?? 0);
    } catch (e) {
      this.logger.warn(`scorePropensity no disponible: ${e}`);
      return null;
    }
  }

  /** Persuasibilidad (uplift) por cliente. Devuelve null si falla. */
  private async scoreUplift(
    recipients: SegRecipient[],
  ): Promise<{ uplift: number; percentile: number }[] | null> {
    try {
      const data = (await this.postToService(this.upliftApiUrl(), '/uplift/predict', {
        model_name: this.upliftModel(),
        data: this.buildModelRows(recipients),
        with_percentile: true,
      })) as {
        predictions?: { index: number; uplift_score: number; percentile?: number }[];
      };
      return (data.predictions ?? []).map((p) => ({
        uplift: p.uplift_score,
        percentile: p.percentile ?? 0,
      }));
    } catch (e) {
      this.logger.warn(`scoreUplift no disponible: ${e}`);
      return null;
    }
  }

  /** external_id (articulo_cod del legado) de unos productIds dados. */
  private async externalIdsForProducts(productIds: number[]): Promise<string[]> {
    if (!productIds.length) return [];
    const rows = await this.db
      .select({ externalId: products.externalId })
      .from(products)
      .where(inArray(products.id, productIds.map((p) => BigInt(p))));
    return rows
      .map((r) => r.externalId)
      .filter((x): x is string => Boolean(x));
  }

  /** external_id (articulo_cod del legado) de los productos de la campaña. */
  private async campaignProductExternalIds(campaignId: number): Promise<string[]> {
    const rows = await this.db
      .select({ productId: campaignProducts.productId })
      .from(campaignProducts)
      .where(eq(campaignProducts.campaignId, campaignId));
    return this.externalIdsForProducts(rows.map((r) => r.productId));
  }

  /**
   * Previsualización de la segmentación para el wizard (SSE con progreso).
   * Hace proxy del stream de clustering-api y re-emite cada evento de etapa
   * y el resultado final al cliente.
   */
  segmentPreviewStream(
    productIds: number[],
    limit = 500,
    mode: 'multi' | 'bundle' = 'multi',
  ): Observable<MessageEvent> {
    // El tope ya no es una muestra: se puntúa el segmento completo para poder
    // filtrar por probabilidad de compra (≥70%) con números reales.
    const cap = Math.min(Math.max(limit, 1), 100000);
    return new Observable<MessageEvent>((subscriber) => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let closed = false;

      void (async () => {
        try {
          const extIds = await this.externalIdsForProducts(productIds);
          if (!extIds.length) {
            subscriber.next({
              data: {
                stage: 'error',
                error: 'Los productos seleccionados no tienen external_id en la réplica',
              },
            });
            subscriber.complete();
            return;
          }

          const resp = await fetch(`${this.clusteringApiUrl()}/segment-for-products`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Key': this.clusteringApiKey(),
            },
            body: JSON.stringify({
              model_name: this.clusteringModelName(),
              products: extIds,
              auto_fit: true,
              limit: cap,
              stream: true,
              mode,
            }),
          });
          if (!resp.ok || !resp.body) {
            subscriber.next({
              data: { stage: 'error', error: `El servicio de segmentación respondió ${resp.status}` },
            });
            subscriber.complete();
            return;
          }

          reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!closed) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';
            for (const evt of events) {
              const line = evt.split('\n').find((l) => l.startsWith('data:'));
              if (!line) continue;
              const raw = line.slice(5).trim();
              if (!raw) continue;
              try {
                const parsed = JSON.parse(raw);
                if (parsed?.stage === 'done' && parsed?.result) {
                  const r = parsed.result;
                  const recipients: SegRecipient[] = r.recipients ?? [];

                  // Capa 2 — XGBoost: propensión de compra.
                  subscriber.next({
                    data: { stage: 'xgboost', message: 'Puntuando propensión de compra (XGBoost)…', progress: 88 },
                  });
                  const propensity = await this.scorePropensity(recipients);

                  // Capa 3 — Uplift: persuasibilidad.
                  subscriber.next({
                    data: { stage: 'uplift', message: 'Calculando persuasibilidad (Uplift)…', progress: 94 },
                  });
                  const uplift = await this.scoreUplift(recipients);

                  // Capa 4 — Elegibilidad: solo clientes con ≥70% de probabilidad
                  // de compra, ordenados por score (propensión ↓, luego uplift ↓).
                  subscriber.next({
                    data: {
                      stage: 'filter',
                      message: 'Seleccionando clientes con ≥70% de probabilidad de compra…',
                      progress: 97,
                    },
                  });
                  const MIN_PROPENSITY = 0.7;
                  const enriched = recipients.map((rc, i) => ({
                    cedula: rc.cedula,
                    name: rc.name,
                    email: rc.email,
                    phone: rc.phone,
                    segment: rc.segment,
                    frecuencia: rc.features?.frecuencia ?? null,
                    monetario: rc.features?.monetario ?? null,
                    ticketPromedio: rc.features?.ticket_promedio ?? null,
                    categoriasDistintas: rc.features?.categorias_distintas ?? null,
                    propensity: propensity ? (propensity[i] ?? null) : null,
                    uplift: uplift ? (uplift[i]?.uplift ?? null) : null,
                    percentile: uplift ? (uplift[i]?.percentile ?? null) : null,
                  }));
                  const eligible = propensity
                    ? enriched.filter((r) => (r.propensity ?? 0) >= MIN_PROPENSITY)
                    : enriched; // sin scores (servicio caído): no filtrar
                  eligible.sort((a, b) => {
                    const dp = (b.propensity ?? -Infinity) - (a.propensity ?? -Infinity);
                    if (dp !== 0) return dp;
                    return (b.uplift ?? -Infinity) - (a.uplift ?? -Infinity);
                  });

                  subscriber.next({
                    data: {
                      stage: 'done',
                      progress: 100,
                      result: {
                        segment: r.best_segment,
                        segmentTotal: r.segment_total,
                        total: eligible.length,
                        buyers: r.buyers,
                        mode: r.mode ?? 'multi',
                        bundleFallback: r.bundle_fallback ?? false,
                        note: r.affinity_note,
                        ranking: r.ranking ?? [],
                        categories: r.categories ?? [],
                        recipients: eligible,
                      },
                    },
                  });
                } else {
                  subscriber.next({ data: parsed });
                }
              } catch {
                /* tramas malformadas: se ignoran */
              }
            }
          }
        } catch (e) {
          this.logger.error(`segment-preview stream error: ${e}`);
          subscriber.next({
            data: { stage: 'error', error: 'No se pudo completar la segmentación' },
          });
        } finally {
          if (!closed) subscriber.complete();
        }
      })();

      return () => {
        closed = true;
        reader?.cancel().catch(() => undefined);
      };
    });
  }

  async generateRecipients(
    id: number,
    limit = 500,
    segment?: number,
    modelName?: string,
    mode?: 'multi' | 'bundle',
    manualCedulas?: string[],
  ) {
    await this.findOne(id);
    const cap = Math.min(Math.max(limit, 1), 100000);

    let items: {
      name: string | null;
      email: string | null;
      phone: string | null;
      customerId: number | null;
      // Snapshot RFM (réplica de analytics) para la tabla del público.
      cedula?: string | null;
      segmento?: number | null;
      frecuencia?: number | null;
      monetario?: number | null;
      ticketPromedio?: number | null;
      categoriasDistintas?: number | null;
      propensity?: number | null;
    }[];
    let note: string;
    let segInfo: { segment: number; buyers: number } | null = null;

    if (segment === undefined) {
      // ── Modo automático: segmenta según los productos de la campaña ──
      const extIds = await this.campaignProductExternalIds(id);
      if (extIds.length) {
        // La réplica de analytics (pos.clientes) es la fuente de destinatarios:
        // clustering-api devuelve el mejor segmento + el contacto de cada cliente.
        const seg = await this.segmentForProducts(modelName, extIds, cap, mode);
        if (!seg.recipients.length) {
          throw new BadRequestException(
            'El mejor segmento para estos productos no tiene clientes',
          );
        }
        // Elegibilidad: solo clientes con ≥70% de probabilidad de compra,
        // ordenados por score (propensión ↓).
        const MIN_PROPENSITY = 0.7;
        const propensity = await this.scorePropensity(seg.recipients);
        let ranked = seg.recipients.map((r, i) => ({
          ...r,
          _propensity: propensity ? (propensity[i] ?? null) : null,
        }));
        if (propensity) {
          ranked = ranked
            .filter((r) => (r._propensity ?? 0) >= MIN_PROPENSITY)
            .sort((a, b) => (b._propensity ?? -Infinity) - (a._propensity ?? -Infinity));
        }
        if (!ranked.length) {
          throw new BadRequestException(
            'Ningún cliente del segmento supera el 70% de probabilidad de compra',
          );
        }
        items = ranked.slice(0, cap).map((r) => ({
          name: r.name,
          email: r.email,
          phone: r.phone,
          customerId: null,
          cedula: r.cedula ?? null,
          segmento: r.segment ?? seg.best_segment ?? null,
          frecuencia: r.features?.frecuencia ?? null,
          monetario: r.features?.monetario ?? null,
          ticketPromedio: r.features?.ticket_promedio ?? null,
          categoriasDistintas: r.features?.categorias_distintas ?? null,
          propensity: r._propensity ?? null,
        }));
        segInfo = { segment: seg.best_segment, buyers: seg.buyers };
        note = `Segmentación automática: segmento ${seg.best_segment} (${seg.total} clientes en el segmento, ${seg.buyers} con afinidad; ${items.length} con ≥70% de probabilidad de compra)`;
      } else {
        // La campaña no tiene productos con external_id → aleatorio desde customers.
        const pool = await this.db
          .select({
            id: customers.id,
            documentNumber: customers.documentNumber,
            name: sql<string>`concat_ws(' ', ${customers.firstName}, ${customers.lastName})`,
            email: customers.email,
            phone: customers.phone,
          })
          .from(customers)
          .where(
            and(
              eq(customers.isActive, true),
              isNull(customers.deletedAt),
              sql`${customers.email} IS NOT NULL AND ${customers.email} <> ''`,
            ),
          )
          .orderBy(sql`random()`)
          .limit(cap);
        if (!pool.length) {
          throw new BadRequestException(
            'No hay clientes disponibles para recomendar',
          );
        }
        items = pool.map((c) => ({
          name: c.name || null,
          email: c.email,
          phone: c.phone || null,
          customerId: Number(c.id),
          cedula: c.documentNumber ?? null,
          segmento: null,
          frecuencia: null,
          monetario: null,
          ticketPromedio: null,
          categoriasDistintas: null,
          propensity: null,
        }));
        note = 'Recomendación aleatoria (la campaña no tiene productos con external_id)';
      }
    } else {
      // ── Modo manual: segmento específico (contactos del ecommerce) ──
      const cedulas = await this.fetchSegmentCedulas(segment, modelName);
      if (!cedulas.length) {
        throw new BadRequestException(
          `El segmento ${segment} no tiene clientes asignados`,
        );
      }
      const pool = await this.db
        .select({
          id: customers.id,
          documentNumber: customers.documentNumber,
          name: sql<string>`concat_ws(' ', ${customers.firstName}, ${customers.lastName})`,
          email: customers.email,
          phone: customers.phone,
        })
        .from(customers)
        .where(
          and(
            eq(customers.isActive, true),
            isNull(customers.deletedAt),
            sql`${customers.email} IS NOT NULL AND ${customers.email} <> ''`,
            inArray(customers.documentNumber, cedulas),
          ),
        )
        .orderBy(sql`random()`)
        .limit(cap);
      if (!pool.length) {
        throw new BadRequestException(
          'No hay clientes disponibles para recomendar',
        );
      }
      items = pool.map((c) => ({
        name: c.name || null,
        email: c.email,
        phone: c.phone || null,
        customerId: Number(c.id),
        cedula: c.documentNumber ?? null,
        segmento: segment,
        frecuencia: null,
        monetario: null,
        ticketPromedio: null,
        categoriasDistintas: null,
        propensity: null,
      }));
      segInfo = { segment, buyers: cedulas.length };
      note = `Segmentación inteligente: cluster ${segment} (${cedulas.length} clientes en el segmento, ${pool.length} con contacto)`;
    }

    // ── Añade clientes elegidos manualmente (segmentación manual) ──
    if (manualCedulas?.length) {
      const extra = await this.fetchSegmentClients(
        { cedulas: [...new Set(manualCedulas)] },
        0,
        100000,
        true,
      );
      const have = new Set([
        ...items.map((r) => r.email?.toLowerCase()).filter(Boolean),
        ...items.map((r) => r.phone?.toLowerCase()).filter(Boolean),
      ]);
      for (const c of extra.clients) {
        const em = c.email?.toLowerCase();
        const ph = c.phone?.toLowerCase();
        if ((em && have.has(em)) || (ph && have.has(ph))) continue;
        if (em) have.add(em);
        if (ph) have.add(ph);
        items.push({
          name: c.name ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          customerId: null,
          cedula: c.cedula ?? null,
          segmento: c.segment ?? null,
          frecuencia: c.features?.frecuencia ?? null,
          monetario: c.features?.monetario ?? null,
          ticketPromedio: c.features?.ticket_promedio ?? null,
          categoriasDistintas: c.features?.categorias_distintas ?? null,
          propensity: null,
        });
      }
      if (extra.clients.length) {
        note = `${note} · ${extra.clients.length} añadidos manualmente`;
      }
    }

    if (!items.length) {
      throw new BadRequestException(
        'No hay clientes disponibles para recomendar',
      );
    }

    await this.db
      .delete(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, id));

    await this.db.insert(campaignRecipients).values(
      items.map((r) => ({
        campaignId: id,
        customerId: r.customerId,
        cedula: r.cedula ?? null,
        segmento: r.segmento ?? null,
        frecuencia: r.frecuencia ?? null,
        monetario: r.monetario ?? null,
        ticketPromedio: r.ticketPromedio ?? null,
        categoriasDistintas: r.categoriasDistintas ?? null,
        propensity: r.propensity ?? null,
        name: r.name,
        email: r.email,
        phone: r.phone,
      })),
    );

    await this.db
      .update(campaigns)
      .set({
        audienceCount: items.length,
        audienceMode: manualCedulas?.length ? 'mixed' : 'auto',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(campaigns.id, BigInt(id)));

    this.logger.log(`Campaña ${id}: ${items.length} destinatarios recomendados`);

    return {
      campaignId: id,
      total: items.length,
      segment: segInfo?.segment ?? null,
      note,
      recipients: items.map((r) => ({
        id: r.customerId ?? null,
        name: r.name,
        email: r.email,
        phone: r.phone,
      })),
    };
  }

  /* ── Generación de contenido con IA (/ia-service) ──────── */

  async generateContent(dto: {
    productId?: number;
    productName?: string;
    price?: number;
    discount?: number;
    prompt?: string;
    tone?: string;
    channels: Channel[];
    products?: { id?: number; name?: string; price?: number }[];
  }) {
    // El wizard permite seleccionar varios productos; si no viene la lista,
    // se arma con el producto principal.
    let items: { id?: number; name?: string; price?: number }[] =
      dto.products?.length ? [...dto.products] : [];
    if (!items.length && dto.productId) {
      items = [{ id: dto.productId, name: dto.productName, price: dto.price }];
    }

    // Completa nombre/precio desde la BD para los ids sin datos.
    const pending = items.filter(
      (p) => p.id != null && (!p.name || p.price === undefined),
    );
    if (pending.length) {
      const rows = await this.db
        .select({
          id: products.id,
          name: products.name,
          price: sql<number>`(SELECT pv.current_price::float8 FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.is_active = true AND pv.deleted_at IS NULL LIMIT 1)`,
        })
        .from(products)
        .where(
          sql`${products.id} = ANY(${sql`ARRAY[${sql.join(
            pending.map((p) => BigInt(p.id as number)),
            sql`, `,
          )}]::bigint[]`})`,
        );
      const byId = new Map(rows.map((r) => [Number(r.id), r]));
      items = items.map((p) => {
        if (p.id == null || (p.name && p.price !== undefined)) return p;
        const r = byId.get(Number(p.id));
        return {
          ...p,
          name: p.name ?? r?.name,
          price: p.price ?? r?.price,
        };
      });
    }

    const primary = items[0] ?? {};
    const body = {
      producto: {
        nombre: primary.name ?? dto.productName ?? 'producto',
        precio: primary.price ?? dto.price ?? null,
        descuento: dto.discount ?? null,
      },
      productos: items.map((p) => ({
        nombre: p.name ?? 'producto',
        precio: p.price ?? null,
        descuento: dto.discount ?? null,
      })),
      prompt: dto.prompt ?? '',
      tono: dto.tone ?? 'cercano',
      canales: dto.channels,
    };

    const url = `${this.iaServiceUrl()}/generate`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`No se pudo contactar ia-service en ${url}: ${e}`);
      throw new BadRequestException(
        'El servicio de IA de campañas (/ia-service) no está disponible',
      );
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`ia-service respondió ${resp.status}: ${text}`);
      throw new BadRequestException(
        'El servicio de IA no pudo generar el contenido',
      );
    }
    return resp.json();
  }

  /* ── Sugerencia de nombre de campaña con IA (/ia-service) ── */

  async suggestName(dto: {
    products?: { name?: string; price?: number }[];
    prompt?: string;
  }) {
    const items = (dto.products ?? []).filter((p) => p && (p.name ?? '').trim());
    const body = {
      productos: items.map((p) => ({
        nombre: (p.name ?? 'producto').trim(),
        precio: p.price ?? null,
      })),
      prompt: dto.prompt ?? '',
    };

    const url = `${this.iaServiceUrl()}/suggest-name`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`No se pudo contactar ia-service en ${url}: ${e}`);
      throw new BadRequestException(
        'El servicio de IA de campañas (/ia-service) no está disponible',
      );
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`ia-service respondió ${resp.status}: ${text}`);
      throw new BadRequestException(
        'El servicio de IA no pudo sugerir el nombre de la campaña',
      );
    }
    const data = (await resp.json().catch(() => ({}))) as { nombre?: unknown };
    const name = typeof data?.nombre === 'string' ? data.nombre.trim() : '';
    if (!name) {
      throw new BadRequestException(
        'El servicio de IA no devolvió un nombre para la campaña',
      );
    }
    return { name };
  }

  /* ── Interpretación IA de la segmentación (/ia-service) ── */

  async interpretSegment(dto: {
    mode?: 'multi' | 'bundle';
    productNames?: string[];
    categories?: string[];
    bestSegment?: number;
    ranking?: { segment?: number; total?: number; buyers?: number; share?: number }[];
    segmentTotal?: number;
    total?: number;
    buyers?: number;
    features?: string[];
    bundleFallback?: boolean;
    note?: string;
    avgPropensity?: number;
    avgUplift?: number;
  }) {
    const url = `${this.iaServiceUrl()}/interpret`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });
    } catch (e) {
      this.logger.error(`No se pudo contactar ia-service en ${url}: ${e}`);
      throw new BadRequestException(
        'El servicio de IA (/ia-service) no está disponible',
      );
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`ia-service respondió ${resp.status}: ${text}`);
      throw new BadRequestException(
        'El servicio de IA no pudo interpretar la segmentación',
      );
    }
    return resp.json();
  }

  /* ── Helpers ────────────────────────────────────────── */

  private async loadProducts(ids: (number | null)[]) {
    const valid = [...new Set(ids.filter((x): x is number => x !== null))];
    const map = new Map<number, { id: number; name: string }>();
    if (!valid.length) return map;
    const rows = await this.db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        sql`${products.id} = ANY(${sql`ARRAY[${sql.join(
          valid.map((v) => BigInt(v)),
          sql`, `,
        )}]::bigint[]`})`,
      );
    for (const r of rows) map.set(Number(r.id), { id: Number(r.id), name: r.name });
    return map;
  }
}
