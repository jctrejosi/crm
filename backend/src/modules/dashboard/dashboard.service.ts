import { Injectable, Logger } from '@nestjs/common';
import { eq, and, gte, desc, asc, sql, count, sum, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  orders,
  customers,
  products,
  productVariants,
  inventory,
  shipments,
  promotions,
  banners,
  popups,
  orderItems,
  productCategories,
  categories,
  brands,
  branches,
  suppliers,
  supplierProducts,
} from '../../../drizzle/schema';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  private get db() {
    return this.drizzle.db;
  }

  async getStats(): Promise<DashboardStats> {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    ).toISOString();

    const [
      todayRevenue,
      todayOrders,
      activeCustomers,
      activeProducts,
      pendingDeliveries,
      lowStock,
      activePromotions,
      activeBanners,
      activePopups,
    ] = await Promise.all([
      // Today's revenue (solo pedidos PAGADOS hoy)
      this.db
        .select({ total: sql<number>`coalesce(sum(${orders.grandTotal}), 0)` })
        .from(orders)
        .where(
          and(
            gte(orders.createdAt, todayStart),
            sql`${orders.createdAt} <= ${todayEnd}`,
            eq(orders.status, 'paid'),
          ),
        )
        .then((r) => r[0]?.total ?? 0),

      // Today's order count
      this.db
        .select({ count: count() })
        .from(orders)
        .where(
          and(
            gte(orders.createdAt, todayStart),
            sql`${orders.createdAt} <= ${todayEnd}`,
          ),
        )
        .then((r) => r[0]?.count ?? 0),

      // Active customers
      this.db
        .select({ count: count() })
        .from(customers)
        .where(and(eq(customers.isActive, true), isNull(customers.deletedAt)))
        .then((r) => r[0]?.count ?? 0),

      // Active products
      this.db
        .select({ count: count() })
        .from(products)
        .where(and(eq(products.isActive, true), isNull(products.deletedAt)))
        .then((r) => r[0]?.count ?? 0),

      // Pending deliveries (shipments not delivered/cancelled)
      this.db
        .select({ count: count() })
        .from(shipments)
        .where(
          sql`${shipments.status} not in ('DELIVERED', 'CANCELLED')`,
        )
        .then((r) => r[0]?.count ?? 0),

      // Low stock alerts
      this.db
        .select({ count: count() })
        .from(inventory)
        .where(
          sql`${inventory.stock} <= ${inventory.minimumStock} or ${inventory.stock} <= ${inventory.reorderPoint}`,
        )
        .then((r) => r[0]?.count ?? 0),

      // Active promotions
      this.db
        .select({ count: count() })
        .from(promotions)
        .where(
          and(
            eq(promotions.isActive, true),
            isNull(promotions.deletedAt),
            sql`(${promotions.startDate} is null or ${promotions.startDate} <= now())`,
            sql`(${promotions.endDate} is null or ${promotions.endDate} >= now())`,
          ),
        )
        .then((r) => r[0]?.count ?? 0),

      // Active banners (hero + promo)
      this.db
        .select({ count: count() })
        .from(banners)
        .where(eq(banners.isActive, true))
        .then((r) => r[0]?.count ?? 0),

      // Active popups
      this.db
        .select({ count: count() })
        .from(popups)
        .where(
          and(
            eq(popups.isActive, true),
            isNull(popups.deletedAt),
          ),
        )
        .then((r) => r[0]?.count ?? 0),
    ]);

    // New customers today
    const newCustomersToday = await this.db
      .select({ count: count() })
      .from(customers)
      .where(
        and(
          gte(customers.createdAt, todayStart),
          sql`${customers.createdAt} <= ${todayEnd}`,
        ),
      )
      .then((r) => r[0]?.count ?? 0);

    return {
      todayRevenue,
      todayOrders,
      activeCustomers,
      activeProducts,
      pendingDeliveries,
      lowStockAlerts: lowStock,
      activePromotions,
      activeBanners,
      activePopups,
      newCustomersToday,
    };
  }

  async getRevenueByDay(days: number): Promise<DayStat[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const rows = await this.db
      .select({
        day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
        revenue: sql<number>`coalesce(sum(${orders.grandTotal}), 0)`,
        orderCount: sql<number>`count(*)`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, since.toISOString()),
          eq(orders.status, 'paid'),
        ),
      )
      .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(
        asc(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`),
      );

    return rows.map((r) => ({
      day: formatDayLabel(r.day),
      date: r.day,
      revenue: r.revenue,
      orders: r.orderCount,
    }));
  }

  async getSalesByCategory(period: 'today' | 'week' | 'month' = 'week'): Promise<SalesSlice[]> {
    const since = getSince(period);

    const rows = await this.db
      .select({
        categoryId: sql<number>`${categories.id}`,
        categoryName: sql<string>`${categories.name}`,
        total: sql<number>`coalesce(sum(${orderItems.total}), 0)`,
        count: sql<number>`count(distinct ${orders.id})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(productVariants, eq(orderItems.productVariantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .innerJoin(productCategories, eq(products.id, productCategories.productId))
      .innerJoin(categories, eq(productCategories.categoryId, categories.id))
      .where(
        and(
          gte(orders.createdAt, since),
          sql`${orders.status} not in ('cancelled')`,
        ),
      )
      .groupBy(categories.id, categories.name)
      .orderBy(desc(sql`coalesce(sum(${orderItems.total}), 0)`))
      .limit(10);

    return rows.map((r) => ({
      id: r.categoryId,
      name: r.categoryName ?? `Cat ${r.categoryId}`,
      total: r.total,
      count: r.count,
    }));
  }

  async getSalesByBrand(period: 'today' | 'week' | 'month' = 'week'): Promise<SalesSlice[]> {
    const since = getSince(period);
    
    const rows = await this.db
      .select({
        brandId: sql<number>`${brands.id}`,
        brandName: sql<string>`${brands.name}`,
        total: sql<number>`coalesce(sum(${orderItems.total}), 0)`,
        count: sql<number>`count(distinct ${orders.id})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(productVariants, eq(orderItems.productVariantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(
        and(
          gte(orders.createdAt, since),
          sql`${orders.status} not in ('cancelled')`,
        ),
      )
      .groupBy(brands.id, brands.name)
      .orderBy(desc(sql`coalesce(sum(${orderItems.total}), 0)`))
      .limit(10);

    return rows.map((r) => ({
      id: r.brandId,
      name: r.brandName ?? `Marca ${r.brandId}`,
      total: r.total,
      count: r.count,
    }));
  }

  async getSalesByProductType(period: 'today' | 'week' | 'month' = 'week'): Promise<SalesSlice[]> {
    const since = getSince(period);

    const rows = await this.db
      .select({
        code: sql<string>`${products.productType}`,
        total: sql<number>`coalesce(sum(${orderItems.total}), 0)`,
        count: sql<number>`count(distinct ${orders.id})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(productVariants, eq(orderItems.productVariantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(
        and(
          gte(orders.createdAt, since),
          sql`${orders.status} not in ('cancelled')`,
          sql`${products.productType} is not null`,
        ),
      )
      .groupBy(products.productType)
      .orderBy(desc(sql`coalesce(sum(${orderItems.total}), 0)`))
      .limit(10);

    return rows.map((r) => ({
      id: 0,
      name: r.code ?? 'Sin tipo',
      total: r.total,
      count: r.count,
    }));
  }

  async getSalesByBranch(period: 'today' | 'week' | 'month' = 'week'): Promise<SalesSlice[]> {
    const since = getSince(period);
    
    const rows = await this.db
      .select({
        branchId: sql<number>`${branches.id}`,
        branchName: sql<string>`${branches.name}`,
        total: sql<number>`coalesce(sum(${orders.grandTotal}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(orders)
      .innerJoin(branches, eq(orders.branchId, branches.id))
      .where(
        and(
          gte(orders.createdAt, since),
          sql`${orders.status} not in ('cancelled')`,
        ),
      )
      .groupBy(branches.id, branches.name)
      .orderBy(desc(sql`coalesce(sum(${orders.grandTotal}), 0)`))
      .limit(10);

    return rows.map((r) => ({
      id: r.branchId,
      name: r.branchName ?? `Sucursal ${r.branchId}`,
      total: r.total,
      count: r.count,
    }));
  }

  async getSalesBySupplier(period: 'today' | 'week' | 'month' = 'week'): Promise<SalesSlice[]> {
    const since = getSince(period);

    const rows = await this.db
      .select({
        supplierId: sql<number>`${suppliers.id}`,
        supplierName: sql<string>`${suppliers.legalName}`,
        total: sql<number>`coalesce(sum(${orderItems.total}), 0)`,
        count: sql<number>`count(distinct ${orders.id})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(supplierProducts, eq(orderItems.productVariantId, supplierProducts.productVariantId))
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(
        and(
          gte(orders.createdAt, since),
          sql`${orders.status} not in ('cancelled')`,
        ),
      )
      .groupBy(suppliers.id, suppliers.legalName)
      .orderBy(desc(sql`coalesce(sum(${orderItems.total}), 0)`))
      .limit(10);

    return rows.map((r) => ({
      id: r.supplierId,
      name: r.supplierName ?? `Proveedor ${r.supplierId}`,
      total: r.total,
      count: r.count,
    }));
  }

  async getTodayOrders(statusFilter?: string): Promise<any[]> {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    ).toISOString();

    const conditions: any[] = [
      gte(orders.createdAt, todayStart),
      sql`${orders.createdAt} <= ${todayEnd}`,
    ];
    if (statusFilter) {
      conditions.push(sql`${orders.status} = ${statusFilter}`);
    }

    const rows = await this.db
      .select({
        id: orders.id,
        referenceCode: orders.referenceCode,
        status: orders.status,
        grandTotal: orders.grandTotal,
        customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
        createdAt: orders.createdAt,
        itemsCount: sql<number>`(select count(*) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt))
      .limit(100);

    return rows.map((r) => ({
      id: Number(r.id),
      referenceCode: r.referenceCode,
      status: r.status,
      grandTotal: r.grandTotal,
      customerName: r.customerName || 'Cliente invitado',
      createdAt: r.createdAt,
      itemsCount: r.itemsCount,
    }));
  }

  async getLowStockProducts(): Promise<any[]> {
    const rows = await this.db
      .select({
        productId: products.id,
        productName: products.name,
        stock: sql<number>`${inventory.stock}`,
        minimumStock: inventory.minimumStock,
        reorderPoint: inventory.reorderPoint,
        branchId: inventory.branchId,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(inventory.productVariantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(products.isActive, true),
          sql`(${inventory.stock} <= ${inventory.minimumStock} or ${inventory.stock} <= ${inventory.reorderPoint})`,
        ),
      )
      .orderBy(asc(inventory.stock))
      .limit(50);

    return rows.map((r) => ({
      productId: Number(r.productId),
      productName: r.productName,
      stock: r.stock,
      minimumStock: r.minimumStock,
      reorderPoint: r.reorderPoint,
    }));
  }

  async getRecentOrders(limit = 10): Promise<any[]> {

    const rows = await this.db
      .select({
        id: orders.id,
        referenceCode: orders.referenceCode,
        status: orders.status,
        grandTotal: orders.grandTotal,
        customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
        createdAt: orders.createdAt,
        itemsCount: sql<number>`(select count(*) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: Number(r.id),
      referenceCode: r.referenceCode,
      status: r.status,
      grandTotal: r.grandTotal,
      customerName: r.customerName || 'Cliente invitado',
      createdAt: r.createdAt,
      itemsCount: r.itemsCount,
    }));
  }

  async getActiveCustomers(limit = 50): Promise<any[]> {
    const rows = await this.db
      .select({
        id: customers.id,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        createdAt: customers.createdAt,
        lastActivityAt: customers.lastActivityAt,
      })
      .from(customers)
      .where(and(eq(customers.isActive, true), isNull(customers.deletedAt)))
      .orderBy(desc(customers.lastActivityAt))
      .limit(limit);

    return rows.map((r) => ({
      id: Number(r.id),
      email: r.email,
      name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email,
      phone: r.phone,
      createdAt: r.createdAt,
      lastActivityAt: r.lastActivityAt,
    }));
  }

  async getActiveBannersAndPopups(): Promise<any[]> {
    const [bannerRows, popupRows] = await Promise.all([
      this.db
        .select({
          id: banners.id,
          title: banners.title,
          bannerType: banners.bannerType,
          isActive: banners.isActive,
          status: sql<string>`
            case
              when ${banners.isActive} = false then 'inactivo'
              when ${banners.startDate} > now() then 'programado'
              when ${banners.endDate} < now() then 'expirado'
              else 'activo'
            end
          `,
          createdAt: banners.createdAt,
        })
        .from(banners)
        .orderBy(desc(banners.createdAt))
        .limit(20),
      this.db
        .select({
          id: popups.id,
          title: popups.title,
          position: popups.position,
          isActive: popups.isActive,
          status: sql<string>`
            case
              when ${popups.isActive} = false then 'inactivo'
              when ${popups.startDate} > now() then 'programado'
              when ${popups.endDate} < now() then 'expirado'
              else 'activo'
            end
          `,
          createdAt: popups.createdAt,
        })
        .from(popups)
        .where(isNull(popups.deletedAt))
        .orderBy(desc(popups.createdAt))
        .limit(20),
    ]);

    return [
      ...bannerRows.map((b) => ({
        id: `banner-${b.id}`,
        type: 'banner' as const,
        title: b.title,
        subType: b.bannerType,
        isActive: b.isActive,
        status: b.status,
        createdAt: b.createdAt,
      })),
      ...popupRows.map((p) => ({
        id: `popup-${p.id}`,
        type: 'popup' as const,
        title: p.title,
        subType: p.position,
        isActive: p.isActive,
        status: p.status,
        createdAt: p.createdAt,
      })),
    ];
  }

  async getActivePromotions(limit = 20): Promise<any[]> {
    const rows = await this.db
      .select({
        id: promotions.id,
        name: promotions.name,
        description: promotions.description,
        isActive: promotions.isActive,
        startDate: promotions.startDate,
        endDate: promotions.endDate,
        timesUsed: promotions.timesUsed,
        createdAt: promotions.createdAt,
      })
      .from(promotions)
      .where(
        and(
          eq(promotions.isActive, true),
          isNull(promotions.deletedAt),
        ),
      )
      .orderBy(desc(promotions.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      isActive: r.isActive,
      startDate: r.startDate,
      endDate: r.endDate,
      timesUsed: r.timesUsed,
      createdAt: r.createdAt,
    }));
  }

  async getPendingDeliveries(limit = 50): Promise<any[]> {

    const rows = await this.db
      .select({
        id: shipments.id,
        status: shipments.status,
        recipientName: shipments.recipientName,
        address: shipments.addressLine1,
        trackingNumber: shipments.trackingNumber,
        estimatedDeliveryAt: shipments.estimatedDeliveryAt,
        orderId: shipments.orderId,
        customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
      })
      .from(shipments)
      .leftJoin(orders, eq(shipments.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(
        sql`${shipments.status} not in ('DELIVERED', 'CANCELLED')`,
      )
      .orderBy(asc(shipments.estimatedDeliveryAt))
      .limit(limit);

    return rows.map((r) => ({
      id: Number(r.id),
      orderId: Number(r.orderId),
      status: r.status,
      recipientName: r.recipientName || r.customerName || '—',
      address: r.address,
      trackingNumber: r.trackingNumber,
      estimatedDeliveryAt: r.estimatedDeliveryAt,
    }));
  }
}

function getSince(period: 'today' | 'week' | 'month'): string {
  const d = new Date();
  switch (period) {
    case 'today':
      d.setHours(0, 0, 0, 0);
      break;
    case 'week':
      d.setDate(d.getDate() - 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() - 1);
      break;
  }
  return d.toISOString();
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export interface DashboardStats {
  todayRevenue: number;
  todayOrders: number;
  activeCustomers: number;
  activeProducts: number;
  pendingDeliveries: number;
  lowStockAlerts: number;
  activePromotions: number;
  activeBanners: number;
  activePopups: number;
  newCustomersToday: number;
}

export interface DayStat {
  day: string;
  date: string;
  revenue: number;
  orders: number;
}

export interface SalesSlice {
  id: number;
  name: string;
  total: number;
  count: number;
}
