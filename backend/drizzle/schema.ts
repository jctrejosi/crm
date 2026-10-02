/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  pgTable,
  unique,
  bigserial,
  varchar,
  text,
  boolean,
  timestamp,
  check,
  integer,
  foreignKey,
  bigint,
  uuid,
  inet,
  index,
  jsonb,
  smallint,
  numeric,
  uniqueIndex,
  date,
  char,
  time,
  primaryKey,
  pgView,
  pgEnum,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const auditActionEnum = pgEnum('audit_action_enum', [
  'INSERT',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
]);
export const backgroundJobStatusEnum = pgEnum('background_job_status_enum', [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'RETRYING',
]);
export const cartStatusEnum = pgEnum('cart_status_enum', [
  'ACTIVE',
  'ABANDONED',
  'CONVERTED',
  'EXPIRED',
]);
export const customerTokenPurposeEnum = pgEnum('customer_token_purpose_enum', [
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'EMAIL_CHANGE',
  'PHONE_VERIFICATION',
]);
export const customerTypeEnum = pgEnum('customer_type_enum', [
  'registered',
  'guest',
]);
export const deliveryAssignmentStatusEnum = pgEnum(
  'delivery_assignment_status_enum',
  [
    'ASSIGNED',
    'PICKED_UP',
    'IN_DELIVERY',
    'DELIVERED',
    'FAILED',
    'CANCELLED',
    'ACCEPTED',
    'READY_FOR_PICKUP',
    'REJECTED',
    'FAILED_DELIVERY',
  ],
);
export const deliveryEventTypeEnum = pgEnum('delivery_event_type_enum', [
  'ASSIGNED',
  'PICKED_UP',
  'ARRIVED',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'LOCATION_UPDATE',
]);
export const deliveryProofKindEnum = pgEnum('delivery_proof_kind_enum', [
  'LOCATION',
  'PACKAGE',
]);
export const inventoryMovementTypeEnum = pgEnum(
  'inventory_movement_type_enum',
  [
    'purchase',
    'sale',
    'reservation',
    'release',
    'adjustment',
    'return',
    'loss',
  ],
);
export const inventoryReferenceEnum = pgEnum('inventory_reference_enum', [
  'ORDER',
  'PURCHASE_ORDER',
  'TRANSFER',
  'RETURN',
  'MANUAL',
  'ADJUSTMENT',
]);
export const invoiceStatusEnum = pgEnum('invoice_status_enum', [
  'pending',
  'issued',
  'cancelled',
  'failed',
]);
export const mediaStatusEnum = pgEnum('media_status_enum', [
  'active',
  'inactive',
  'archived',
]);
export const mediaTypeEnum = pgEnum('media_type_enum', [
  'image',
  'video',
  'audio',
  'document',
  'other',
]);
export const menuLocationEnum = pgEnum('menu_location_enum', [
  'HEADER',
  'FOOTER',
  'SIDEBAR',
  'MOBILE',
]);
export const notificationChannelEnum = pgEnum('notification_channel_enum', [
  'IN_APP',
  'EMAIL',
  'SMS',
  'PUSH',
]);
export const notificationTypeEnum = pgEnum('notification_type_enum', [
  'INFO',
  'SUCCESS',
  'WARNING',
  'ERROR',
  'ORDER',
  'PAYMENT',
  'PROMOTION',
]);
export const orderStatusEnum = pgEnum('order_status_enum', [
  'created',
  'payment_pending',
  'paid',
  'preparing',
  'ready',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]);
export const paymentIntentStatusEnum = pgEnum('payment_intent_status_enum', [
  'created',
  'pending',
  'authorized',
  'failed',
  'cancelled',
]);
export const paymentMethodEnum = pgEnum('payment_method_enum', [
  'CARD',
  'PSE',
  'CASH',
  'BANK_TRANSFER',
  'NEQUI',
  'DAVIPLATA',
  'BREB',
]);
export const paymentStatusEnum = pgEnum('payment_status_enum', [
  'PENDING',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
  'CANCELLED',
]);
export const promotionConditionTypeEnum = pgEnum(
  'promotion_condition_type_enum',
  [
    'MIN_AMOUNT',
    'MIN_QUANTITY',
    'CUSTOMER_TYPE',
    'PRODUCT',
    'CATEGORY',
    'BRAND',
    'PAYMENT_METHOD',
    'DELIVERY_ZONE',
  ],
);
export const promotionOperatorEnum = pgEnum('promotion_operator_enum', [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'IN',
]);
export const refundStatusEnum = pgEnum('refund_status_enum', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
export const reservationReferenceEnum = pgEnum('reservation_reference_enum', [
  'CART',
  'ORDER',
  'MANUAL',
]);
export const reservationStatusEnum = pgEnum('reservation_status_enum', [
  'active',
  'expired',
  'released',
  'converted',
]);
export const shipmentStatusEnum = pgEnum('shipment_status_enum', [
  'PENDING',
  'PREPARING',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'RETURNED',
  'CANCELLED',
]);

export const roles = pgTable(
  'roles',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: text(),
    isSystem: boolean('is_system').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique('roles_name_key').on(table.name)],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    sessionToken: uuid('session_token')
      .default(sql`uuid_generate_v4()`)
      .notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    lastActivityAt: timestamp('last_activity_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_sessions_user_id_fkey',
    }).onDelete('cascade'),
    unique('user_sessions_session_token_key').on(table.sessionToken),
  ],
);

export const users = pgTable(
  'users',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // TODO: failed to parse database type 'citext'
    email: varchar('email', { length: 255 }).notNull(),
    username: varchar('username', { length: 50 }).notNull(),
    lockedUntil: timestamp('locked_until', {
      withTimezone: true,
      mode: 'string',
    }),
    failedAttempts: bigint('filed_attempts', { mode: 'number' })
      .default(0)
      .notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    phone: varchar({ length: 50 }),
    /** Foto de perfil (URL pública de Cloudinary); null si no tiene. */
    avatarUrl: text('avatar_url'),
    /** Token FCM del dispositivo; lo registra la app de picking para el push. */
    pushToken: text('push_token'),
    isSuperuser: boolean('is_superuser').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // Marca que el usuario puede iniciar sesión en la app móvil de picking.
    isPicker: boolean('is_picker').default(false).notNull(),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_users_email')
      .using('btree', table.email.asc().nullsLast().op('text_ops'))
      .where(sql`(deleted_at IS NULL)`),
    unique('users_email_key').on(table.email),
  ],
);

export const permissions = pgTable(
  'permissions',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    code: varchar({ length: 100 }).notNull(),
    module: varchar({ length: 100 }).notNull(),
    description: text(),
  },
  (table) => [
    index('idx_permissions_module').using(
      'btree',
      table.module.asc().nullsLast().op('text_ops'),
    ),
    unique('permissions_code_key').on(table.code),
  ],
);

export const userRefreshTokens = pgTable(
  'user_refresh_tokens',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    token: text().notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    revoked: boolean().default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_user_refresh_tokens_expires').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_user_refresh_tokens_token').using(
      'btree',
      table.token.asc().nullsLast().op('text_ops'),
    ),
    index('idx_user_refresh_tokens_user').using(
      'btree',
      table.userId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_refresh_tokens_user_id_fkey',
    }).onDelete('cascade'),
    unique('user_refresh_tokens_token_key').on(table.token),
  ],
);

export const store = pgTable(
  'store',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    status: varchar({ length: 20 }).default('ACTIVE').notNull(),
    legalName: varchar('legal_name', { length: 200 }).notNull(),
    tradeName: varchar('trade_name', { length: 200 }).notNull(),
    taxId: varchar('tax_id', { length: 50 }).notNull(),
    taxRegime: varchar('tax_regime', { length: 50 }).notNull(),
    businessName: varchar('business_name', { length: 255 }).notNull(),
    invoiceProvider: varchar('invoice_provider', { length: 50 }).notNull(),
    invoicePrefix: varchar('invoice_prefix', { length: 10 }).notNull(),
    supportedLanguages: jsonb('supported_languages'),
    supportedCurrencies: jsonb('supported_currencies'),
    invoiceResolution: varchar('invoice_resolution', { length: 50 }),
    email: varchar({ length: 255 }).notNull(),
    phone: varchar({ length: 50 }).notNull(),
    whatsapp: varchar({ length: 50 }),
    primaryDomain: varchar('primary_domain', { length: 255 }).notNull(),
    secondaryDomains: jsonb('secondary_domains'),
    address: text().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    logoMediaId: bigint('logo_media_id', { mode: 'number' }),
    themeConfig: jsonb('theme_config').default({}),
    currencyCode: varchar('currency_code', { length: 3 })
      .default('COP')
      .notNull(),
    language: varchar({ length: 10 }).default('es').notNull(),
    timezone: varchar({ length: 50 }).default('America/Bogota').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.logoMediaId],
      foreignColumns: [media.id],
      name: 'fk_store_logo_media',
    }).onDelete('set null'),
    unique('store_tax_id_key').on(table.taxId),
  ],
);

import { customType } from 'drizzle-orm/pg-core';

export const branches = pgTable(
  'branches',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    code: varchar({ length: 20 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    address: text().notNull(),
    city: varchar({ length: 100 }).notNull(),
    phone: varchar({ length: 50 }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    storeId: bigint('store_id', { mode: 'number' }).notNull(),
    email: varchar({ length: 255 }).notNull(),
    priority: smallint().default(1),
    managerName: varchar('manager_name', { length: 150 }).notNull(),
    managerPhone: varchar('manager_phone', { length: 30 }).notNull(),
    maxDailyOrders: integer('max_daily_orders'),
    branchType: varchar('branch_type', { length: 50 }).default('STORE'),
    // TODO: failed to parse database type 'text'
    location: text('location').notNull(),
    deliveryRadiusKm: numeric('delivery_radius_km', { precision: 6, scale: 2 })
      .default('5.0')
      .notNull(),
    schedule: jsonb(),
    imageMediaId: bigint('image_media_id', { mode: 'number' }),
    isActive: boolean('is_active').default(true).notNull(),
    isVisible: boolean('is_visible').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_branches_location').using(
      'btree',
      table.location.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [store.id],
      name: 'branches_store_id_fkey',
    }),
    foreignKey({
      columns: [table.imageMediaId],
      foreignColumns: [media.id],
      name: 'branches_image_media_id_fkey',
    }).onDelete('set null'),
    unique('branches_code_key').on(table.code),
    check(
      'branches_delivery_radius_km_check',
      sql`delivery_radius_km > (0)::numeric`,
    ),
  ],
);

export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    deliveryPrice: numeric('delivery_price', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    displayOrder: smallint('display_order'),
    schedule: jsonb(),
    // TODO: failed to parse database type 'text'
    coverageArea: text('coverage_area').notNull(),
    estimatedMinMinutes: smallint('estimated_min_minutes').notNull(),
    estimatedMaxMinutes: smallint('estimated_max_minutes').notNull(),
    deliveryType: varchar('delivery_type', { length: 30 })
      .default('STANDARD')
      .notNull(),
    minimumOrder: numeric('minimum_order', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    estimatedTimeMinutes: integer('estimated_time_minutes')
      .default(60)
      .notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_delivery_zones_coverage').using(
      'btree',
      table.coverageArea.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'delivery_zones_branch_id_fkey',
    }).onDelete('restrict'),
    check(
      'delivery_zones_minimum_order_check',
      sql`minimum_order >= (0)::numeric`,
    ),
  ],
);

export const media = pgTable(
  'media',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    status: mediaStatusEnum().default('active').notNull(),
    mediaType: mediaTypeEnum('media_type').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    uploadedBy: bigint('uploaded_by', { mode: 'number' }),
    provider: varchar({ length: 50 }).default('local').notNull(),
    path: text().notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    width: integer(),
    height: integer(),
    checksum: varchar({ length: 64 }).notNull(),
    metadata: jsonb().default({}),
    altText: varchar('alt_text', { length: 255 }),
    isPublic: boolean('is_public').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_media_media_type').using(
      'btree',
      table.mediaType.asc().nullsLast().op('enum_ops'),
    ),
    index('idx_media_mime_type').using(
      'btree',
      table.mimeType.asc().nullsLast().op('text_ops'),
    ),
    index('idx_media_provider').using(
      'btree',
      table.provider.asc().nullsLast().op('text_ops'),
    ),
    index('idx_media_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    index('idx_media_uploaded_by').using(
      'btree',
      table.uploadedBy.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [users.id],
      name: 'media_uploaded_by_fkey',
    }),
    unique('media_checksum_key').on(table.checksum),
    check('media_height_check', sql`(height IS NULL) OR (height > 0)`),
    check('media_size_bytes_check', sql`size_bytes >= 0`),
    check('media_width_check', sql`(width IS NULL) OR (width > 0)`),
  ],
);

export const settings = pgTable(
  'settings',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    key: varchar({ length: 100 }).notNull(),
    value: jsonb().notNull(),
    description: text(),
    dataType: varchar('data_type', { length: 20 }).notNull(),
    isEditable: boolean('is_editable').default(true).notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    module: varchar({ length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique('settings_key_key').on(table.key)],
);

export const categories = pgTable(
  'categories',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    parentId: bigint('parent_id', { mode: 'number' }),
    name: varchar({ length: 100 }).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    slug: varchar({ length: 100 }).notNull(),
    code: varchar({ length: 50 }),
    description: text(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    imageMediaId: bigint('image_media_id', { mode: 'number' }),
    level: integer().default(0),
    metaTitle: varchar('meta_title', { length: 255 }),
    metaDescription: text('meta_description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_categories_parent_id')
      .using('btree', table.parentId.asc().nullsLast().op('int8_ops'))
      .where(sql`(deleted_at IS NULL)`),
    uniqueIndex('idx_categories_slug')
      .using('btree', table.slug.asc().nullsLast().op('text_ops'))
      .where(sql`(deleted_at IS NULL)`),
    foreignKey({
      columns: [table.imageMediaId],
      foreignColumns: [media.id],
      name: 'categories_image_media_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: 'categories_parent_id_fkey',
    }).onDelete('restrict'),
    unique('categories_parent_id_name_key').on(table.parentId, table.name),
    unique('categories_slug_key').on(table.slug),
  ],
);

export const brands = pgTable(
  'brands',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    website: varchar({ length: 255 }).notNull(),
    description: text().notNull(),
    country: varchar({ length: 100 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    slug: varchar({ length: 100 }).notNull(),
    code: varchar({ length: 50 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    logoMediaId: bigint('logo_media_id', { mode: 'number' }),
    isPublic: boolean('is_public').default(true).notNull(),
    isFeatured: boolean('is_featured').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('idx_brands_slug')
      .using('btree', table.slug.asc().nullsLast().op('text_ops'))
      .where(sql`(deleted_at IS NULL)`),
    foreignKey({
      columns: [table.logoMediaId],
      foreignColumns: [media.id],
      name: 'brands_logo_media_id_fkey',
    }).onDelete('set null'),
    unique('brands_name_key').on(table.name),
    unique('brands_slug_key').on(table.slug),
  ],
);

export const products = pgTable(
  'products',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    brandId: bigint('brand_id', { mode: 'number' }),
    externalId: varchar('external_id', { length: 50 }),
    name: varchar({ length: 255 }).notNull(),
    slug: varchar({ length: 255 }).notNull(),
    description: text(),
    productType: varchar('product_type', { length: 20 })
      .default('SIMPLE')
      .notNull(),
    skuPrefix: varchar('sku_prefix', { length: 50 }),
    plu: varchar({ length: 20 }),
    featured: boolean().default(false).notNull(),
    manufacturer: varchar({ length: 255 }),
    visibility: varchar({ length: 20 }).default('PUBLIC').notNull(),
    isPublic: boolean('is_public').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    publishedAt: timestamp('published_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_products_brand')
      .using('btree', table.brandId.asc().nullsLast().op('int8_ops'))
      .where(sql`(deleted_at IS NULL)`),
    uniqueIndex('idx_products_external_id')
      .using('btree', table.externalId.asc().nullsLast().op('text_ops'))
      .where(sql`(external_id IS NOT NULL AND deleted_at IS NULL)`),
    index('idx_products_search')
      .using(
        'gin',
        sql`to_tsvector('spanish'::regconfig, public.immutable_unaccent((name || ' ' || COALESCE(description, ''))))`,
      )
      .where(sql`((is_active = true) AND (deleted_at IS NULL))`),
    uniqueIndex('idx_products_slug')
      .using('btree', table.slug.asc().nullsLast().op('text_ops'))
      .where(sql`(deleted_at IS NULL)`),
    foreignKey({
      columns: [table.brandId],
      foreignColumns: [brands.id],
      name: 'products_brand_id_fkey',
    }).onDelete('restrict'),
    unique('products_slug_key').on(table.slug),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    mediaId: bigint('media_id', { mode: 'number' }).notNull(),
    isCover: boolean('is_cover').default(false).notNull(),
    position: integer().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idx_product_images_unique_cover')
      .using('btree', table.productId.asc().nullsLast().op('int8_ops'))
      .where(sql`(is_cover = true)`),
    foreignKey({
      columns: [table.mediaId],
      foreignColumns: [media.id],
      name: 'product_images_media_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'product_images_product_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const attributes = pgTable(
  'attributes',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    slug: varchar({ length: 100 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    unique('attributes_name_key').on(table.name),
    unique('attributes_slug_key').on(table.slug),
  ],
);

export const attributeOptions = pgTable(
  'attribute_options',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    attributeId: bigint('attribute_id', { mode: 'number' }).notNull(),
    value: varchar({ length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idx_attribute_options_unique').using(
      'btree',
      table.attributeId.asc().nullsLast().op('int8_ops'),
      table.value.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.attributeId],
      foreignColumns: [attributes.id],
      name: 'attribute_options_attribute_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const productAttributes = pgTable(
  'product_attributes',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    attributeId: bigint('attribute_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    attributeOptionId: bigint('attribute_option_id', { mode: 'number' }),
    customValue: varchar('custom_value', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.attributeId],
      foreignColumns: [attributes.id],
      name: 'product_attributes_attribute_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.attributeOptionId],
      foreignColumns: [attributeOptions.id],
      name: 'product_attributes_attribute_option_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'product_attributes_product_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    sku: varchar({ length: 100 }).notNull(),
    barcode: varchar({ length: 100 }),
    currentPrice: numeric('current_price', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    currentComparePrice: numeric('current_compare_price', {
      precision: 12,
      scale: 2,
    }),
    lengthMm: integer('length_mm'),
    widthMm: integer('width_mm'),
    heightMm: integer('height_mm'),
    costPrice: numeric('cost_price', { precision: 12, scale: 2 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('idx_product_variants_barcode')
      .using('btree', table.barcode.asc().nullsLast().op('text_ops'))
      .where(sql`(barcode IS NOT NULL)`),
    index('idx_product_variants_current_price')
      .using('btree', table.currentPrice.asc().nullsLast().op('numeric_ops'))
      .where(sql`((is_active = true) AND (deleted_at IS NULL))`),
    uniqueIndex('idx_product_variants_sku').using(
      'btree',
      table.sku.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'product_variants_product_id_fkey',
    }).onDelete('cascade'),
    unique('product_variants_sku_key').on(table.sku),
  ],
);

export const variantAttributes = pgTable(
  'variant_attributes',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    variantId: bigint('variant_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    attributeId: bigint('attribute_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    attributeOptionId: bigint('attribute_option_id', {
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idx_variant_attributes_unique').using(
      'btree',
      table.variantId.asc().nullsLast().op('int8_ops'),
      table.attributeId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.attributeId],
      foreignColumns: [attributes.id],
      name: 'variant_attributes_attribute_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.attributeOptionId],
      foreignColumns: [attributeOptions.id],
      name: 'variant_attributes_attribute_option_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.variantId],
      foreignColumns: [productVariants.id],
      name: 'variant_attributes_variant_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const prices = pgTable(
  'prices',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productVariantId: bigint('product_variant_id', {
      mode: 'number',
    }).notNull(),
    // Sucursal del precio. NULL = precio global (aplica a todas las sucursales).
    branchId: bigint('branch_id', { mode: 'number' }),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'string' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    changedBy: bigint('changed_by', { mode: 'number' }).notNull(),
    changeReason: varchar('change_reason', { length: 100 }).notNull(),
    cost: numeric({ precision: 12, scale: 2 }),
    price: numeric({ precision: 12, scale: 2 }).notNull(),
    comparePrice: numeric('compare_price', { precision: 12, scale: 2 }),
    version: integer().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Un solo precio activo global por variante (sin sucursal)
    uniqueIndex('idx_prices_active_global')
      .using('btree', table.productVariantId.asc().nullsLast().op('int8_ops'))
      .where(sql`(end_date IS NULL AND branch_id IS NULL)`),
    // Un solo precio activo por variante y sucursal
    uniqueIndex('idx_prices_active_branch')
      .using(
        'btree',
        table.productVariantId.asc().nullsLast().op('int8_ops'),
        table.branchId.asc().nullsLast().op('int8_ops'),
      )
      .where(sql`(end_date IS NULL AND branch_id IS NOT NULL)`),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'prices_branch_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.changedBy],
      foreignColumns: [users.id],
      name: 'prices_changed_by_fkey',
    }),
    foreignKey({
      columns: [table.productVariantId],
      foreignColumns: [productVariants.id],
      name: 'prices_product_variant_id_fkey',
    }).onDelete('cascade'),
    check(
      'prices_check',
      sql`(compare_price IS NULL) OR (compare_price <= price)`,
    ),
    check('prices_cost_check', sql`(cost IS NULL) OR (cost >= (0)::numeric)`),
    check(
      'prices_date_check',
      sql`(end_date IS NULL) OR (end_date > start_date)`,
    ),
    check('prices_price_check', sql`price >= (0)::numeric`),
  ],
);

export const taxRates = pgTable(
  'tax_rates',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    name: varchar({ length: 50 }).notNull(),
    code: varchar({ length: 30 }).notNull(),
    description: text(),
    priority: smallint().default(1).notNull(),
    compound: boolean().default(false).notNull(),
    validFrom: date('valid_from'),
    countryCode: char('country_code', { length: 2 }),
    stateCode: varchar('state_code', { length: 20 }),
    cityCode: varchar('city_code', { length: 20 }),
    validTo: date('valid_to'),
    rate: numeric({ precision: 5, scale: 2 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    taxType: varchar('tax_type', { length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_tax_rates_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_tax_rates_code').using(
      'btree',
      table.code.asc().nullsLast().op('text_ops'),
    ),
    index('idx_tax_rates_validity').using(
      'btree',
      table.validFrom.asc().nullsLast().op('date_ops'),
      table.validTo.asc().nullsLast().op('date_ops'),
    ),
    unique('tax_rates_code_key').on(table.code),
    check(
      'tax_rates_check',
      sql`(valid_to IS NULL) OR (valid_to >= valid_from)`,
    ),
    check(
      'tax_rates_rate_check',
      sql`(rate >= (0)::numeric) AND (rate <= (100)::numeric)`,
    ),
  ],
);

export const inventory = pgTable(
  'inventory',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productVariantId: bigint('product_variant_id', {
      mode: 'number',
    }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }).notNull(),
    stock: integer().default(0).notNull(),
    reservedStock: integer('reserved_stock').default(0).notNull(),
    reorderPoint: integer('reorder_point').default(0).notNull(),
    targetStock: integer('target_stock'),
    lastMovementAt: timestamp('last_movement_at', {
      withTimezone: true,
      mode: 'string',
    }),
    lastCountedAt: timestamp('last_counted_at', {
      withTimezone: true,
      mode: 'string',
    }),
    minimumStock: integer('minimum_stock').default(0),
    maximumStock: integer('maximum_stock').default(999999),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_inventory_branch').using(
      'btree',
      table.branchId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_inventory_branch_stock')
      .using(
        'btree',
        table.branchId.asc().nullsLast().op('int8_ops'),
        table.stock.asc().nullsLast().op('int4_ops'),
      )
      .where(sql`(stock > 0)`),
    index('idx_inventory_reorder').using(
      'btree',
      table.reorderPoint.asc().nullsLast().op('int4_ops'),
    ),
    index('idx_inventory_reserved')
      .using(
        'btree',
        table.branchId.asc().nullsLast().op('int8_ops'),
        table.productVariantId.asc().nullsLast().op('int8_ops'),
      )
      .where(sql`(reserved_stock > 0)`),
    index('idx_inventory_stock').using(
      'btree',
      table.stock.asc().nullsLast().op('int4_ops'),
    ),
    uniqueIndex('idx_inventory_unique').using(
      'btree',
      table.productVariantId.asc().nullsLast().op('int8_ops'),
      table.branchId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'inventory_branch_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.productVariantId],
      foreignColumns: [productVariants.id],
      name: 'inventory_product_variant_id_fkey',
    }).onDelete('restrict'),
    check('inventory_check', sql`reserved_stock <= stock`),
    check('inventory_check1', sql`target_stock >= reorder_point`),
    check('inventory_check2', sql`maximum_stock >= minimum_stock`),
    check('inventory_minimum_stock_check', sql`minimum_stock >= 0`),
    check('inventory_reorder_point_check', sql`reorder_point >= 0`),
    check('inventory_reserved_stock_check', sql`reserved_stock >= 0`),
    check('inventory_stock_check', sql`stock >= 0`),
  ],
);

export const branchProducts = pgTable(
  'branch_products',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    isAvailable: boolean('is_available').default(true).notNull(),
    isPublic: boolean('is_public').default(true).notNull(),
    position: integer().default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_branch_products_branch').using(
      'btree',
      table.branchId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_branch_products_product').using(
      'btree',
      table.productId.asc().nullsLast().op('int8_ops'),
    ),
    uniqueIndex('branch_products_branch_product_uq').on(
      table.branchId,
      table.productId,
    ),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'branch_products_branch_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'branch_products_product_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    inventoryId: bigint('inventory_id', { mode: 'number' }).notNull(),
    movementType: inventoryMovementTypeEnum('movement_type').notNull(),
    quantity: integer().notNull(),
    referenceType: inventoryReferenceEnum('reference_type').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    performedBy: bigint('performed_by', { mode: 'number' }).notNull(),
    previousStock: integer('previous_stock').notNull(),
    newStock: integer('new_stock').notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }),
    externalReference: varchar('external_reference', { length: 100 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    referenceId: bigint('reference_id', { mode: 'number' }),
    reason: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_inventory_movements_created').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_inventory_movements_inventory').using(
      'btree',
      table.inventoryId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_inventory_movements_reference').using(
      'btree',
      table.referenceType.asc().nullsLast().op('enum_ops'),
      table.referenceId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_inventory_movements_type').using(
      'btree',
      table.movementType.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.inventoryId],
      foreignColumns: [inventory.id],
      name: 'inventory_movements_inventory_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.performedBy],
      foreignColumns: [users.id],
      name: 'inventory_movements_performed_by_fkey',
    }),
  ],
);

export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    inventoryId: bigint('inventory_id', { mode: 'number' }).notNull(),
    referenceType: reservationReferenceEnum('reference_type').default('CART'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    referenceId: bigint('reference_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    createdBy: bigint('created_by', { mode: 'number' }),
    quantity: integer().notNull(),
    releasedQuantity: integer('released_quantity').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' })
      .default(sql`(now() + '00:15:00'::interval)`)
      .notNull(),
    releasedAt: timestamp('released_at', {
      withTimezone: true,
      mode: 'string',
    }),
    status: reservationStatusEnum().default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_inventory_reservation_expiration').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_inventory_reservation_inventory').using(
      'btree',
      table.inventoryId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_inventory_reservation_reference').using(
      'btree',
      table.referenceType.asc().nullsLast().op('enum_ops'),
      table.referenceId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_inventory_reservation_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    index('idx_inventory_reservations_cleanup')
      .using(
        'btree',
        table.status.asc().nullsLast().op('enum_ops'),
        table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
      )
      .where(sql`(status = 'active'::reservation_status_enum)`),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'inventory_reservations_created_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.inventoryId],
      foreignColumns: [inventory.id],
      name: 'inventory_reservations_inventory_id_fkey',
    }).onDelete('restrict'),
    check(
      'inventory_reservations_check',
      sql`(released_quantity >= 0) AND (released_quantity <= quantity)`,
    ),
    check('inventory_reservations_quantity_check', sql`quantity > 0`),
  ],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    code: varchar({ length: 30 }),
    legalName: varchar('legal_name', { length: 200 }).notNull(),
    taxId: varchar('tax_id', { length: 50 }),
    contactName: varchar('contact_name', { length: 100 }),
    email: varchar({ length: 255 }),
    phone: varchar({ length: 50 }),
    address: text(),
    city: varchar({ length: 100 }),
    country: varchar({ length: 100 }),
    website: varchar({ length: 255 }),
    paymentTermsDays: integer('payment_terms_days'),
    currencyCode: char('currency_code', { length: 3 }),
    notes: text(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_suppliers_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    unique('suppliers_code_key').on(table.code),
    unique('suppliers_tax_id_key').on(table.taxId),
    check('suppliers_payment_terms_days_check', sql`payment_terms_days >= 0`),
  ],
);

export const supplierProducts = pgTable(
  'supplier_products',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    supplierId: bigint('supplier_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productVariantId: bigint('product_variant_id', {
      mode: 'number',
    }).notNull(),
    supplierSku: varchar('supplier_sku', { length: 100 }),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),
    leadTimeDays: integer('lead_time_days').default(0),
    isPreferred: boolean('is_preferred').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_supplier_products_preferred').using(
      'btree',
      table.isPreferred.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_supplier_products_supplier').using(
      'btree',
      table.supplierId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_supplier_products_variant').using(
      'btree',
      table.productVariantId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.productVariantId],
      foreignColumns: [productVariants.id],
      name: 'supplier_products_product_variant_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.supplierId],
      foreignColumns: [suppliers.id],
      name: 'supplier_products_supplier_id_fkey',
    }).onDelete('restrict'),
    unique('supplier_products_supplier_id_product_variant_id_key').on(
      table.supplierId,
      table.productVariantId,
    ),
    check('supplier_products_lead_time_days_check', sql`lead_time_days >= 0`),
    check(
      'supplier_products_purchase_price_check',
      sql`purchase_price >= (0)::numeric`,
    ),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    email: text('email').notNull(),
    passwordHash: varchar('password_hash', { length: 255 }), // 🟢 NULLABLE
    documentNumber: varchar('document_number', { length: 50 }),
    documentType: varchar('document_type', { length: 20 }),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    phone: varchar({ length: 50 }),
    birthDate: date('birth_date'),
    gender: varchar({ length: 20 }),
    customerType: customerTypeEnum('customer_type')
      .default('registered')
      .notNull(),
    preferredLanguage: varchar('preferred_language', { length: 10 }).default(
      'es',
    ),
    acceptsMarketing: boolean('accepts_marketing').default(false).notNull(),
    acceptsTermsAt: timestamp('accepts_terms_at', {
      withTimezone: true,
      mode: 'string',
    }),
    isVerified: boolean('is_verified').default(false).notNull(),
    lastActivityAt: timestamp('last_activity_at', {
      withTimezone: true,
      mode: 'string',
    }),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'string',
    }),
    isActive: boolean('is_active').default(true).notNull(),

    // 🟢 NUEVAS COLUMNAS PARA OAUTH
    provider: varchar('provider', { length: 50 }), // 'google' | 'facebook' | 'local'
    providerId: varchar('provider_id', { length: 255 }),
    avatarUrl: text('avatar_url'),
    emailVerified: boolean('email_verified').default(false),

    // Token push del dispositivo (FCM) — lo registra la app del cliente.
    pushToken: text('push_token'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_customers_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_customers_last_activity').using(
      'btree',
      table.lastActivityAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    // 🟢 ÍNDICES PARA OAUTH
    index('idx_customers_provider').using(
      'btree',
      table.provider.asc().nullsLast().op('text_ops'),
    ),
    index('idx_customers_provider_id').using(
      'btree',
      table.providerId.asc().nullsLast().op('text_ops'),
    ),
    // 🟢 ÍNDICE COMPUESTO PARA BÚSQUEDAS RÁPIDAS POR (PROVIDER + PROVIDER_ID)
    uniqueIndex('idx_customers_provider_unique')
      .using(
        'btree',
        table.provider.asc().nullsLast().op('text_ops'),
        table.providerId.asc().nullsLast().op('text_ops'),
      )
      .where(sql`provider_id IS NOT NULL`), // solo si tiene providerId

    unique('customers_email_key').on(table.email),
  ],
);

export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerId: bigint('customer_id', { mode: 'number' }).notNull(),
    alias: varchar({ length: 50 }),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    city: varchar({ length: 100 }).notNull(),
    state: varchar({ length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar({ length: 100 }).default('Colombia').notNull(),
    deliveryInstructions: text('delivery_instructions'),
    // TODO: failed to parse database type 'text'
    location: text('location'),
    reference: text(),
    isDefault: boolean('is_default').default(false).notNull(),
    labelColor: varchar('label_color', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_customer_addresses_default').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
      table.isDefault.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_customer_addresses_location').using(
      'btree',
      table.location.asc().nullsLast().op('text_ops'),
    ),
    uniqueIndex('idx_customer_default_address')
      .using('btree', table.customerId.asc().nullsLast().op('int8_ops'))
      .where(sql`(is_default = true)`),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'customer_addresses_customer_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const customerSessions = pgTable(
  'customer_sessions',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerId: bigint('customer_id', { mode: 'number' }).notNull(),
    sessionToken: uuid('session_token')
      .default(sql`uuid_generate_v4()`)
      .notNull(),
    ipAddress: inet('ip_address'),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    deviceName: varchar('device_name', { length: 100 }),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' })
      .default(sql`(now() + '30 days'::interval)`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_customer_sessions_customer').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_customer_sessions_expiration').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'customer_sessions_customer_id_fkey',
    }).onDelete('cascade'),
    unique('customer_sessions_session_token_key').on(table.sessionToken),
  ],
);

export const guestSessions = pgTable(
  'guest_sessions',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    convertedCustomerId: bigint('converted_customer_id', { mode: 'number' }),
    sessionToken: uuid('session_token')
      .default(sql`uuid_generate_v4()`)
      .notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    lastActivityAt: timestamp('last_activity_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' })
      .default(sql`(now() + '30 days'::interval)`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_guest_sessions_expiration').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_guest_sessions_last_activity').using(
      'btree',
      table.lastActivityAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.convertedCustomerId],
      foreignColumns: [customers.id],
      name: 'guest_sessions_converted_customer_id_fkey',
    }).onDelete('set null'),
    unique('guest_sessions_session_token_key').on(table.sessionToken),
  ],
);

export const customerTokens = pgTable(
  'customer_tokens',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerId: bigint('customer_id', { mode: 'number' }).notNull(),
    token: uuid()
      .default(sql`uuid_generate_v4()`)
      .notNull(),
    purpose: customerTokenPurposeEnum().notNull(),
    consumedIp: inet('consumed_ip'),
    createdIp: inet('created_ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' })
      .default(sql`(now() + '01:00:00'::interval)`)
      .notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_customer_tokens_customer').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_customer_tokens_expiration').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_customer_tokens_purpose').using(
      'btree',
      table.purpose.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'customer_tokens_customer_id_fkey',
    }).onDelete('cascade'),
    unique('customer_tokens_token_key').on(table.token),
  ],
);

export const customerRefreshTokens = pgTable(
  'customer_refresh_tokens',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    revoked: boolean().default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_customer_refresh_tokens_customer').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_customer_refresh_tokens_token').using(
      'btree',
      table.token.asc().nullsLast().op('text_ops'),
    ),
    index('idx_customer_refresh_tokens_expires').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
  ],
);

export const carts = pgTable(
  'carts',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    couponId: bigint('coupon_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerId: bigint('customer_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    guestSessionId: bigint('guest_session_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    deliveryZoneId: bigint('delivery_zone_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerAddressId: bigint('customer_address_id', { mode: 'number' }),
    lastActivityAt: timestamp('last_activity_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' })
      .default(sql`(now() + '7 days'::interval)`)
      .notNull(),
    status: cartStatusEnum().default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_carts_customer').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_carts_guest').using(
      'btree',
      table.guestSessionId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_carts_last_activity').using(
      'btree',
      table.lastActivityAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_carts_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    uniqueIndex('idx_unique_active_customer_cart')
      .using('btree', table.customerId.asc().nullsLast().op('int8_ops'))
      .where(sql`(status = 'ACTIVE'::cart_status_enum)`),
    uniqueIndex('idx_unique_active_guest_cart')
      .using('btree', table.guestSessionId.asc().nullsLast().op('int8_ops'))
      .where(sql`(status = 'ACTIVE'::cart_status_enum)`),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'carts_branch_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.customerAddressId],
      foreignColumns: [customerAddresses.id],
      name: 'carts_customer_address_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'carts_customer_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.deliveryZoneId],
      foreignColumns: [deliveryZones.id],
      name: 'carts_delivery_zone_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.guestSessionId],
      foreignColumns: [guestSessions.id],
      name: 'carts_guest_session_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.couponId],
      foreignColumns: [coupons.id],
      name: 'fk_carts_coupon_id',
    }).onDelete('set null'),
    check(
      'cart_owner_check',
      sql`((customer_id IS NOT NULL) AND (guest_session_id IS NULL)) OR ((customer_id IS NULL) AND (guest_session_id IS NOT NULL))`,
    ),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    cartId: bigint('cart_id', { mode: 'number' }).notNull(),
    subtotal: numeric({ precision: 12, scale: 2 }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productVariantId: bigint('product_variant_id', {
      mode: 'number',
    }).notNull(),
    quantity: integer().notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    metadata: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idx_cart_item_unique').using(
      'btree',
      table.cartId.asc().nullsLast().op('int8_ops'),
      table.productVariantId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_cart_items_cart').using(
      'btree',
      table.cartId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_cart_items_variant').using(
      'btree',
      table.productVariantId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.cartId],
      foreignColumns: [carts.id],
      name: 'cart_items_cart_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productVariantId],
      foreignColumns: [productVariants.id],
      name: 'cart_items_product_variant_id_fkey',
    }).onDelete('restrict'),
    check(
      'cart_items_discount_amount_check',
      sql`discount_amount >= (0)::numeric`,
    ),
    check('cart_items_quantity_check', sql`quantity > 0`),
    check('cart_items_subtotal_check', sql`subtotal >= (0)::numeric`),
    check('cart_items_tax_amount_check', sql`tax_amount >= (0)::numeric`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    referenceCode: varchar('reference_code', { length: 20 }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerId: bigint('customer_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    guestSessionId: bigint('guest_session_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    deliveryZoneId: bigint('delivery_zone_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerAddressId: bigint('customer_address_id', { mode: 'number' }),
    status: orderStatusEnum().default('created').notNull(),
    currencyCode: varchar('currency_code', { length: 3 })
      .default('COP')
      .notNull(),
    exchangeRate: numeric('exchange_rate', { precision: 12, scale: 6 }).default(
      '1.0',
    ),
    subtotal: numeric({ precision: 12, scale: 2 }).default('0').notNull(),
    discountTotal: numeric('discount_total', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    shippingCost: numeric('shipping_cost', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    shippingTax: numeric('shipping_tax', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    grandTotal: numeric('grand_total', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    // Datos del cliente al momento de la compra (para pedidos de invitados)
    customerName: varchar('customer_name', { length: 150 }),
    customerPhone: varchar('customer_phone', { length: 30 }),
    customerEmail: varchar('customer_email', { length: 255 }),
    customerIp: inet('customer_ip'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    couponId: bigint('coupon_id', { mode: 'number' }),
    userAgent: text('user_agent'),
    notes: text(),
    internalNotes: text('internal_notes'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }),
    // Picker (usuario de picking) que alista el pedido
    pickerId: bigint('picker_id', { mode: 'number' }),
    pickedAt: timestamp('picked_at', { withTimezone: true, mode: 'string' }),
    // Cuándo terminó el alistamiento (para medir la duración por pedido)
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_orders_branch').using(
      'btree',
      table.branchId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_orders_customer').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_orders_customer_status').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    index('idx_orders_reference_code').using(
      'btree',
      table.referenceCode.asc().nullsLast().op('text_ops'),
    ),
    index('idx_orders_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    index('idx_orders_status_created').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.couponId],
      foreignColumns: [coupons.id],
      name: 'fk_order_coupon_id',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'orders_branch_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.customerAddressId],
      foreignColumns: [customerAddresses.id],
      name: 'orders_customer_address_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'orders_customer_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.deliveryZoneId],
      foreignColumns: [deliveryZones.id],
      name: 'orders_delivery_zone_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.guestSessionId],
      foreignColumns: [guestSessions.id],
      name: 'orders_guest_session_id_fkey',
    }).onDelete('restrict'),
    unique('orders_reference_code_key').on(table.referenceCode),
    check('orders_discount_total_check', sql`discount_total >= (0)::numeric`),
    check('orders_exchange_rate_check', sql`exchange_rate > (0)::numeric`),
    check('orders_grand_total_check', sql`grand_total >= (0)::numeric`),
    check('orders_shipping_cost_check', sql`shipping_cost >= (0)::numeric`),
    check('orders_shipping_tax_check', sql`shipping_tax >= (0)::numeric`),
    check('orders_subtotal_check', sql`subtotal >= (0)::numeric`),
    check('orders_tax_total_check', sql`tax_total >= (0)::numeric`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    taxName: varchar('tax_name', { length: 100 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    orderId: bigint('order_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productVariantId: bigint('product_variant_id', { mode: 'number' }),
    productName: varchar('product_name', { length: 255 }).notNull(),
    variantSku: varchar('variant_sku', { length: 100 }),
    quantity: integer().notNull(),
    // Unidades ya alistadas por el picking (escaneadas/recogidas)
    pickedQty: integer('picked_qty').default(0).notNull(),
    unitPriceNet: numeric('unit_price_net', {
      precision: 12,
      scale: 2,
    }).notNull(),
    unitPriceGross: numeric('unit_price_gross', {
      precision: 12,
      scale: 2,
    }).notNull(),
    discountAmount: numeric('discount_amount', {
      precision: 12,
      scale: 2,
    }).default('0'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).default('0'),
    subtotal: numeric({ precision: 12, scale: 2 }).notNull(),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).default('0'),
    total: numeric({ precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'order_items_order_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productVariantId],
      foreignColumns: [productVariants.id],
      name: 'order_items_product_variant_id_fkey',
    }).onDelete('restrict'),
    check('order_items_check', sql`unit_price_gross >= unit_price_net`),
    check(
      'order_items_discount_amount_check',
      sql`discount_amount >= (0)::numeric`,
    ),
    check('order_items_quantity_check', sql`quantity > 0`),
    check('order_items_subtotal_check', sql`subtotal >= (0)::numeric`),
    check('order_items_tax_amount_check', sql`tax_amount >= (0)::numeric`),
    check(
      'order_items_unit_price_net_check',
      sql`unit_price_net >= (0)::numeric`,
    ),
  ],
);

// ── Picking: estanterías, filas y ubicación de productos ──────────────────────

export const shelves = pgTable(
  'shelves',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }).notNull(),
    code: varchar({ length: 20 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    type: varchar({ length: 10 }).default('center').notNull(), // 'wall' | 'center'
    color: varchar({ length: 20 }).default('#F59E0B').notNull(),
    // Dimensiones del rectángulo de la estantería en el mapa (celdas de la rejilla)
    width: integer().default(3).notNull(),
    height: integer().default(4).notNull(),
    posX: integer('pos_x').default(0).notNull(),
    posY: integer('pos_y').default(0).notNull(),
    rotation: integer().default(0).notNull(), // 0 | 90
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'shelves_branch_id_fkey',
    }).onDelete('cascade'),
  ],
);

// Categorías de cada estantería (N:M): una estantería agrupa varias categorías.
export const shelfCategories = pgTable(
  'shelf_categories',
  {
    shelfId: bigint('shelf_id', { mode: 'number' }).notNull(),
    categoryId: bigint('category_id', { mode: 'number' }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.shelfId, table.categoryId],
      name: 'shelf_categories_pkey',
    }),
    foreignKey({
      columns: [table.shelfId],
      foreignColumns: [shelves.id],
      name: 'shelf_categories_shelf_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: 'shelf_categories_category_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const productLocations = pgTable(
  'product_locations',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productVariantId: bigint('product_variant_id', {
      mode: 'number',
    }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    shelfId: bigint('shelf_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productVariantId],
      foreignColumns: [productVariants.id],
      name: 'product_locations_product_variant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'product_locations_branch_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.shelfId],
      foreignColumns: [shelves.id],
      name: 'product_locations_shelf_id_fkey',
    }).onDelete('cascade'),
    // Un producto solo tiene UNA ubicación por sucursal (upsert por variante+sucursal)
    uniqueIndex('product_locations_variant_branch_uq').on(
      table.productVariantId,
      table.branchId,
    ),
  ],
);

export const deliveryTimeSlots = pgTable(
  'delivery_time_slots',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }).notNull(),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    maxOrders: integer('max_orders').default(10),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_delivery_slot_branch').using(
      'btree',
      table.branchId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'delivery_time_slots_branch_id_fkey',
    }).onDelete('cascade'),
    check('delivery_time_slots_check', sql`end_time > start_time`),
    check(
      'delivery_time_slots_day_of_week_check',
      sql`(day_of_week >= 0) AND (day_of_week <= 6)`,
    ),
  ],
);

export const shipments = pgTable(
  'shipments',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    orderId: bigint('order_id', { mode: 'number' }).notNull(),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    city: varchar({ length: 100 }).notNull(),
    postalCode: varchar('postal_code', { length: 20 }),
    // TODO: failed to parse database type 'text'
    location: text('location'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    deliveryTimeSlotId: bigint('delivery_time_slot_id', { mode: 'number' }),
    scheduledDate: date('scheduled_date'),
    carrierName: varchar('carrier_name', { length: 100 }),
    trackingNumber: varchar('tracking_number', { length: 100 }),
    trackingUrl: text('tracking_url'),
    carrierReference: varchar('carrier_reference', { length: 100 }),
    estimatedDeliveryAt: timestamp('estimated_delivery_at', {
      withTimezone: true,
      mode: 'string',
    }),
    deliveredAt: timestamp('delivered_at', {
      withTimezone: true,
      mode: 'string',
    }),
    recipientName: varchar('recipient_name', { length: 200 }),
    recipientPhone: varchar('recipient_phone', { length: 50 }),
    // Snapshot del volumen del pedido en cm³ (NULL = aún no calculado).
    totalVolumeCm3: integer('total_volume_cm3'),
    // true si algún ítem no tenía dimensiones y se usó el volumen de respaldo.
    volumeEstimated: boolean('volume_estimated').default(false).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    shippingTaxRateId: bigint('shipping_tax_rate_id', { mode: 'number' }),
    shippingTaxAmount: numeric('shipping_tax_amount', {
      precision: 12,
      scale: 2,
    }).default('0'),
    status: shipmentStatusEnum().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_shipments_location').using(
      'btree',
      table.location.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.deliveryTimeSlotId],
      foreignColumns: [deliveryTimeSlots.id],
      name: 'shipments_delivery_time_slot_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'shipments_order_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.shippingTaxRateId],
      foreignColumns: [taxRates.id],
      name: 'shipments_shipping_tax_rate_id_fkey',
    }).onDelete('restrict'),
    unique('shipments_order_id_key').on(table.orderId),
    check(
      'shipments_shipping_tax_amount_check',
      sql`shipping_tax_amount >= (0)::numeric`,
    ),
    check(
      'shipments_total_volume_cm3_check',
      sql`(total_volume_cm3 IS NULL) OR (total_volume_cm3 >= 0)`,
    ),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    orderId: bigint('order_id', { mode: 'number' }).notNull(),
    status: orderStatusEnum().notNull(),
    note: text(),
    oldStatus: orderStatusEnum('old_status'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    createdBy: bigint('created_by', { mode: 'number' }),
    // Picker (usuario de picking) que realizó la transición
    pickerId: bigint('picker_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_order_status_history_order').using(
      'btree',
      table.orderId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [customers.id],
      name: 'order_status_history_created_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.pickerId],
      foreignColumns: [users.id],
      name: 'order_status_history_picker_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'order_status_history_order_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    orderId: bigint('order_id', { mode: 'number' }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    status: paymentIntentStatusEnum().default('created').notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: varchar({ length: 3 }).default('COP').notNull(),
    providerTransactionId: varchar('provider_transaction_id', { length: 255 }),
    providerResponse: jsonb('provider_response'),
    idempotencyKey: varchar('idempotency_key', { length: 100 }),
    customerIp: inet('customer_ip'),
    providerName: varchar('provider_name', { length: 100 }),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_payment_intents_gateway')
      .using(
        'btree',
        table.providerTransactionId.asc().nullsLast().op('text_ops'),
      )
      .where(sql`(provider_transaction_id IS NOT NULL)`),
    index('idx_payment_intents_order_status')
      .using(
        'btree',
        table.orderId.asc().nullsLast().op('int8_ops'),
        table.status.asc().nullsLast().op('enum_ops'),
      )
      .where(
        sql`(status = ANY (ARRAY['pending'::payment_intent_status_enum, 'created'::payment_intent_status_enum]))`,
      ),
    index('idx_payment_intents_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'payment_intents_order_id_fkey',
    }).onDelete('cascade'),
    unique('payment_intents_order_id_key').on(table.orderId),
    unique('payment_intents_idempotency_key_key').on(table.idempotencyKey),
    check('payment_intents_amount_check', sql`amount > (0)::numeric`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    orderId: bigint('order_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    paymentIntentId: bigint('payment_intent_id', { mode: 'number' }),
    providerTransactionId: varchar('provider_transaction_id', {
      length: 255,
    }).notNull(),
    providerName: varchar('provider_name', { length: 100 }),
    authorizationCode: varchar('authorization_code', { length: 100 }),
    providerResponse: jsonb('provider_response'),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    currency: varchar({ length: 3 }).default('COP').notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    installments: integer().default(1),
    status: paymentStatusEnum().default('PENDING'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_payments_order').using(
      'btree',
      table.orderId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_payments_payment_intent').using(
      'btree',
      table.paymentIntentId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'payments_order_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.paymentIntentId],
      foreignColumns: [paymentIntents.id],
      name: 'payments_payment_intent_id_fkey',
    }).onDelete('restrict'),
    unique('payments_provider_transaction_id_key').on(
      table.providerTransactionId,
    ),
    check('payments_amount_check', sql`amount > (0)::numeric`),
  ],
);

export const refunds = pgTable(
  'refunds',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    paymentId: bigint('payment_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    orderId: bigint('order_id', { mode: 'number' }).notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    reason: text(),
    providerResponse: jsonb('provider_response'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    processedBy: bigint('processed_by', { mode: 'number' }),
    status: refundStatusEnum().default('pending').notNull(),
    providerRefundId: varchar('provider_refund_id', { length: 255 }),
    processedAt: timestamp('processed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_refunds_payment').using(
      'btree',
      table.paymentId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'refunds_order_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.paymentId],
      foreignColumns: [payments.id],
      name: 'refunds_payment_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.processedBy],
      foreignColumns: [users.id],
      name: 'refunds_processed_by_fkey',
    }),
    check('refunds_amount_check', sql`amount > (0)::numeric`),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    orderId: bigint('order_id', { mode: 'number' }).notNull(),
    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }),
    providerName: varchar('provider_name', { length: 100 }),
    providerInvoiceId: varchar('provider_invoice_id', { length: 100 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    xmlMediaId: bigint('xml_media_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    pdfMediaId: bigint('pdf_media_id', { mode: 'number' }),
    cufeCode: varchar('cufe_code', { length: 100 }),
    status: invoiceStatusEnum().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'invoices_order_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.pdfMediaId],
      foreignColumns: [media.id],
      name: 'invoices_pdf_media_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.xmlMediaId],
      foreignColumns: [media.id],
      name: 'invoices_xml_media_id_fkey',
    }).onDelete('set null'),
    unique('invoices_order_id_key').on(table.orderId),
    unique('invoices_invoice_number_key').on(table.invoiceNumber),
  ],
);

export const deliveryDrivers = pgTable(
  'delivery_drivers',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    fullName: varchar('full_name', { length: 100 }).notNull(),
    phone: varchar({ length: 50 }).notNull(),
    // TODO: failed to parse database type 'citext'
    email: text('email'),
    // Cuenta de acceso (users) vinculada al repartidor.
    authUserId: bigint('auth_user_id', { mode: 'number' }),
    vehicleType: varchar('vehicle_type', { length: 50 }),
    vehiclePlate: varchar('vehicle_plate', { length: 20 }),
    vehicleBrand: varchar('vehicle_brand', { length: 100 }),
    vehicleModel: varchar('vehicle_model', { length: 100 }),
    vehicleColor: varchar('vehicle_color', { length: 50 }),
    // Color con el que se pinta la ruta del repartidor en el mapa de flota.
    routeColor: varchar('route_color', { length: 9 }),
    // Capacidad de carga del vehículo en cm³ (NULL = sin capacidad declarada).
    cargoVolumeCm3: integer('cargo_volume_cm3'),
    isAvailable: boolean('is_available').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // Token push del dispositivo (FCM/expo) — se registra desde la app.
    pushToken: text('push_token'),
    // Foto de perfil (URL pública de Cloudinary) — se sube desde la app.
    avatarUrl: text('avatar_url'),
    // TODO: failed to parse database type 'text'
    currentLocation: text('current_location'),
    lastLocationAt: timestamp('last_location_at', {
      withTimezone: true,
      mode: 'string',
    }),
    // Última señal de la app (heartbeat o ping GPS). Distingue "conectado pero
    // sin pedido" de "app cerrada": los pings GPS solo llegan durante una
    // entrega activa, el heartbeat mientras hay sesión iniciada.
    lastSeenAt: timestamp('last_seen_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_delivery_drivers_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_delivery_drivers_available').using(
      'btree',
      table.isAvailable.asc().nullsLast().op('bool_ops'),
    ),
    check(
      'delivery_drivers_cargo_volume_cm3_check',
      sql`(cargo_volume_cm3 IS NULL) OR (cargo_volume_cm3 > 0)`,
    ),
  ],
);

export const deliveryDriverLocations = pgTable(
  'delivery_driver_locations',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    driverId: bigint('driver_id', { mode: 'number' }).notNull(),
    // TODO: failed to parse database type 'text'
    location: text('location').notNull(),
    speedKmh: numeric('speed_kmh', { precision: 5, scale: 2 }),
    headingDegrees: integer('heading_degrees'),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_delivery_driver_locations_location').using(
      'btree',
      table.location.asc().nullsLast().op('text_ops'),
    ),
    index('idx_driver_locations_driver').using(
      'btree',
      table.driverId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_driver_locations_latest').using(
      'btree',
      table.driverId.asc().nullsLast().op('int8_ops'),
      table.recordedAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    index('idx_driver_locations_recorded').using(
      'btree',
      table.recordedAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.driverId],
      foreignColumns: [deliveryDrivers.id],
      name: 'delivery_driver_locations_driver_id_fkey',
    }).onDelete('cascade'),
    check(
      'delivery_driver_locations_heading_degrees_check',
      sql`(heading_degrees >= 0) AND (heading_degrees <= 359)`,
    ),
    check(
      'delivery_driver_locations_speed_kmh_check',
      sql`speed_kmh >= (0)::numeric`,
    ),
  ],
);

export const deliveryAssignments = pgTable(
  'delivery_assignments',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    shipmentId: bigint('shipment_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    driverId: bigint('driver_id', { mode: 'number' }).notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    acceptedAt: timestamp('accepted_at', {
      withTimezone: true,
      mode: 'string',
    }),
    readyForPickupAt: timestamp('ready_for_pickup_at', {
      withTimezone: true,
      mode: 'string',
    }),
    estimatedArrival: timestamp('estimated_arrival', {
      withTimezone: true,
      mode: 'string',
    }),
    pickedUpAt: timestamp('picked_up_at', {
      withTimezone: true,
      mode: 'string',
    }),
    inDeliveryAt: timestamp('in_delivery_at', {
      withTimezone: true,
      mode: 'string',
    }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    rejectedAt: timestamp('rejected_at', {
      withTimezone: true,
      mode: 'string',
    }),
    failedAt: timestamp('failed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
      mode: 'string',
    }),
    cancelReason: text('cancel_reason'),
    rejectReason: text('reject_reason'),
    deliveryNote: text('delivery_note'),
    status: deliveryAssignmentStatusEnum().default('ASSIGNED').notNull(),
  },
  (table) => [
    index('idx_delivery_assignment_driver').using(
      'btree',
      table.driverId.asc().nullsLast().op('int8_ops'),
    ),
    uniqueIndex('idx_delivery_assignment_shipment_driver').using(
      'btree',
      table.shipmentId.asc().nullsLast().op('int8_ops'),
      table.driverId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_delivery_assignment_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    uniqueIndex('idx_driver_active_delivery')
      .using('btree', table.driverId.asc().nullsLast().op('int8_ops'))
      .where(
        sql`(status = ANY (ARRAY['PICKED_UP'::delivery_assignment_status_enum, 'IN_DELIVERY'::delivery_assignment_status_enum]))`,
      ),
    foreignKey({
      columns: [table.driverId],
      foreignColumns: [deliveryDrivers.id],
      name: 'delivery_assignments_driver_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.shipmentId],
      foreignColumns: [shipments.id],
      name: 'delivery_assignments_shipment_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const deliveryEvents = pgTable(
  'delivery_events',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    assignmentId: bigint('assignment_id', { mode: 'number' }).notNull(),
    eventType: deliveryEventTypeEnum('event_type').notNull(),
    // TODO: failed to parse database type 'text'
    location: text('location'),
    description: text(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    createdBy: bigint('created_by', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_delivery_events_assignment').using(
      'btree',
      table.assignmentId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_delivery_events_created').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_delivery_events_type').using(
      'btree',
      table.eventType.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.assignmentId],
      foreignColumns: [deliveryAssignments.id],
      name: 'delivery_events_assignment_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [customers.id],
      name: 'delivery_events_created_by_fkey',
    }),
  ],
);

export const deliveryProofMedia = pgTable(
  'delivery_proof_media',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    assignmentId: bigint('assignment_id', { mode: 'number' }).notNull(),
    kind: deliveryProofKindEnum('kind').notNull(),
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_delivery_proof_assignment').using(
      'btree',
      table.assignmentId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.assignmentId],
      foreignColumns: [deliveryAssignments.id],
      name: 'delivery_proof_media_assignment_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const promotions = pgTable(
  'promotions',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: text(),
    isAutoApply: boolean('is_auto_apply').default(false).notNull(),
    requiresCode: boolean('requires_code').default(false).notNull(),
    priority: integer().default(0),
    stackable: boolean().default(false).notNull(),
    exclusive: boolean().default(false).notNull(),
    usageLimit: integer('usage_limit'),
    timesUsed: integer('times_used').default(0).notNull(),
    startDate: timestamp('start_date', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    endDate: timestamp('end_date', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    createdBy: bigint('created_by', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_promotions_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_promotions_dates').using(
      'btree',
      table.startDate.asc().nullsLast().op('timestamptz_ops'),
      table.endDate.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_promotions_priority').using(
      'btree',
      table.priority.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'promotions_created_by_fkey',
    }),
    check('promotion_dates_check', sql`end_date > start_date`),
  ],
);

export const promotionConditions = pgTable(
  'promotion_conditions',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    promotionId: bigint('promotion_id', { mode: 'number' }).notNull(),
    conditionType: promotionConditionTypeEnum('condition_type').notNull(),
    operator: promotionOperatorEnum().notNull(),
    value: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_promotion_conditions_promotion').using(
      'btree',
      table.promotionId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.promotionId],
      foreignColumns: [promotions.id],
      name: 'promotion_conditions_promotion_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const coupons = pgTable(
  'coupons',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    promotionId: bigint('promotion_id', { mode: 'number' }).notNull(),
    code: varchar({ length: 50 }).notNull(),
    maxUsesTotal: integer('max_uses_total').default(1),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'string' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    timesUsed: integer('times_used').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    maxUsesPerCustomer: integer('max_uses_per_customer').default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_coupon_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_coupon_code').using(
      'btree',
      table.code.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.promotionId],
      foreignColumns: [promotions.id],
      name: 'coupons_promotion_id_fkey',
    }).onDelete('cascade'),
    unique('coupons_code_key').on(table.code),
  ],
);

export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }),
    ipAddress: inet('ip_address'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    guestSessionId: bigint('guest_session_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    couponId: bigint('coupon_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerId: bigint('customer_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    orderId: bigint('order_id', { mode: 'number' }),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_coupon_redemption_coupon').using(
      'btree',
      table.couponId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_coupon_redemption_customer').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_coupon_redemption_order').using(
      'btree',
      table.orderId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.couponId],
      foreignColumns: [coupons.id],
      name: 'coupon_redemptions_coupon_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'coupon_redemptions_customer_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.guestSessionId],
      foreignColumns: [guestSessions.id],
      name: 'coupon_redemptions_guest_session_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'coupon_redemptions_order_id_fkey',
    }).onDelete('set null'),
    check(
      'coupon_redemptions_discount_amount_check',
      sql`discount_amount >= (0)::numeric`,
    ),
  ],
);

export const menus = pgTable(
  'menus',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    location: menuLocationEnum(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique('menus_location_key').on(table.location)],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    menuId: bigint('menu_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    parentId: bigint('parent_id', { mode: 'number' }),
    title: varchar({ length: 100 }).notNull(),
    linkUrl: text('link_url').notNull(),
    icon: varchar({ length: 100 }),
    cssClass: varchar('css_class', { length: 100 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    pageId: bigint('page_id', { mode: 'number' }),
    target: varchar({ length: 20 }).default('_self'),
    position: integer().default(0),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_menu_items_menu').using(
      'btree',
      table.menuId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_menu_items_parent').using(
      'btree',
      table.parentId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_menu_items_position').using(
      'btree',
      table.menuId.asc().nullsLast().op('int8_ops'),
      table.position.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.menuId],
      foreignColumns: [menus.id],
      name: 'menu_items_menu_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.pageId],
      foreignColumns: [pages.id],
      name: 'menu_items_page_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: 'menu_items_parent_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const savedFilters = pgTable(
  'saved_filters',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: text(),
    categoryIds: jsonb('category_ids').default('[]').notNull(),
    productIds: jsonb('product_ids').default('[]').notNull(),
    brandId: bigint('brand_id', { mode: 'number' }),
    productTypeCode: varchar('product_type_code', { length: 50 }),
    onSale: boolean('on_sale').default(false),
    search: varchar({ length: 200 }),
    sort: varchar({ length: 50 }),
    priceMin: integer('price_min'),
    priceMax: integer('price_max'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_saved_filters_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
  ],
);

export const banners = pgTable(
  'banners',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    title: varchar({ length: 100 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    mediaId: bigint('media_id', { mode: 'number' }).notNull(),
    linkUrl: text('link_url'),
    linkTarget: varchar('link_target', { length: 20 })
      .default('_self')
      .notNull(),
    altText: varchar('alt_text', { length: 255 }),
    description: text(),
    subtitle: text(),
    ctaText: varchar('cta_text', { length: 100 }),
    bgColor: varchar('bg_color', { length: 20 }),
    accentColor: varchar('accent_color', { length: 20 }),
    bannerType: varchar('banner_type', { length: 20 }).default('promo').notNull(),
    position: integer().default(0),
    isActive: boolean('is_active').default(true).notNull(),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'string' }),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'string' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    mobileImageId: bigint('mobile_image_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    filterId: bigint('filter_id', { mode: 'number' }),
    clicks: integer().default(0).notNull(),
    views: integer().default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_banners_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_banners_dates').using(
      'btree',
      table.startDate.asc().nullsLast().op('timestamptz_ops'),
      table.endDate.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_banners_position').using(
      'btree',
      table.position.asc().nullsLast().op('int4_ops'),
    ),
    index('idx_banners_type').using(
      'btree',
      table.bannerType.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.mediaId],
      foreignColumns: [media.id],
      name: 'banners_media_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.mobileImageId],
      foreignColumns: [media.id],
      name: 'banners_mobile_image_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.filterId],
      foreignColumns: [savedFilters.id],
      name: 'banners_filter_id_fkey',
    }).onDelete('set null'),
    check(
      'banner_dates_check',
      sql`(end_date IS NULL) OR (start_date IS NULL) OR (end_date > start_date)`,
    ),
  ],
);

export const pages = pgTable(
  'pages',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    metaKeywords: text('meta_keywords'),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'string',
    }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    createdBy: bigint('created_by', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    updatedBy: bigint('updated_by', { mode: 'number' }),
    title: varchar({ length: 200 }).notNull(),
    slug: varchar({ length: 200 }).notNull(),
    content: text(),
    metaTitle: varchar('meta_title', { length: 200 }),
    metaDescription: text('meta_description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_pages_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_pages_slug').using(
      'btree',
      table.slug.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'pages_created_by_fkey',
    }),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [users.id],
      name: 'pages_updated_by_fkey',
    }),
    unique('pages_slug_key').on(table.slug),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    tableName: varchar('table_name', { length: 100 }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    recordId: bigint('record_id', { mode: 'number' }).notNull(),
    action: auditActionEnum().notNull(),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    performedBy: bigint('performed_by', { mode: 'number' }),
    requestId: uuid('request_id'),
    userAgent: text('user_agent'),
    changedFields: jsonb('changed_fields'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    performedByCustomer: bigint('performed_by_customer', { mode: 'number' }),
    ipAddress: inet('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_audit_logs_created').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_audit_logs_record').using(
      'btree',
      table.tableName.asc().nullsLast().op('text_ops'),
      table.recordId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_audit_logs_table').using(
      'btree',
      table.tableName.asc().nullsLast().op('text_ops'),
    ),
    index('idx_audit_logs_user').using(
      'btree',
      table.performedBy.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.performedByCustomer],
      foreignColumns: [customers.id],
      name: 'audit_logs_performed_by_customer_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.performedBy],
      foreignColumns: [users.id],
      name: 'audit_logs_performed_by_fkey',
    }),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    type: notificationTypeEnum().notNull(),
    channel: notificationChannelEnum().default('IN_APP').notNull(),
    title: varchar({ length: 255 }).notNull(),
    message: text(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    isRead: boolean('is_read').default(false).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    targetUserId: bigint('target_user_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    targetCustomerId: bigint('target_customer_id', { mode: 'number' }),
    linkUrl: text('link_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_notifications_created').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_notifications_customer').using(
      'btree',
      table.targetCustomerId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_notifications_customer_unread')
      .using(
        'btree',
        table.targetCustomerId.asc().nullsLast().op('int8_ops'),
        table.isRead.asc().nullsLast().op('bool_ops'),
      )
      .where(sql`(is_read = false)`),
    index('idx_notifications_read').using(
      'btree',
      table.isRead.asc().nullsLast().op('bool_ops'),
    ),
    index('idx_notifications_user').using(
      'btree',
      table.targetUserId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.targetCustomerId],
      foreignColumns: [customers.id],
      name: 'notifications_target_customer_id_fkey',
    }).onDelete('cascade'),
    check(
      'notification_target_check',
      sql`((target_user_id IS NOT NULL) AND (target_customer_id IS NULL)) OR ((target_user_id IS NULL) AND (target_customer_id IS NOT NULL))`,
    ),
  ],
);

export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    jobName: varchar('job_name', { length: 100 }).notNull(),
    queueName: varchar('queue_name', { length: 50 })
      .default('default')
      .notNull(),
    correlationId: uuid('correlation_id'),
    workerName: varchar('worker_name', { length: 100 }),
    lastErrorAt: timestamp('last_error_at', {
      withTimezone: true,
      mode: 'string',
    }),
    finishedAt: timestamp('finished_at', {
      withTimezone: true,
      mode: 'string',
    }),
    payload: jsonb().notNull(),
    priority: integer().default(5),
    attempts: integer().default(0),
    maxAttempts: integer('max_attempts').default(3),
    status: backgroundJobStatusEnum().default('PENDING').notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'string' }),
    scheduledAt: timestamp('scheduled_at', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    result: jsonb(),
    retryAt: timestamp('retry_at', { withTimezone: true, mode: 'string' }),
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_background_jobs_priority').using(
      'btree',
      table.priority.asc().nullsLast().op('int4_ops'),
    ),
    index('idx_background_jobs_queue').using(
      'btree',
      table.queueName.asc().nullsLast().op('text_ops'),
    ),
    index('idx_background_jobs_schedule').using(
      'btree',
      table.scheduledAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_background_jobs_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    check('background_jobs_check', sql`attempts <= max_attempts`),
    check(
      'background_jobs_priority_check',
      sql`(priority >= 1) AND (priority <= 10)`,
    ),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    roleId: bigint('role_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    permissionId: bigint('permission_id', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('idx_role_permissions_role').using(
      'btree',
      table.roleId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissions.id],
      name: 'role_permissions_permission_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: 'role_permissions_role_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.roleId, table.permissionId],
      name: 'role_permissions_pkey',
    }),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    roleId: bigint('role_id', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('idx_user_roles_role').using(
      'btree',
      table.roleId.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_user_roles_user').using(
      'btree',
      table.userId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: 'user_roles_role_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_roles_user_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.userId, table.roleId],
      name: 'user_roles_pkey',
    }),
  ],
);

export const userBranches = pgTable(
  'user_branches',
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    userId: bigint('user_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    branchId: bigint('branch_id', { mode: 'number' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [branches.id],
      name: 'fk_user_branch_id',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_branches_user_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.userId, table.branchId],
      name: 'user_branches_pkey',
    }),
  ],
);

export const productCategories = pgTable(
  'product_categories',
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    categoryId: bigint('category_id', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('idx_product_categories_category').using(
      'btree',
      table.categoryId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: 'product_categories_category_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'product_categories_product_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.productId, table.categoryId],
      name: 'product_categories_pkey',
    }),
  ],
);

export const productTypes = pgTable(
  'product_types',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    code: varchar({ length: 10 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: text(),
    imageMediaId: bigint('image_media_id', { mode: 'number' }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('product_types_code_key').on(table.code),
    foreignKey({
      columns: [table.imageMediaId],
      foreignColumns: [media.id],
      name: 'product_types_image_media_id_fkey',
    }).onDelete('set null'),
  ],
);

export const productTypeAssignments = pgTable(
  'product_type_assignments',
  {
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    productTypeId: bigint('product_type_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'product_type_assignments_product_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productTypeId],
      foreignColumns: [productTypes.id],
      name: 'product_type_assignments_product_type_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.productId, table.productTypeId],
      name: 'product_type_assignments_pkey',
    }),
  ],
);

export const favorites = pgTable(
  'favorites',
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    customerId: bigint('customer_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'favorites_customer_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'favorites_product_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.customerId, table.productId],
      name: 'favorites_pkey',
    }),
  ],
);

export const productTaxClasses = pgTable(
  'product_tax_classes',
  {
    priority: smallint().default(1),
    assignedAt: timestamp('assigned_at', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    assignedBy: bigint('assigned_by', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    taxRateId: bigint('tax_rate_id', { mode: 'number' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'product_tax_classes_assigned_by_fkey',
    }),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'product_tax_classes_product_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.taxRateId],
      foreignColumns: [taxRates.id],
      name: 'product_tax_classes_tax_rate_id_fkey',
    }).onDelete('restrict'),
    primaryKey({
      columns: [table.productId, table.taxRateId],
      name: 'product_tax_classes_pkey',
    }),
  ],
);

export const promotionProducts = pgTable(
  'promotion_products',
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    promotionId: bigint('promotion_id', { mode: 'number' }).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    productVariantId: bigint('product_variant_id', {
      mode: 'number',
    }).notNull(),
    discountValue: numeric('discount_value', {
      precision: 12,
      scale: 2,
    }).notNull(),
    isPercentage: boolean('is_percentage').default(true).notNull(),
    maximumDiscount: numeric('maximum_discount', { precision: 12, scale: 2 }),
  },
  (table) => [
    foreignKey({
      columns: [table.productVariantId],
      foreignColumns: [productVariants.id],
      name: 'promotion_products_product_variant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.promotionId],
      foreignColumns: [promotions.id],
      name: 'promotion_products_promotion_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.promotionId, table.productVariantId],
      name: 'promotion_products_pkey',
    }),
    check(
      'promotion_discount_check',
      sql`((is_percentage = true) AND (discount_value <= (100)::numeric)) OR (is_percentage = false)`,
    ),
    check(
      'promotion_products_discount_value_check',
      sql`discount_value >= (0)::numeric`,
    ),
  ],
);

// ── Shopping Lists ──

export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    customerId: bigint('customer_id', { mode: 'number' }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_shopping_lists_customer').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'shopping_lists_customer_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const shoppingListItems = pgTable(
  'shopping_list_items',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    listId: bigint('list_id', { mode: 'number' }).notNull(),
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    quantity: integer().default(1).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_shopping_list_items_list').using(
      'btree',
      table.listId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.listId],
      foreignColumns: [shoppingLists.id],
      name: 'shopping_list_items_list_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'shopping_list_items_product_id_fkey',
    }).onDelete('cascade'),
  ],
);

// ── Featured Product Tabs ──────────────────────────────────
export const featuredProductTabs = pgTable(
  'featured_product_tabs',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    slug: varchar({ length: 50 }).notNull(),
    position: integer().default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    queryOnSale: boolean('query_on_sale'),
    querySort: varchar('query_sort', { length: 50 }),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('featured_product_tabs_slug_key').on(table.slug),
    index('idx_featured_tabs_position').using(
      'btree',
      table.position.asc().nullsLast().op('int4_ops'),
    ),
  ],
);

// ── Featured Product Assignments ───────────────────────────
export const featuredProductAssignments = pgTable(
  'featured_product_assignments',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    tabId: bigint('tab_id', { mode: 'number' }).notNull(),
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    position: integer().default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('featured_assignments_unique').on(table.tabId, table.productId),
    index('idx_featured_assignments_tab').using(
      'btree',
      table.tabId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.tabId],
      foreignColumns: [featuredProductTabs.id],
      name: 'featured_assignments_tab_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [products.id],
      name: 'featured_assignments_product_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const customerPaymentMethodTypeEnum = pgEnum(
  'customer_payment_method_type_enum',
  ['CARD', 'NEQUI'],
);

export const customerPaymentMethods = pgTable(
  'customer_payment_methods',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    customerId: bigint('customer_id', { mode: 'number' }).notNull(),
    methodType: customerPaymentMethodTypeEnum('method_type').notNull(),
    label: varchar({ length: 50 }),
    brand: varchar({ length: 50 }),
    last4: varchar({ length: 4 }),
    cardholderName: varchar('cardholder_name', { length: 100 }),
    // Token del proveedor (Wompi/ePayco) para cobros futuros
    token: varchar({ length: 255 }),
    // Para billeteras digitales (Nequi)
    phone: varchar({ length: 20 }),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_customer_payment_methods_customer').using(
      'btree',
      table.customerId.asc().nullsLast().op('int8_ops'),
    ),
    uniqueIndex('idx_customer_default_payment_method')
      .using('btree', table.customerId.asc().nullsLast().op('int8_ops'))
      .where(sql`(is_default = true)`),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'customer_payment_methods_customer_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const popupPositionEnum = pgEnum('popup_position_enum', [
  'header',
  'footer',
  'left',
  'right',
]);

export const popups = pgTable(
  'popups',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    title: varchar({ length: 200 }).notNull(),
    imageMediaId: bigint('image_media_id', { mode: 'number' }).notNull(),
    position: popupPositionEnum('position').default('header').notNull(),
    filterConfig: jsonb('filter_config').default({}),
    durationMs: integer('duration_ms').default(7000).notNull(),
    delayMs: integer('delay_ms').default(1500).notNull(),
    // Altura máxima en px del popup (NULL = sin límite, altura natural)
    maxHeight: integer('max_height'),
    isActive: boolean('is_active').default(true).notNull(),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'string' }),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    foreignKey({
      columns: [table.imageMediaId],
      foreignColumns: [media.id],
      name: 'popups_image_media_id_fkey',
    }).onDelete('cascade'),
    index('idx_popups_position').using(
      'btree',
      table.position.asc().nullsLast().op('enum_ops'),
    ),
    index('idx_popups_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
  ],
);

export const newsletterCampaignStatusEnum = pgEnum(
  'newsletter_campaign_status_enum',
  ['borrador', 'programada', 'enviando', 'enviada', 'fallida', 'cancelada'],
);

export const newsletterSubscribers = pgTable(
  'newsletter_subscribers',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    email: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 120 }),
    acceptedTerms: boolean('accepted_terms').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    source: varchar({ length: 50 }).default('landing'),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    unsubscribedAt: timestamp('unsubscribed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    unique('newsletter_subscribers_email_unique').on(table.email),
    index('idx_newsletter_subs_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
  ],
);

export const newsletterCampaigns = pgTable(
  'newsletter_campaigns',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    title: varchar({ length: 200 }).notNull(),
    subject: varchar({ length: 200 }).notNull(),
    content: text('content').notNull(),
    imageUrl: varchar({ length: 500 }),
    status: newsletterCampaignStatusEnum('status')
      .default('borrador')
      .notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'string' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    sentCount: integer('sent_count').default(0),
    failedCount: integer('failed_count').default(0),
    errorMessage: text('error_message'),
    createdBy: bigint('created_by', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_newsletter_campaigns_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
  ],
);

/* ── Campañas de marketing (módulo admin: Campañas) ─────────────── */

export const campaignStatusEnum = pgEnum('campaign_status_enum', [
  'borrador',
  'programada',
  'enviando',
  'enviada',
  'fallida',
]);

export const campaignChannelEnum = pgEnum('campaign_channel_enum', [
  'whatsapp',
  'email',
  'sms',
]);

export const campaignRecipientStatusEnum = pgEnum('campaign_recipient_status_enum', [
  'pendiente',
  'enviado',
  'abierto',
  'fallido',
]);

export const campaigns = pgTable(
  'campaigns',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    name: varchar({ length: 200 }).notNull(),
    // Producto promocionado (opcional: la campaña puede no ser de producto)
    productId: bigint('product_id', { mode: 'number' }),
    // Prompt/tono usados para generar el contenido con IA
    prompt: text('prompt'),
    tone: varchar({ length: 50 }),
    channels: jsonb('channels').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    // Canal prioritario de envío (whatsapp → email → sms por defecto). Si el
    // destinatario tiene varios canales disponibles recibe UN solo mensaje por
    // este canal; si no lo tiene disponible, el emisor usa el siguiente activo.
    priorityChannel: campaignChannelEnum('priority_channel'),
    // Modo de segmentación al recomendar el público: 'multi' | 'bundle'
    mode: varchar('mode', { length: 10 }).default('multi').notNull(),
    // Origen del público objetivo: 'auto' (recomendación por producto),
    // 'manual' (filtros manuales) o 'mixed' (recomendada + manual).
    audienceMode: varchar('audience_mode', { length: 10 })
      .default('auto')
      .notNull(),
    status: campaignStatusEnum('status').default('borrador').notNull(),
    // Público: lo llena la recomendación de clientes (aleatoria por ahora,
    // segmentación inteligente después)
    audienceCount: integer('audience_count').default(0).notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'string' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    sentCount: integer('sent_count').default(0).notNull(),
    openedCount: integer('opened_count').default(0).notNull(),
    convertedCount: integer('converted_count').default(0).notNull(),
    createdBy: bigint('created_by', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_campaigns_status').using('btree', table.status),
    index('idx_campaigns_deleted_at').on(table.deletedAt),
  ],
);

export const campaignProducts = pgTable(
  'campaign_products',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    campaignId: bigint('campaign_id', { mode: 'number' }).notNull(),
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    position: integer('position').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_campaign_products_campaign').on(table.campaignId),
    uniqueIndex('uq_campaign_products_campaign_product').on(
      table.campaignId,
      table.productId,
    ),
  ],
);

export const campaignMessages = pgTable(
  'campaign_messages',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    campaignId: bigint('campaign_id', { mode: 'number' }).notNull(),
    channel: campaignChannelEnum('channel').notNull(),
    // Email: asunto del correo
    subject: varchar({ length: 300 }),
    // WhatsApp / SMS: texto plano del mensaje
    content: text('content'),
    // Email: HTML final (generado por el diseñador/IA)
    html: text('html'),
    // Email: bloques del diseñador drag & drop (EmailEditor del admin)
    emailBlocks: jsonb('email_blocks'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_campaign_messages_campaign').on(table.campaignId),
    uniqueIndex('uq_campaign_messages_campaign_channel').on(
      table.campaignId,
      table.channel,
    ),
  ],
);

export const campaignRecipients = pgTable(
  'campaign_recipients',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    campaignId: bigint('campaign_id', { mode: 'number' }).notNull(),
    // Snapshot del cliente destino (id nullable: puede ser suscriptor sin cuenta)
    customerId: bigint('customer_id', { mode: 'number' }),
    // Snapshot del perfil RFM del cliente (réplica de analytics): permite
    // mostrar la tabla completa del público (segmento, frecuencia, monetario,
    // ticket, categorías y propensión) sin consultas extra al clustering.
    cedula: varchar('cedula', { length: 50 }),
    segmento: integer('segmento'),
    frecuencia: doublePrecision('frecuencia'),
    monetario: doublePrecision('monetario'),
    ticketPromedio: doublePrecision('ticket_promedio'),
    categoriasDistintas: doublePrecision('categorias_distintas'),
    propensity: doublePrecision('propensity'),
    name: varchar({ length: 200 }),
    email: varchar({ length: 255 }),
    phone: varchar({ length: 50 }),
    status: campaignRecipientStatusEnum('status').default('pendiente').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_campaign_recipients_campaign').on(table.campaignId),
    index('idx_campaign_recipients_status').using('btree', table.status),
  ],
);

/**
 * Historial inmutable de la campaña: cada evento de su ciclo de vida
 * (created / updated / deleted / relaunched / scheduled ...) queda
 * registrado con un snapshot, sin modificar registros previos.
 */
export const campaignHistory = pgTable(
  'campaign_history',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    campaignId: bigint('campaign_id', { mode: 'number' }).notNull(),
    action: varchar({ length: 30 }).notNull(),
    // Estado de la campaña después de la acción (si aplica)
    status: varchar({ length: 20 }),
    // Snapshot: nombre, canales, modo, mensajes, público, etc.
    details: jsonb('details'),
    createdBy: bigint('created_by', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_campaign_history_campaign').on(table.campaignId),
  ],
);

/**
 * Chat por pedido: mensajes entre el repartidor y el cliente.
 * senderType distingue quién escribió; la identidad del repartidor se guarda
 * en senderUserId (cuenta users) y la del invitado en senderGuestSessionId.
 * La identidad del cliente registrado vive en la orden (customer_id).
 */
export const orderChatSenderEnum = pgEnum('order_chat_sender_enum', [
  'customer',
  'delivery',
]);

export const orderChatMessages = pgTable(
  'order_chat_messages',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    orderId: bigint('order_id', { mode: 'bigint' }).notNull(),
    senderType: orderChatSenderEnum('sender_type').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    senderUserId: bigint('sender_user_id', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    senderGuestSessionId: bigint('sender_guest_session_id', { mode: 'number' }),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    // Se sella cuando la contraparte lee el mensaje (acuse de lectura).
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_order_chat_messages_order').using(
      'btree',
      table.orderId.asc().nullsLast().op('int8_ops'),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orders.id],
      name: 'order_chat_messages_order_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.senderUserId],
      foreignColumns: [users.id],
      name: 'order_chat_messages_sender_user_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.senderGuestSessionId],
      foreignColumns: [guestSessions.id],
      name: 'order_chat_messages_sender_guest_session_id_fkey',
    }).onDelete('set null'),
  ],
);

export const driverChatSenderEnum = pgEnum('driver_chat_sender_enum', [
  'driver',
  'admin',
]);

/** Chat directo repartidor ↔ administrador (un hilo por repartidor). */
export const driverChatMessages = pgTable(
  'driver_chat_messages',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    driverId: bigint('driver_id', { mode: 'number' }).notNull(),
    senderType: driverChatSenderEnum('sender_type').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    senderUserId: bigint('sender_user_id', { mode: 'number' }),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_driver_chat_messages_driver').using(
      'btree',
      table.driverId.asc().nullsLast().op('int8_ops'),
      table.id.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_driver_chat_messages_unread')
      .using('btree', table.driverId.asc().nullsLast().op('int8_ops'))
      .where(sql`(read_at IS NULL)`),
    foreignKey({
      columns: [table.driverId],
      foreignColumns: [deliveryDrivers.id],
      name: 'driver_chat_messages_driver_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.senderUserId],
      foreignColumns: [users.id],
      name: 'driver_chat_messages_sender_user_id_fkey',
    }).onDelete('set null'),
  ],
);

export const pickerChatSenderEnum = pgEnum('picker_chat_sender_enum', [
  'picker',
  'admin',
]);

/**
 * Chat directo picker ↔ administrador (un hilo por picker).
 *
 * `pickerId` apunta a `users` (el picker es un usuario marcado con `isPicker`),
 * a diferencia de `driver_chat_messages`, que apunta a `delivery_drivers`.
 */
export const pickerChatMessages = pgTable(
  'picker_chat_messages',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    pickerId: bigint('picker_id', { mode: 'number' }).notNull(),
    senderType: pickerChatSenderEnum('sender_type').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    senderUserId: bigint('sender_user_id', { mode: 'number' }),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_picker_chat_messages_picker').using(
      'btree',
      table.pickerId.asc().nullsLast().op('int8_ops'),
      table.id.asc().nullsLast().op('int8_ops'),
    ),
    index('idx_picker_chat_messages_unread')
      .using('btree', table.pickerId.asc().nullsLast().op('int8_ops'))
      .where(sql`(read_at IS NULL)`),
    foreignKey({
      columns: [table.pickerId],
      foreignColumns: [users.id],
      name: 'picker_chat_messages_picker_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.senderUserId],
      foreignColumns: [users.id],
      name: 'picker_chat_messages_sender_user_id_fkey',
    }).onDelete('set null'),
  ],
);
