import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { customers, orderItems, orders } from '../../../drizzle/schema';

/**
 * Servicio mínimo de pedidos para el CRM: solo el detalle que consume el modal
 * del dashboard. Extraído de `orders.service.ts` del backend del ecommerce,
 * sin los servicios de pagos, notificaciones ni socket.io.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly drizzle: DrizzleService) {}

  private get db() {
    return this.drizzle.db;
  }

  async getOrderById(orderId: number) {
    const [row] = await this.db
      .select({
        id: orders.id,
        referenceCode: orders.referenceCode,
        status: orders.status,
        subtotal: orders.subtotal,
        discountTotal: orders.discountTotal,
        taxTotal: orders.taxTotal,
        shippingCost: orders.shippingCost,
        grandTotal: orders.grandTotal,
        createdAt: orders.createdAt,
        // Datos del cliente registrado (los del pedido se usan de respaldo
        // para compras de invitado).
        customerFullName: sql<
          string | null
        >`NULLIF(TRIM(CONCAT(${customers.firstName}, ' ', ${customers.lastName})), '')`,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        guestName: orders.customerName,
        guestEmail: orders.customerEmail,
        guestPhone: orders.customerPhone,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, BigInt(orderId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Pedido no encontrado');
    }

    const items = await this.db
      .select({
        productName: orderItems.productName,
        variantSku: orderItems.variantSku,
        quantity: orderItems.quantity,
        unitPriceNet: orderItems.unitPriceNet,
        unitPriceGross: orderItems.unitPriceGross,
        total: orderItems.total,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, Number(orderId)))
      .orderBy(asc(orderItems.id));

    return {
      id: Number(row.id),
      referenceCode: row.referenceCode,
      status: row.status,
      createdAt: row.createdAt,
      customerName: row.customerFullName || row.guestName || 'Cliente invitado',
      customerEmail: row.customerEmail ?? row.guestEmail ?? null,
      customerPhone: row.customerPhone ?? row.guestPhone ?? null,
      subtotal: Number(row.subtotal ?? 0),
      discountTotal: Number(row.discountTotal ?? 0),
      taxTotal: Number(row.taxTotal ?? 0),
      shippingCost: Number(row.shippingCost ?? 0),
      grandTotal: Number(row.grandTotal ?? 0),
      items: items.map((item) => ({
        productName: item.productName,
        variantSku: item.variantSku,
        quantity: Number(item.quantity ?? 1),
        unitPriceNet: Number(item.unitPriceNet ?? 0),
        unitPriceGross: Number(item.unitPriceGross ?? 0),
        total: Number(item.total ?? 0),
      })),
    };
  }
}
