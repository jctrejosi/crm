import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  brands,
  categories,
  media,
  productCategories,
  productImages,
  products,
  productTypeAssignments,
  productTypes,
  productVariants,
  settings,
} from '../../../drizzle/schema';
import {
  mergeTheme,
  sanitizeTheme,
  type ThemeConfig,
} from './theme.config';

@Injectable()
export class LandingService {
  private readonly logger = new Logger(LandingService.name);
  constructor(private readonly drizzle: DrizzleService) {}

  private get db() { return this.drizzle.db; }

  async getProductTypes() {
    const rows = await this.db
      .select({
        id: productTypes.id,
        code: productTypes.code,
        name: productTypes.name,
        isActive: productTypes.isActive,
        count: sql<number>`count(DISTINCT ${products.id})`,
      })
      .from(productTypes)
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productTypeId, productTypes.id),
      )
      .leftJoin(
        products,
        and(
          eq(products.id, productTypeAssignments.productId),
          isNull(products.deletedAt),
        ),
      )
      .groupBy(
        productTypes.id,
        productTypes.code,
        productTypes.name,
        productTypes.isActive,
      )
      .orderBy(asc(productTypes.name));

    const selected = await this.getSelectedCodes();
    return rows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      count: Number(row.count ?? 0),
      isActive: row.isActive,
      selected: selected.includes(row.code),
    }));
  }

  async updateProductTypes(codes: string[]) {
    const row = await this.db.select().from(settings).where(eq(settings.key, 'landing_product_types')).limit(1);
    if (row.length) {
      await this.db.update(settings).set({ value: codes as any }).where(eq(settings.key, 'landing_product_types'));
    } else {
      await this.db.insert(settings).values({
        key: 'landing_product_types', value: codes as any, dataType: 'json',
        module: 'landing', description: 'Tipos de producto visibles en la landing',
        isPublic: true,
      } as any);
    }
    return this.getProductTypes();
  }

  async toggleProductTypeActive(id: number, isActive: boolean) {
    await this.db
      .update(productTypes)
      .set({ isActive } as any)
      .where(eq(productTypes.id, id as any));
    return this.getProductTypes();
  }

  async getSelectedCodes(): Promise<string[]> {
    const row = await this.db.select().from(settings).where(eq(settings.key, 'landing_product_types')).limit(1);
    if (!row.length) return [];
    return (row[0].value as string[]) ?? [];
  }

  async getFeaturedProductTypes() {
    const selected = await this.getSelectedCodes();

    const all = await this.db
      .select({
        id: productTypes.id,
        code: productTypes.code,
        name: productTypes.name,
        imagePath: media.path,
        count: sql<number>`count(DISTINCT ${products.id})`,
      })
      .from(productTypes)
      .leftJoin(media, eq(productTypes.imageMediaId, media.id))
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productTypeId, productTypes.id),
      )
      .leftJoin(
        products,
        and(
          eq(products.id, productTypeAssignments.productId),
          isNull(products.deletedAt),
        ),
      )
      .where(eq(productTypes.isActive, true))
      .groupBy(productTypes.id, productTypes.code, productTypes.name, media.path)
      .orderBy(asc(productTypes.name));

    const byCode = new Map(all.map((r) => [r.code, r]));
    const ordered =
      selected.length > 0
        ? selected
            .map((code) => byCode.get(code))
            .filter((r): r is NonNullable<typeof r> => !!r)
        : all;

    return ordered.map((t) => ({
      id: Number(t.id),
      code: t.code,
      name: t.name,
      imagePath: t.imagePath,
      count: Number(t.count ?? 0),
    }));
  }

  // ── Daily Deals ──

  private async resolveCarouselProducts(ids: number[]) {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        price: productVariants.currentPrice,
        originalPrice: productVariants.currentComparePrice,
        image: media.path,
        category: categories.name,
        plu: products.plu,
        barcode: productVariants.barcode,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .leftJoin(productCategories, eq(productCategories.productId, products.id))
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(and(inArray(products.id, ids.map((i) => BigInt(i))), isNull(products.deletedAt)));

    const byId = new Map<number, Record<string, unknown>>();
    for (const r of rows) {
      const id = Number(r.id);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        price: Number(r.price ?? 0),
        originalPrice: r.originalPrice ? Number(r.originalPrice) : undefined,
        image: r.image,
        category: r.category,
        plu: r.plu,
        barcode: r.barcode,
      });
    }
    return ids
      .map((id) => byId.get(id))
      .filter((x): x is Record<string, unknown> => !!x);
  }

  async getDailyDeals() {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'daily_deals'))
      .limit(1);
    const config = row.length ? (row[0].value as any) : null;
    const featuredItems = Array.isArray(config?.featuredItems)
      ? config.featuredItems.map((it: any) => ({
          ...it,
          startAt: it?.startAt ?? null,
          endAt: it?.endAt ?? null,
        }))
      : [];

    const legacyIds = Array.isArray(config?.carouselProductIds)
      ? config.carouselProductIds.map(Number)
      : [];

    let carousels: Array<{
      id: string;
      name: string;
      startAt: string | null;
      endAt: string | null;
      products: Array<{ id: number; startAt: string | null; endAt: string | null }>;
    }> = (Array.isArray(config?.carousels) ? config.carousels : []).map(
      (c: any, i: number) => ({
        id: String(c?.id ?? `c${i + 1}`),
        name: String(c?.name ?? `Carousel ${i + 1}`),
        startAt: c?.startAt ?? null,
        endAt: c?.endAt ?? null,
        products: (Array.isArray(c?.products) ? c.products : [])
          .map((p: any) => ({
            id: Number(p?.id),
            startAt: p?.startAt ?? null,
            endAt: p?.endAt ?? null,
          }))
          .filter((p: any) => Number.isFinite(p.id)),
      }),
    );

    // Compatibilidad: si aún no hay grupos pero sí ids sueltos, se crea uno por defecto.
    if (carousels.length === 0 && legacyIds.length > 0) {
      carousels = [
        {
          id: 'default',
          name: 'Carousel principal',
          startAt: null,
          endAt: null,
          products: legacyIds.map((id) => ({ id, startAt: null, endAt: null })),
        },
      ];
    }

    const allIds = [
      ...new Set(carousels.flatMap((c) => c.products.map((p) => p.id))),
    ];
    const resolved = await this.resolveCarouselProducts(allIds);
    const byId = new Map<number, Record<string, unknown>>(
      resolved.map((p: any) => [Number(p.id), p]),
    );

    const carouselsWithProducts = carousels.map((c) => ({
      ...c,
      products: c.products.map((p) => ({
        ...(byId.get(p.id) ?? { id: p.id }),
        id: p.id,
        startAt: p.startAt,
        endAt: p.endAt,
      })),
    }));

    const carouselProductIds = allIds;
    const carousel = allIds
      .map((id) => byId.get(id))
      .filter((x): x is Record<string, unknown> => !!x);

    return { featuredItems, carousels: carouselsWithProducts, carouselProductIds, carousel };
  }

  async updateDailyDeals(body: {
    featuredItems?: any[];
    carousels?: any[];
    carouselProductIds?: number[];
  }) {
    const featuredItems = (body.featuredItems ?? []).map((it: any) => ({
      ...it,
      startAt: it?.startAt ?? null,
      endAt: it?.endAt ?? null,
    }));

    const carousels = (body.carousels ?? []).map((c: any, i: number) => ({
      id: String(c?.id ?? `c${i + 1}`),
      name: String(c?.name ?? `Carousel ${i + 1}`),
      startAt: c?.startAt ?? null,
      endAt: c?.endAt ?? null,
      products: (Array.isArray(c?.products) ? c.products : [])
        .map((p: any) => ({
          id: Number(p?.id),
          startAt: p?.startAt ?? null,
          endAt: p?.endAt ?? null,
        }))
        .filter((p: any) => Number.isFinite(p.id)),
    }));

    // Solo un carousel puede estar activo a la vez: los rangos no deben cruzarse.
    for (let i = 0; i < carousels.length; i++) {
      for (let j = i + 1; j < carousels.length; j++) {
        if (this.rangesOverlap(carousels[i], carousels[j])) {
          throw new BadRequestException(
            `Los carouseles "${carousels[i].name}" y "${carousels[j].name}" se cruzan en fechas. Solo uno puede estar activo a la vez.`,
          );
        }
      }
    }

    const carouselProductIds = body.carouselProductIds
      ? body.carouselProductIds.map(Number)
      : [...new Set(carousels.flatMap((c) => c.products.map((p) => p.id)))];

    const value = { featuredItems, carousels, carouselProductIds };
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'daily_deals'))
      .limit(1);
    if (row.length) {
      await this.db
        .update(settings)
        .set({ value: value as any })
        .where(eq(settings.key, 'daily_deals'));
    } else {
      await this.db.insert(settings).values({
        key: 'daily_deals',
        value: value as any,
        dataType: 'json',
        module: 'landing',
        description: 'Ofertas del día: display rotativo y carousel de productos',
        isPublic: true,
      } as any);
    }
    return this.getDailyDeals();
  }

  // ¿La fecha actual está dentro del rango [startAt, endAt]? (null = sin límite)
  private isScheduleActive(startAt?: string | null, endAt?: string | null): boolean {
    const now = Date.now();
    if (startAt) {
      const s = new Date(startAt).getTime();
      if (!Number.isNaN(s) && now < s) return false;
    }
    if (endAt) {
      const e = new Date(endAt).getTime();
      if (!Number.isNaN(e) && now > e) return false;
    }
    return true;
  }

  // Dos rangos se cruzan si comparten algún instante. null = abierto por ese lado.
  private rangesOverlap(
    a: { startAt?: string | null; endAt?: string | null },
    b: { startAt?: string | null; endAt?: string | null },
  ): boolean {
    const toTime = (v: string | null | undefined, fallback: number) => {
      if (!v) return fallback;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? fallback : t;
    };
    const aS = toTime(a.startAt, -Infinity);
    const aE = toTime(a.endAt, Infinity);
    const bS = toTime(b.startAt, -Infinity);
    const bE = toTime(b.endAt, Infinity);
    return aS < bE && bS < aE;
  }

  async getPublicDailyDeals() {
    const { featuredItems, carousels, carousel } = await this.getDailyDeals();

    const activeItems = featuredItems.filter((it: any) =>
      this.isScheduleActive(it.startAt, it.endAt),
    );

    let products: Array<Record<string, unknown>> = [];
    if (carousels.length > 0) {
      const byId = new Map<number, Record<string, unknown>>(
        carousel.map((p: any) => [Number(p.id), p]),
      );
      const seen = new Set<number>();
      for (const group of carousels) {
        if (!this.isScheduleActive(group.startAt, group.endAt)) continue;
        for (const p of group.products) {
          if (!this.isScheduleActive(p.startAt, p.endAt)) continue;
          const id = Number(p.id);
          if (seen.has(id)) continue;
          const prod = byId.get(id);
          if (prod) {
            seen.add(id);
            products.push(prod);
          }
        }
      }
    } else {
      products = carousel;
    }

    return { featuredItems: activeItems, carousel: products };
  }

  // ── Landing Brands ──

  async getLandingBrands() {
    const rows = await this.db
      .select({
        id: brands.id,
        code: brands.code,
        name: brands.name,
        slug: brands.slug,
        isActive: brands.isActive,
        imagePath: media.path,
      })
      .from(brands)
      .leftJoin(media, eq(brands.logoMediaId, media.id))
      .where(isNull(brands.deletedAt))
      .orderBy(asc(brands.name));

    const counts = await this.db
      .select({
        brandId: products.brandId,
        count: sql<number>`count(*)`,
      })
      .from(products)
      .where(isNull(products.deletedAt))
      .groupBy(products.brandId);

    const countMap = new Map<number, number>();
    for (const c of counts) {
      if (c.brandId !== null) countMap.set(Number(c.brandId), Number(c.count));
    }

    const selected = await this.getSelectedBrandCodes();
    return rows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      slug: row.slug,
      isActive: row.isActive,
      imagePath: row.imagePath,
      productCount: countMap.get(Number(row.id)) ?? 0,
      selected: row.code ? selected.includes(row.code) : false,
    }));
  }

  async updateLandingBrands(codes: string[]) {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'landing_brands'))
      .limit(1);
    if (row.length) {
      await this.db
        .update(settings)
        .set({ value: codes as any })
        .where(eq(settings.key, 'landing_brands'));
    } else {
      await this.db.insert(settings).values({
        key: 'landing_brands',
        value: codes as any,
        dataType: 'json',
        module: 'landing',
        description: 'Marcas visibles en la landing',
        isPublic: true,
      } as any);
    }
    return this.getLandingBrands();
  }

  async toggleLandingBrandActive(id: number, isActive: boolean) {
    await this.db
      .update(brands)
      .set({ isActive, updatedAt: new Date().toISOString() } as any)
      .where(eq(brands.id, id as any));
    return this.getLandingBrands();
  }

  async getSelectedBrandCodes(): Promise<string[]> {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'landing_brands'))
      .limit(1);
    if (!row.length) return [];
    return (row[0].value as string[]) ?? [];
  }

  async getPublicBrands() {
    const selected = await this.getSelectedBrandCodes();

    if (selected.length > 0) {
      const all = await this.db
        .select({
          id: sql<number>`${brands.id}`,
          code: brands.code,
          name: brands.name,
          slug: brands.slug,
          description: brands.description,
          image: media.path,
          website: brands.website,
        })
        .from(brands)
        .leftJoin(media, eq(brands.logoMediaId, media.id))
        .where(and(eq(brands.isActive, true), isNull(brands.deletedAt)))
        .orderBy(asc(brands.name));
      const byCode = new Map(all.map((r) => [r.code, r]));
      return selected
        .map((code) => byCode.get(code))
        .filter((r): r is NonNullable<typeof r> => !!r);
    }

    // Fallback: marcas destacadas (comportamiento original)
    return this.db
      .select({
        id: sql<number>`${brands.id}`,
        code: brands.code,
        name: brands.name,
        slug: brands.slug,
        description: brands.description,
        image: media.path,
        website: brands.website,
      })
      .from(brands)
      .leftJoin(media, eq(brands.logoMediaId, media.id))
      .where(
        and(
          eq(brands.isActive, true),
          eq(brands.isFeatured, true),
          isNull(brands.deletedAt),
        ),
      )
      .orderBy(asc(brands.name));
  }

  // ── Landing Benefits (sección ¿Por qué comprar?) ──

  async getLandingBenefits() {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'landing_benefits'))
      .limit(1);
    return row.length ? ((row[0].value as any) ?? []) : [];
  }

  async updateLandingBenefits(items: any[]) {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'landing_benefits'))
      .limit(1);
    if (row.length) {
      await this.db
        .update(settings)
        .set({ value: items as any })
        .where(eq(settings.key, 'landing_benefits'));
    } else {
      await this.db.insert(settings).values({
        key: 'landing_benefits',
        value: items as any,
        dataType: 'json',
        module: 'landing',
        description: 'Sección ¿Por qué comprar en Mercaldas?',
        isPublic: true,
      } as any);
    }
    return this.getLandingBenefits();
  }

  async getPublicBenefits() {
    const items = await this.getLandingBenefits();
    if (Array.isArray(items) && items.length > 0) return items;
    return [];
  }

  // ── General (logo, título y tema del sitio) ──

  /** Valor crudo guardado en `settings.general_logo` (personalizaciones). */
  private async readGeneralSetting(): Promise<Record<string, any>> {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'general_logo'))
      .limit(1);
    return row.length ? ((row[0].value as any) ?? {}) : {};
  }

  async getGeneralLogo() {
    const value = await this.readGeneralSetting();
    return {
      url: value.url ?? '',
      title: value.title ?? '',
      favicon: value.favicon ?? '',
      // Paleta efectiva (por defecto + personalizaciones del admin).
      theme: mergeTheme(sanitizeTheme(value.theme)),
    };
  }

  async updateGeneralLogo(body: {
    url?: string;
    title?: string;
    favicon?: string;
    theme?: unknown;
  }) {
    const current = await this.readGeneralSetting();
    const currentTheme = sanitizeTheme(current.theme);
    const incomingTheme =
      body.theme !== undefined ? sanitizeTheme(body.theme) : {};
    const value = {
      url: body.url !== undefined ? body.url : (current.url ?? ''),
      title:
        body.title !== undefined
          ? body.title.trim()
          : (current.title ?? ''),
      favicon: body.favicon !== undefined ? body.favicon : (current.favicon ?? ''),
      // Se guardan sólo las personalizaciones. Un tema presente en el body
      // reemplaza al guardado (enviarlo vacío lo devuelve a por defecto).
      theme: { ...currentTheme, ...incomingTheme } as Partial<ThemeConfig>,
    };
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'general_logo'))
      .limit(1);
    if (row.length) {
      await this.db
        .update(settings)
        .set({ value: value as any })
        .where(eq(settings.key, 'general_logo'));
    } else {
      await this.db.insert(settings).values({
        key: 'general_logo',
        value: value as any,
        dataType: 'json',
        module: 'general',
        description: 'Logo, favicon, título y temas (claro/oscuro) de la empresa',
        isPublic: true,
      } as any);
    }
    return this.getGeneralLogo();
  }

  // ── Footer ──

  async getFooterConfig() {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'footer_config'))
      .limit(1);
    const config = row.length ? (row[0].value as any) : null;
    return config ?? {};
  }

  async updateFooterConfig(body: any) {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'footer_config'))
      .limit(1);
    if (row.length) {
      await this.db
        .update(settings)
        .set({ value: body as any })
        .where(eq(settings.key, 'footer_config'));
    } else {
      await this.db.insert(settings).values({
        key: 'footer_config',
        value: body as any,
        dataType: 'json',
        module: 'landing',
        description: 'Configuración del footer',
        isPublic: true,
      } as any);
    }
    return this.getFooterConfig();
  }

  async getPublicFooterConfig() {
    const config = await this.getFooterConfig();
    // Resolver categorías del footer si tiene categoryCodes
    const codes: string[] = Array.isArray(config?.categoryCodes)
      ? config.categoryCodes
      : [];
    let resolvedCategories: { code: string; name: string }[] = [];
    if (codes.length > 0) {
      const rows = await this.db
        .select({ code: categories.code, name: categories.name })
        .from(categories)
        .where(inArray(categories.code, codes));
      resolvedCategories = rows.map((r) => ({ code: r.code ?? '', name: r.name }));
    }
    return { ...config, resolvedCategories };
  }
}
