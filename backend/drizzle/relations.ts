// @ts-nocheck
import { relations } from 'drizzle-orm/relations';
import {
  users,
  userSessions,
  userRefreshTokens,
  media,
  store,
  branches,
  deliveryZones,
  categories,
  brands,
  products,
  productImages,
  attributes,
  attributeOptions,
  productAttributes,
  productVariants,
  variantAttributes,
  prices,
  inventory,
  inventoryMovements,
  inventoryReservations,
  supplierProducts,
  suppliers,
  customers,
  customerAddresses,
  customerSessions,
  guestSessions,
  customerTokens,
  customerPaymentMethods,
  carts,
  coupons,
  cartItems,
  orders,
  orderItems,
  deliveryTimeSlots,
  shipments,
  taxRates,
  orderStatusHistory,
  paymentIntents,
  payments,
  refunds,
  invoices,
  deliveryDrivers,
  deliveryDriverLocations,
  deliveryAssignments,
  deliveryEvents,
  promotions,
  promotionConditions,
  couponRedemptions,
  menus,
  menuItems,
  pages,
  banners,
  savedFilters,
  auditLogs,
  notifications,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  userBranches,
  productCategories,
  productTypes,
  productTypeAssignments,
  favorites,
  productTaxClasses,
  promotionProducts,
  orderChatMessages,
  driverChatMessages,
} from './schema';

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  userSessions: many(userSessions),
  userRefreshTokens: many(userRefreshTokens),
  media: many(media),
  prices: many(prices),
  inventoryMovements: many(inventoryMovements),
  inventoryReservations: many(inventoryReservations),
  refunds: many(refunds),
  promotions: many(promotions),
  pages_createdBy: many(pages, {
    relationName: 'pages_createdBy_users_id',
  }),
  pages_updatedBy: many(pages, {
    relationName: 'pages_updatedBy_users_id',
  }),
  auditLogs: many(auditLogs),
  userRoles: many(userRoles),
  userBranches: many(userBranches),
  productTaxClasses: many(productTaxClasses),
}));

export const userRefreshTokensRelations = relations(
  userRefreshTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [userRefreshTokens.userId],
      references: [users.id],
    }),
  }),
);

export const storeRelations = relations(store, ({ one, many }) => ({
  media: one(media, {
    fields: [store.logoMediaId],
    references: [media.id],
  }),
  branches: many(branches),
}));

export const mediaRelations = relations(media, ({ one, many }) => ({
  stores: many(store),
  user: one(users, {
    fields: [media.uploadedBy],
    references: [users.id],
  }),
  categories: many(categories),
  brands: many(brands),
  productImages: many(productImages),
  invoices_pdfMediaId: many(invoices, {
    relationName: 'invoices_pdfMediaId_media_id',
  }),
  invoices_xmlMediaId: many(invoices, {
    relationName: 'invoices_xmlMediaId_media_id',
  }),
  banners: many(banners),
  banners_mobileImage: many(banners, {
    relationName: 'banners_mobileImage',
  }),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  store: one(store, {
    fields: [branches.storeId],
    references: [store.id],
  }),
  deliveryZones: many(deliveryZones),
  inventories: many(inventory),
  carts: many(carts),
  orders: many(orders),
  deliveryTimeSlots: many(deliveryTimeSlots),
  userBranches: many(userBranches),
}));

export const deliveryZonesRelations = relations(
  deliveryZones,
  ({ one, many }) => ({
    branch: one(branches, {
      fields: [deliveryZones.branchId],
      references: [branches.id],
    }),
    carts: many(carts),
    orders: many(orders),
  }),
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  media: one(media, {
    fields: [categories.imageMediaId],
    references: [media.id],
  }),
  category: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'categories_parentId_categories_id',
  }),
  categories: many(categories, {
    relationName: 'categories_parentId_categories_id',
  }),
  productCategories: many(productCategories),
}));

export const brandsRelations = relations(brands, ({ one, many }) => ({
  media: one(media, {
    fields: [brands.logoMediaId],
    references: [media.id],
  }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, {
    fields: [products.brandId],
    references: [brands.id],
  }),
  productImages: many(productImages),
  productAttributes: many(productAttributes),
  productVariants: many(productVariants),
  productCategories: many(productCategories),
  productTypeAssignments: many(productTypeAssignments),
  favorites: many(favorites),
  productTaxClasses: many(productTaxClasses),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  media: one(media, {
    fields: [productImages.mediaId],
    references: [media.id],
  }),
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const attributeOptionsRelations = relations(
  attributeOptions,
  ({ one, many }) => ({
    attribute: one(attributes, {
      fields: [attributeOptions.attributeId],
      references: [attributes.id],
    }),
    productAttributes: many(productAttributes),
    variantAttributes: many(variantAttributes),
  }),
);

export const attributesRelations = relations(attributes, ({ many }) => ({
  attributeOptions: many(attributeOptions),
  productAttributes: many(productAttributes),
  variantAttributes: many(variantAttributes),
}));

export const productAttributesRelations = relations(
  productAttributes,
  ({ one }) => ({
    attribute: one(attributes, {
      fields: [productAttributes.attributeId],
      references: [attributes.id],
    }),
    attributeOption: one(attributeOptions, {
      fields: [productAttributes.attributeOptionId],
      references: [attributeOptions.id],
    }),
    product: one(products, {
      fields: [productAttributes.productId],
      references: [products.id],
    }),
  }),
);

export const productVariantsRelations = relations(
  productVariants,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
    variantAttributes: many(variantAttributes),
    prices: many(prices),
    inventories: many(inventory),
    supplierProducts: many(supplierProducts),
    cartItems: many(cartItems),
    orderItems: many(orderItems),
    promotionProducts: many(promotionProducts),
  }),
);

export const variantAttributesRelations = relations(
  variantAttributes,
  ({ one }) => ({
    attribute: one(attributes, {
      fields: [variantAttributes.attributeId],
      references: [attributes.id],
    }),
    attributeOption: one(attributeOptions, {
      fields: [variantAttributes.attributeOptionId],
      references: [attributeOptions.id],
    }),
    productVariant: one(productVariants, {
      fields: [variantAttributes.variantId],
      references: [productVariants.id],
    }),
  }),
);

export const pricesRelations = relations(prices, ({ one }) => ({
  user: one(users, {
    fields: [prices.changedBy],
    references: [users.id],
  }),
  productVariant: one(productVariants, {
    fields: [prices.productVariantId],
    references: [productVariants.id],
  }),
}));

export const inventoryRelations = relations(inventory, ({ one, many }) => ({
  branch: one(branches, {
    fields: [inventory.branchId],
    references: [branches.id],
  }),
  productVariant: one(productVariants, {
    fields: [inventory.productVariantId],
    references: [productVariants.id],
  }),
  inventoryMovements: many(inventoryMovements),
  inventoryReservations: many(inventoryReservations),
}));

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    inventory: one(inventory, {
      fields: [inventoryMovements.inventoryId],
      references: [inventory.id],
    }),
    user: one(users, {
      fields: [inventoryMovements.performedBy],
      references: [users.id],
    }),
  }),
);

export const inventoryReservationsRelations = relations(
  inventoryReservations,
  ({ one }) => ({
    user: one(users, {
      fields: [inventoryReservations.createdBy],
      references: [users.id],
    }),
    inventory: one(inventory, {
      fields: [inventoryReservations.inventoryId],
      references: [inventory.id],
    }),
  }),
);

export const supplierProductsRelations = relations(
  supplierProducts,
  ({ one }) => ({
    productVariant: one(productVariants, {
      fields: [supplierProducts.productVariantId],
      references: [productVariants.id],
    }),
    supplier: one(suppliers, {
      fields: [supplierProducts.supplierId],
      references: [suppliers.id],
    }),
  }),
);

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  supplierProducts: many(supplierProducts),
}));

export const customerAddressesRelations = relations(
  customerAddresses,
  ({ one, many }) => ({
    customer: one(customers, {
      fields: [customerAddresses.customerId],
      references: [customers.id],
    }),
    carts: many(carts),
    orders: many(orders),
  }),
);

export const customerPaymentMethodsRelations = relations(
  customerPaymentMethods,
  ({ one }) => ({
    customer: one(customers, {
      fields: [customerPaymentMethods.customerId],
      references: [customers.id],
    }),
  }),
);

export const customersRelations = relations(customers, ({ many }) => ({
  customerAddresses: many(customerAddresses),
  customerPaymentMethods: many(customerPaymentMethods),
  customerSessions: many(customerSessions),
  guestSessions: many(guestSessions),
  customerTokens: many(customerTokens),
  carts: many(carts),
  orders: many(orders),
  orderStatusHistories: many(orderStatusHistory),
  deliveryEvents: many(deliveryEvents),
  couponRedemptions: many(couponRedemptions),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
  favorites: many(favorites),
}));

export const customerSessionsRelations = relations(
  customerSessions,
  ({ one }) => ({
    customer: one(customers, {
      fields: [customerSessions.customerId],
      references: [customers.id],
    }),
  }),
);

export const guestSessionsRelations = relations(
  guestSessions,
  ({ one, many }) => ({
    customer: one(customers, {
      fields: [guestSessions.convertedCustomerId],
      references: [customers.id],
    }),
    carts: many(carts),
    orders: many(orders),
    couponRedemptions: many(couponRedemptions),
  }),
);

export const customerTokensRelations = relations(customerTokens, ({ one }) => ({
  customer: one(customers, {
    fields: [customerTokens.customerId],
    references: [customers.id],
  }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  branch: one(branches, {
    fields: [carts.branchId],
    references: [branches.id],
  }),
  customerAddress: one(customerAddresses, {
    fields: [carts.customerAddressId],
    references: [customerAddresses.id],
  }),
  customer: one(customers, {
    fields: [carts.customerId],
    references: [customers.id],
  }),
  deliveryZone: one(deliveryZones, {
    fields: [carts.deliveryZoneId],
    references: [deliveryZones.id],
  }),
  guestSession: one(guestSessions, {
    fields: [carts.guestSessionId],
    references: [guestSessions.id],
  }),
  coupon: one(coupons, {
    fields: [carts.couponId],
    references: [coupons.id],
  }),
  cartItems: many(cartItems),
}));

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  carts: many(carts),
  orders: many(orders),
  promotion: one(promotions, {
    fields: [coupons.promotionId],
    references: [promotions.id],
  }),
  couponRedemptions: many(couponRedemptions),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  productVariant: one(productVariants, {
    fields: [cartItems.productVariantId],
    references: [productVariants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  coupon: one(coupons, {
    fields: [orders.couponId],
    references: [coupons.id],
  }),
  branch: one(branches, {
    fields: [orders.branchId],
    references: [branches.id],
  }),
  customerAddress: one(customerAddresses, {
    fields: [orders.customerAddressId],
    references: [customerAddresses.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  deliveryZone: one(deliveryZones, {
    fields: [orders.deliveryZoneId],
    references: [deliveryZones.id],
  }),
  guestSession: one(guestSessions, {
    fields: [orders.guestSessionId],
    references: [guestSessions.id],
  }),
  orderItems: many(orderItems),
  shipments: many(shipments),
  orderStatusHistories: many(orderStatusHistory),
  paymentIntents: many(paymentIntents),
  payments: many(payments),
  refunds: many(refunds),
  invoices: many(invoices),
  couponRedemptions: many(couponRedemptions),
  chatMessages: many(orderChatMessages),
}));

export const orderChatMessagesRelations = relations(
  orderChatMessages,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderChatMessages.orderId],
      references: [orders.id],
    }),
    senderUser: one(users, {
      fields: [orderChatMessages.senderUserId],
      references: [users.id],
    }),
    senderGuestSession: one(guestSessions, {
      fields: [orderChatMessages.senderGuestSessionId],
      references: [guestSessions.id],
    }),
  }),
);

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  productVariant: one(productVariants, {
    fields: [orderItems.productVariantId],
    references: [productVariants.id],
  }),
}));

export const deliveryTimeSlotsRelations = relations(
  deliveryTimeSlots,
  ({ one, many }) => ({
    branch: one(branches, {
      fields: [deliveryTimeSlots.branchId],
      references: [branches.id],
    }),
    shipments: many(shipments),
  }),
);

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  deliveryTimeSlot: one(deliveryTimeSlots, {
    fields: [shipments.deliveryTimeSlotId],
    references: [deliveryTimeSlots.id],
  }),
  order: one(orders, {
    fields: [shipments.orderId],
    references: [orders.id],
  }),
  taxRate: one(taxRates, {
    fields: [shipments.shippingTaxRateId],
    references: [taxRates.id],
  }),
  deliveryAssignments: many(deliveryAssignments),
}));

export const taxRatesRelations = relations(taxRates, ({ many }) => ({
  shipments: many(shipments),
  productTaxClasses: many(productTaxClasses),
}));

export const orderStatusHistoryRelations = relations(
  orderStatusHistory,
  ({ one }) => ({
    customer: one(customers, {
      fields: [orderStatusHistory.createdBy],
      references: [customers.id],
    }),
    order: one(orders, {
      fields: [orderStatusHistory.orderId],
      references: [orders.id],
    }),
  }),
);

export const paymentIntentsRelations = relations(
  paymentIntents,
  ({ one, many }) => ({
    order: one(orders, {
      fields: [paymentIntents.orderId],
      references: [orders.id],
    }),
    payments: many(payments),
  }),
);

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  paymentIntent: one(paymentIntents, {
    fields: [payments.paymentIntentId],
    references: [paymentIntents.id],
  }),
  refunds: many(refunds),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, {
    fields: [refunds.orderId],
    references: [orders.id],
  }),
  payment: one(payments, {
    fields: [refunds.paymentId],
    references: [payments.id],
  }),
  user: one(users, {
    fields: [refunds.processedBy],
    references: [users.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  order: one(orders, {
    fields: [invoices.orderId],
    references: [orders.id],
  }),
  media_pdfMediaId: one(media, {
    fields: [invoices.pdfMediaId],
    references: [media.id],
    relationName: 'invoices_pdfMediaId_media_id',
  }),
  media_xmlMediaId: one(media, {
    fields: [invoices.xmlMediaId],
    references: [media.id],
    relationName: 'invoices_xmlMediaId_media_id',
  }),
}));

export const deliveryDriverLocationsRelations = relations(
  deliveryDriverLocations,
  ({ one }) => ({
    deliveryDriver: one(deliveryDrivers, {
      fields: [deliveryDriverLocations.driverId],
      references: [deliveryDrivers.id],
    }),
  }),
);

export const deliveryDriversRelations = relations(
  deliveryDrivers,
  ({ many }) => ({
    deliveryDriverLocations: many(deliveryDriverLocations),
    deliveryAssignments: many(deliveryAssignments),
  }),
);

export const deliveryAssignmentsRelations = relations(
  deliveryAssignments,
  ({ one, many }) => ({
    deliveryDriver: one(deliveryDrivers, {
      fields: [deliveryAssignments.driverId],
      references: [deliveryDrivers.id],
    }),
    shipment: one(shipments, {
      fields: [deliveryAssignments.shipmentId],
      references: [shipments.id],
    }),
    deliveryEvents: many(deliveryEvents),
  }),
);

export const deliveryEventsRelations = relations(deliveryEvents, ({ one }) => ({
  deliveryAssignment: one(deliveryAssignments, {
    fields: [deliveryEvents.assignmentId],
    references: [deliveryAssignments.id],
  }),
  customer: one(customers, {
    fields: [deliveryEvents.createdBy],
    references: [customers.id],
  }),
}));

export const promotionsRelations = relations(promotions, ({ one, many }) => ({
  user: one(users, {
    fields: [promotions.createdBy],
    references: [users.id],
  }),
  promotionConditions: many(promotionConditions),
  coupons: many(coupons),
  promotionProducts: many(promotionProducts),
}));

export const promotionConditionsRelations = relations(
  promotionConditions,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotionConditions.promotionId],
      references: [promotions.id],
    }),
  }),
);

export const couponRedemptionsRelations = relations(
  couponRedemptions,
  ({ one }) => ({
    coupon: one(coupons, {
      fields: [couponRedemptions.couponId],
      references: [coupons.id],
    }),
    customer: one(customers, {
      fields: [couponRedemptions.customerId],
      references: [customers.id],
    }),
    guestSession: one(guestSessions, {
      fields: [couponRedemptions.guestSessionId],
      references: [guestSessions.id],
    }),
    order: one(orders, {
      fields: [couponRedemptions.orderId],
      references: [orders.id],
    }),
  }),
);

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  menu: one(menus, {
    fields: [menuItems.menuId],
    references: [menus.id],
  }),
  page: one(pages, {
    fields: [menuItems.pageId],
    references: [pages.id],
  }),
  menuItem: one(menuItems, {
    fields: [menuItems.parentId],
    references: [menuItems.id],
    relationName: 'menuItems_parentId_menuItems_id',
  }),
  menuItems: many(menuItems, {
    relationName: 'menuItems_parentId_menuItems_id',
  }),
}));

export const menusRelations = relations(menus, ({ many }) => ({
  menuItems: many(menuItems),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  menuItems: many(menuItems),
  user_createdBy: one(users, {
    fields: [pages.createdBy],
    references: [users.id],
    relationName: 'pages_createdBy_users_id',
  }),
  user_updatedBy: one(users, {
    fields: [pages.updatedBy],
    references: [users.id],
    relationName: 'pages_updatedBy_users_id',
  }),
}));

export const bannersRelations = relations(banners, ({ one }) => ({
  media: one(media, {
    fields: [banners.mediaId],
    references: [media.id],
  }),
  mobileImage: one(media, {
    fields: [banners.mobileImageId],
    references: [media.id],
    relationName: 'banners_mobileImage',
  }),
  filter: one(savedFilters, {
    fields: [banners.filterId],
    references: [savedFilters.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  customer: one(customers, {
    fields: [auditLogs.performedByCustomer],
    references: [customers.id],
  }),
  user: one(users, {
    fields: [auditLogs.performedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  customer: one(customers, {
    fields: [notifications.targetCustomerId],
    references: [customers.id],
  }),
}));

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    permission: one(permissions, {
      fields: [rolePermissions.permissionId],
      references: [permissions.id],
    }),
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
  }),
);

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
}));

export const userBranchesRelations = relations(userBranches, ({ one }) => ({
  branch: one(branches, {
    fields: [userBranches.branchId],
    references: [branches.id],
  }),
  user: one(users, {
    fields: [userBranches.userId],
    references: [users.id],
  }),
}));

export const productCategoriesRelations = relations(
  productCategories,
  ({ one }) => ({
    category: one(categories, {
      fields: [productCategories.categoryId],
      references: [categories.id],
    }),
    product: one(products, {
      fields: [productCategories.productId],
      references: [products.id],
    }),
  }),
);

export const productTypesRelations = relations(productTypes, ({ many }) => ({
  productTypeAssignments: many(productTypeAssignments),
}));

export const productTypeAssignmentsRelations = relations(
  productTypeAssignments,
  ({ one }) => ({
    product: one(products, {
      fields: [productTypeAssignments.productId],
      references: [products.id],
    }),
    productType: one(productTypes, {
      fields: [productTypeAssignments.productTypeId],
      references: [productTypes.id],
    }),
  }),
);

export const favoritesRelations = relations(favorites, ({ one }) => ({
  customer: one(customers, {
    fields: [favorites.customerId],
    references: [customers.id],
  }),
  product: one(products, {
    fields: [favorites.productId],
    references: [products.id],
  }),
}));

export const productTaxClassesRelations = relations(
  productTaxClasses,
  ({ one }) => ({
    user: one(users, {
      fields: [productTaxClasses.assignedBy],
      references: [users.id],
    }),
    product: one(products, {
      fields: [productTaxClasses.productId],
      references: [products.id],
    }),
    taxRate: one(taxRates, {
      fields: [productTaxClasses.taxRateId],
      references: [taxRates.id],
    }),
  }),
);

export const promotionProductsRelations = relations(
  promotionProducts,
  ({ one }) => ({
    productVariant: one(productVariants, {
      fields: [promotionProducts.productVariantId],
      references: [productVariants.id],
    }),
    promotion: one(promotions, {
      fields: [promotionProducts.promotionId],
      references: [promotions.id],
    }),
  }),
);

export const savedFiltersRelations = relations(savedFilters, ({ many }) => ({
  banners: many(banners),
}));

export const driverChatMessagesRelations = relations(
  driverChatMessages,
  ({ one }) => ({
    driver: one(deliveryDrivers, {
      fields: [driverChatMessages.driverId],
      references: [deliveryDrivers.id],
    }),
    senderUser: one(users, {
      fields: [driverChatMessages.senderUserId],
      references: [users.id],
    }),
  }),
);
