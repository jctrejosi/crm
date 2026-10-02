import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import slugify from 'slugify';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  attributes,
  branches,
  brands,
  categories,
  favorites,
  inventory,
  media,
  productAttributes,
  productCategories,
  productImages,
  productTypeAssignments,
  productTypes,
  products,
  productVariants,
  shoppingLists,
  shoppingListItems,
  suppliers,
  supplierProducts,
} from '../../../drizzle/schema';
import { CatalogProductsQueryDto } from './dto/catalog-products-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ResolvePluDto } from './dto/resolve-plu.dto';

/** Alias aceptados para la columna que trae el PLU en archivos de importación. */
const PLU_KEYS = new Set([
  'plu',
  'codigo',
  'cod',
  'code',
  'articulo_cod',
  'articulo',
  'articulocod',
  'sku',
  'external_id',
  'externalid',
  'ean',
]);

/** Normaliza un texto de cabecera para comparar contra los alias (sin tildes/ñ/espacios). */
const normalizeKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

type CatalogCategoryResponse = {
  id: number;
  parentId: number | null;
  level: number;
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  isActive: boolean;
  count: number;
};

type CategoryCountResponse = {
  categoryId: number;
  count: number;
};

type CatalogProductResponse = {
  id: number;
  externalId: string | null;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice?: number;
  image: string | null;
  images: string[];
  category: string;
  categoryId: number;
  brandId: number | null;
  brandName: string | null;
  plu: string | null;
  barcode: string | null;
  productTypeCode: string | null;
  productTypeName: string | null;
  isActive: boolean;
  isFeatured: boolean;
  isPublic: boolean;
  stock: number;
};

@Injectable()
export class CatalogService {
  constructor(private readonly drizzleService: DrizzleService) {}

  async getCategories(): Promise<CatalogCategoryResponse[]> {
    const countSubquery = this.drizzleService.db
      .select({
        categoryId: productCategories.categoryId,
        count: sql<number>`count(DISTINCT ${products.id})`.as('count'),
      })
      .from(productCategories)
      .innerJoin(products, eq(products.id, productCategories.productId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .groupBy(productCategories.categoryId)
      .as('category_counts');

    const rows = await this.drizzleService.db
      .select({
        id: categories.id,
        parentId: categories.parentId,
        level: categories.level,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        image: media.path,
        isActive: categories.isActive,
        count: sql<number>`COALESCE(${countSubquery.count}, 0)`,
      })
      .from(categories)
      .leftJoin(media, eq(categories.imageMediaId, media.id))
      .leftJoin(countSubquery, eq(countSubquery.categoryId, categories.id))
      .where(and(eq(categories.isActive, true), isNull(categories.deletedAt)))
      .orderBy(asc(categories.displayOrder), asc(categories.name));

    return rows.map((row) => ({
      id: Number(row.id),
      parentId: row.parentId ? Number(row.parentId) : null,
      level: Number(row.level ?? 0),
      slug: row.slug,
      name: row.name,
      description: row.description,
      image: row.image,
      isActive: row.isActive,
      count: Number(row.count ?? 0),
    }));
  }

  async getCategoryCounts(): Promise<CategoryCountResponse[]> {
    const rows = await this.drizzleService.db
      .select({
        categoryId: categories.id,
        count: sql<number>`count(DISTINCT ${products.id})`,
      })
      .from(categories)
      .innerJoin(
        productCategories,
        eq(productCategories.categoryId, categories.id),
      )
      .innerJoin(products, eq(products.id, productCategories.productId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(categories.isActive, true),
          isNull(categories.deletedAt),
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .groupBy(categories.id);

    return rows.map((row) => ({
      categoryId: Number(row.categoryId),
      count: Number(row.count),
    }));
  }

  // ── Admin Category CRUD ──

  async getAllCategoriesAdmin() {
    // Get all categories with their direct product counts via a simpler LEFT JOIN approach
    const rows = await this.drizzleService.db
      .select({
        id: categories.id,
        parentId: categories.parentId,
        name: categories.name,
        slug: categories.slug,
        code: categories.code,
        displayOrder: categories.displayOrder,
        description: categories.description,
        isActive: categories.isActive,
        level: categories.level,
        metaTitle: categories.metaTitle,
        metaDescription: categories.metaDescription,
        createdAt: categories.createdAt,
        imagePath: media.path,
      })
      .from(categories)
      .leftJoin(media, eq(categories.imageMediaId, media.id))
      .where(isNull(categories.deletedAt))
      .orderBy(asc(categories.displayOrder), asc(categories.name));

    const list = rows.map((row) => ({
      id: Number(row.id),
      parentId: row.parentId ? Number(row.parentId) : null,
      name: row.name,
      slug: row.slug,
      code: row.code,
      displayOrder: row.displayOrder ?? 0,
      description: row.description,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      isActive: row.isActive,
      level: row.level ?? 0,
      createdAt: row.createdAt,
      imagePath: row.imagePath,
      productCount: 0,
    }));

    // Get product counts per category
    const counts = await this.drizzleService.db
      .select({
        categoryId: productCategories.categoryId,
        count: sql<number>`count(DISTINCT ${products.id})`,
      })
      .from(productCategories)
      .innerJoin(products, eq(products.id, productCategories.productId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .groupBy(productCategories.categoryId);

    const countMap = new Map<number, number>();
    for (const c of counts) {
      countMap.set(Number(c.categoryId), Number(c.count));
    }

    for (const cat of list) {
      cat.productCount = countMap.get(cat.id) ?? 0;
    }

    // Propagate counts upward: a parent's count = its own + all descendants
    const childrenByParent = new Map<number, number[]>();
    for (const c of list) {
      if (c.parentId !== null) {
        const arr = childrenByParent.get(c.parentId) ?? [];
        arr.push(c.id);
        childrenByParent.set(c.parentId, arr);
      }
    }

    const getSubtreeCount = (catId: number, visited: Set<number>): number => {
      if (visited.has(catId)) return 0;
      visited.add(catId);
      const cat = list.find((c) => c.id === catId);
      if (!cat) return 0;
      let total = cat.productCount;
      for (const childId of childrenByParent.get(catId) ?? []) {
        total += getSubtreeCount(childId, visited);
      }
      return total;
    };

    return list.map((c) => ({
      ...c,
      productCount: getSubtreeCount(c.id, new Set()),
    }));
  }

  async createCategory(data: {
    name: string;
    code?: string;
    parentId?: number;
  }) {
    let slug = slugify(data.name, { lower: true, strict: true });
    let level = 0;

    if (data.parentId) {
      const [parent] = await this.drizzleService.db
        .select({ level: categories.level })
        .from(categories)
        .where(eq(categories.id, BigInt(data.parentId)));
      if (!parent) throw new NotFoundException('Categoría padre no encontrada');
      level = (parent.level ?? 0) + 1;
    }

    // Ensure unique slug
    const existing = await this.drizzleService.db
      .select({ slug: categories.slug })
      .from(categories)
      .where(eq(categories.slug, slug));
    if (existing.length > 0) slug = `${slug}-${Date.now()}`;

    const [inserted] = await this.drizzleService.db
      .insert(categories)
      .values({
        name: data.name,
        slug,
        code: data.code ?? null,
        parentId: data.parentId ?? null,
        level,
        displayOrder: 0,
        isActive: true,
      })
      .returning({ id: categories.id });

    return { id: Number(inserted.id) };
  }

  async updateCategory(
    id: number,
    data: {
      name?: string;
      code?: string;
      parentId?: number | null;
      description?: string | null;
      displayOrder?: number;
      metaTitle?: string | null;
      metaDescription?: string | null;
      isActive?: boolean;
      imageUrl?: string;
    },
  ) {
    const updates: Record<string, any> = {};

    if (data.name !== undefined) {
      let slug = slugify(data.name, { lower: true, strict: true });
      const existing = await this.drizzleService.db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.slug, slug), ne(categories.id, BigInt(id))));
      if (existing.length > 0) slug = `${slug}-${Date.now()}`;
      updates.name = data.name;
      updates.slug = slug;
    }

    if (data.parentId !== undefined) {
      let level = 0;
      if (data.parentId !== null) {
        const [parent] = await this.drizzleService.db
          .select({ level: categories.level })
          .from(categories)
          .where(eq(categories.id, BigInt(data.parentId)));
        if (parent) level = (parent.level ?? 0) + 1;
      }
      updates.parentId = data.parentId;
      updates.level = level;
    }

    if (data.code !== undefined) updates.code = data.code;
    if (data.description !== undefined) updates.description = data.description;
    if (data.displayOrder !== undefined)
      updates.displayOrder = data.displayOrder;
    if (data.metaTitle !== undefined) updates.metaTitle = data.metaTitle;
    if (data.metaDescription !== undefined)
      updates.metaDescription = data.metaDescription;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    if (data.imageUrl) {
      const [inserted] = await this.drizzleService.db
        .insert(media)
        .values({
          path: data.imageUrl,
          fileName:
            data.imageUrl.split('/').pop()?.substring(0, 50) ??
            'category_image',
          mimeType: 'image/jpeg',
          mediaType: 'image',
          provider: 'cloudinary',
          sizeBytes: 0,
          checksum: data.imageUrl.substring(0, 64),
          status: 'active',
          isPublic: true,
        })
        .returning({ id: media.id });
      updates.imageMediaId = Number(inserted.id);
    }

    if (Object.keys(updates).length === 0) return { id };

    const [updated] = await this.drizzleService.db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, BigInt(id)))
      .returning({ id: categories.id });

    if (!updated) throw new NotFoundException('Categoría no encontrada');
    return { id };
  }

  async deleteCategory(id: number) {
    // Promote children to root level
    await this.drizzleService.db
      .update(categories)
      .set({ parentId: null, level: 0 })
      .where(eq(categories.parentId, id));

    // Soft delete the category
    const [deleted] = await this.drizzleService.db
      .update(categories)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(categories.id, BigInt(id)))
      .returning({ id: categories.id });

    if (!deleted) throw new NotFoundException('Categoría no encontrada');
  }

  // ── Category-Product relations ──

  async getCategoryProducts(categoryId: number) {
    // Gather all descendant category IDs
    const allCats = await this.drizzleService.db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(isNull(categories.deletedAt));

    const childrenByParent = new Map<number, number[]>();
    for (const c of allCats) {
      if (c.parentId !== null) {
        const pid = Number(c.parentId);
        const arr = childrenByParent.get(pid) ?? [];
        arr.push(Number(c.id));
        childrenByParent.set(pid, arr);
      }
    }

    const collectDescendants = (id: number, visited: Set<number>): number[] => {
      if (visited.has(id)) return [];
      visited.add(id);
      const ids = [id];
      for (const childId of childrenByParent.get(id) ?? []) {
        ids.push(...collectDescendants(childId, visited));
      }
      return ids;
    };

    const categoryIds = collectDescendants(categoryId, new Set());

    const rows = await this.drizzleService.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        price: productVariants.currentPrice,
        image: media.path,
        productTypeCode: productTypes.code,
      })
      .from(productCategories)
      .innerJoin(products, eq(products.id, productCategories.productId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productId, products.id),
      )
      .leftJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .where(
        and(
          inArray(productCategories.categoryId, categoryIds),
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .orderBy(asc(products.name));

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      price: Number(row.price ?? 0),
      image: row.image,
      productTypeCode: row.productTypeCode,
    }));
  }

  async addProductToCategory(categoryId: number, productId: number) {
    await this.drizzleService.db
      .insert(productCategories)
      .values({
        categoryId,
        productId,
      })
      .onConflictDoNothing();
  }

  async removeProductFromCategory(categoryId: number, productId: number) {
    await this.drizzleService.db
      .delete(productCategories)
      .where(
        and(
          eq(productCategories.categoryId, categoryId),
          eq(productCategories.productId, productId),
        ),
      );
  }

  // ── Admin Product Type CRUD ──

  async getAllProductTypesAdmin() {
    const rows = await this.drizzleService.db
      .select({
        id: productTypes.id,
        code: productTypes.code,
        name: productTypes.name,
        description: productTypes.description,
        isActive: productTypes.isActive,
        imagePath: media.path,
      })
      .from(productTypes)
      .leftJoin(media, eq(productTypes.imageMediaId, media.id))
      .orderBy(asc(productTypes.name));

    const counts = await this.drizzleService.db
      .select({
        productTypeId: productTypeAssignments.productTypeId,
        count: sql<number>`count(DISTINCT ${products.id})`,
      })
      .from(productTypeAssignments)
      .innerJoin(products, eq(products.id, productTypeAssignments.productId))
      .where(isNull(products.deletedAt))
      .groupBy(productTypeAssignments.productTypeId);

    const countMap = new Map<number, number>();
    for (const c of counts) {
      countMap.set(Number(c.productTypeId), Number(c.count));
    }

    return rows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      imagePath: row.imagePath,
      productCount: countMap.get(Number(row.id)) ?? 0,
    }));
  }

  async createProductType(data: {
    name: string;
    code?: string;
    description?: string;
  }) {
    let code = (data.code ?? data.name)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .substring(0, 10);

    const existing = await this.drizzleService.db
      .select({ id: productTypes.id })
      .from(productTypes)
      .where(eq(productTypes.code, code));
    if (existing.length > 0) {
      code = `${code}_${Date.now().toString(36).toUpperCase().substring(0, 4)}`.substring(
        0,
        10,
      );
    }

    const [inserted] = await this.drizzleService.db
      .insert(productTypes)
      .values({
        name: data.name,
        code,
        description: data.description ?? null,
        isActive: true,
      })
      .returning({ id: productTypes.id });

    return { id: Number(inserted.id), code };
  }

  async updateProductType(
    id: number,
    data: {
      name?: string;
      code?: string;
      description?: string | null;
      isActive?: boolean;
      imageUrl?: string;
    },
  ) {
    const updates: Record<string, any> = {};

    if (data.name !== undefined) updates.name = data.name;
    if (data.code !== undefined) updates.code = data.code;
    if (data.description !== undefined) updates.description = data.description;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    if (data.imageUrl) {
      const [inserted] = await this.drizzleService.db
        .insert(media)
        .values({
          path: data.imageUrl,
          fileName:
            data.imageUrl.split('/').pop()?.substring(0, 50) ??
            'product_type_image',
          mimeType: 'image/jpeg',
          mediaType: 'image',
          provider: 'cloudinary',
          sizeBytes: 0,
          checksum: `type_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          status: 'active',
          isPublic: true,
        })
        .returning({ id: media.id });
      updates.imageMediaId = Number(inserted.id);
    }

    if (Object.keys(updates).length === 0) return { id };

    const [updated] = await this.drizzleService.db
      .update(productTypes)
      .set(updates)
      .where(eq(productTypes.id, BigInt(id)))
      .returning({ id: productTypes.id });

    if (!updated) throw new NotFoundException('Tipo de producto no encontrado');
    return { id };
  }

  async deleteProductType(id: number) {
    const [deleted] = await this.drizzleService.db
      .delete(productTypes)
      .where(eq(productTypes.id, BigInt(id)))
      .returning({ id: productTypes.id });

    if (!deleted) throw new NotFoundException('Tipo de producto no encontrado');
  }

  // ── Product Type-Product relations ──

  async getProductTypeProducts(productTypeId: number) {
    const rows = await this.drizzleService.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        price: productVariants.currentPrice,
        image: media.path,
        productTypeCode: productTypes.code,
      })
      .from(productTypeAssignments)
      .innerJoin(products, eq(products.id, productTypeAssignments.productId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .where(
        and(
          eq(productTypeAssignments.productTypeId, productTypeId),
          isNull(products.deletedAt),
        ),
      )
      .orderBy(asc(products.name));

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      price: Number(row.price ?? 0),
      image: row.image,
      productTypeCode: row.productTypeCode,
    }));
  }

  async addProductToType(productTypeId: number, productId: number) {
    await this.drizzleService.db
      .insert(productTypeAssignments)
      .values({ productTypeId, productId })
      .onConflictDoNothing();
  }

  async removeProductFromType(productTypeId: number, productId: number) {
    await this.drizzleService.db
      .delete(productTypeAssignments)
      .where(
        and(
          eq(productTypeAssignments.productTypeId, productTypeId),
          eq(productTypeAssignments.productId, productId),
        ),
      );
  }

  async replaceProductCategory(productId: number, newCategoryId: number) {
    // Remove all existing category assignments for this product
    await this.drizzleService.db
      .delete(productCategories)
      .where(eq(productCategories.productId, productId));

    // Assign the new category
    await this.drizzleService.db.insert(productCategories).values({
      categoryId: newCategoryId,
      productId,
    });
  }

  async getFeaturedBrands() {
    const rows = await this.drizzleService.db
      .select({
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        description: brands.description,
        image: media.path,
        website: brands.website,
      })
      .from(brands)
      .leftJoin(media, eq(brands.logoMediaId, media.id))
      .where(and(eq(brands.isActive, true), eq(brands.isFeatured, true)))
      .orderBy(asc(brands.name));

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      description: row.description,
      image: row.image,
      website: row.website,
    }));
  }

  async getCatalogBrands() {
    const rows = await this.drizzleService.db
      .select({
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        count: sql<number>`count(DISTINCT ${products.id})`,
      })
      .from(brands)
      .innerJoin(products, eq(products.brandId, brands.id))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(productCategories, eq(productCategories.productId, products.id))
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(
        and(
          eq(brands.isActive, true),
          isNull(brands.deletedAt),
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .groupBy(brands.id, brands.name, brands.slug)
      .orderBy(asc(brands.name));

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      count: Number(row.count),
    }));
  }

  // ── Admin Brands ──

  async getAllBrandsAdmin() {
    const rows = await this.drizzleService.db
      .select({
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        code: brands.code,
        description: brands.description,
        image: media.path,
        website: brands.website,
        country: brands.country,
        isFeatured: brands.isFeatured,
        isActive: brands.isActive,
        isPublic: brands.isPublic,
        createdAt: brands.createdAt,
        productCount: sql<number>`count(DISTINCT ${products.id})`,
      })
      .from(brands)
      .leftJoin(media, eq(brands.logoMediaId, media.id))
      .leftJoin(products, eq(products.brandId, brands.id))
      .where(isNull(brands.deletedAt))
      .groupBy(
        brands.id,
        brands.name,
        brands.slug,
        brands.code,
        brands.description,
        media.path,
        brands.website,
        brands.country,
        brands.isFeatured,
        brands.isActive,
        brands.isPublic,
        brands.createdAt,
      )
      .orderBy(asc(brands.name));

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      code: row.code,
      description: row.description,
      image: row.image,
      website: row.website,
      country: row.country,
      isFeatured: row.isFeatured,
      isActive: row.isActive,
      isPublic: row.isPublic,
      createdAt: row.createdAt,
      productCount: Number(row.productCount),
    }));
  }

  async createBrand(body: {
    name: string;
    code?: string;
    website?: string;
    description?: string;
    country?: string;
    isFeatured?: boolean;
    isPublic?: boolean;
    imageUrl?: string;
  }) {
    const slug = slugify(body.name, { lower: true, strict: true });

    let logoMediaId: number | null = null;
    if (body.imageUrl) {
      const [mediaRow] = await this.drizzleService.db
        .insert(media)
        .values({
          path: body.imageUrl,
          fileName:
            body.imageUrl.split('/').pop()?.substring(0, 50) ?? 'brand_logo',
          mimeType: 'image/jpeg',
          mediaType: 'image',
          provider: 'cloudinary',
          sizeBytes: 0,
          checksum: body.imageUrl.substring(0, 64),
          status: 'active',
        })
        .returning({ id: media.id });
      logoMediaId = Number(mediaRow.id);
    }

    const [result] = await this.drizzleService.db
      .insert(brands)
      .values({
        name: body.name,
        slug,
        code: body.code ?? null,
        website: body.website ?? '',
        description: body.description ?? '',
        country: body.country ?? '',
        logoMediaId,
        isFeatured: body.isFeatured ?? false,
        isPublic: body.isPublic ?? true,
        isActive: true,
      })
      .returning({ id: brands.id });

    return { id: Number(result.id) };
  }

  async updateBrand(
    id: number,
    body: {
      name?: string;
      code?: string;
      website?: string;
      description?: string;
      country?: string;
      isFeatured?: boolean;
      isActive?: boolean;
      isPublic?: boolean;
      imageUrl?: string;
    },
  ) {
    const updateData: Record<string, any> = {};

    if (body.name !== undefined) {
      updateData.name = body.name;
      updateData.slug = slugify(body.name, { lower: true, strict: true });
    }
    if (body.code !== undefined) updateData.code = body.code;
    if (body.website !== undefined) updateData.website = body.website;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.isFeatured !== undefined) updateData.isFeatured = body.isFeatured;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;

    if (body.imageUrl) {
      const [mediaRow] = await this.drizzleService.db
        .insert(media)
        .values({
          path: body.imageUrl,
          fileName:
            body.imageUrl.split('/').pop()?.substring(0, 50) ?? 'brand_logo',
          mimeType: 'image/jpeg',
          mediaType: 'image',
          provider: 'cloudinary',
          sizeBytes: 0,
          checksum: body.imageUrl.substring(0, 64),
          status: 'active',
        })
        .returning({ id: media.id });
      updateData.logoMediaId = Number(mediaRow.id);
    }

    updateData.updatedAt = new Date().toISOString();

    await this.drizzleService.db
      .update(brands)
      .set(updateData)
      .where(eq(brands.id, BigInt(id)));

    return { id };
  }

  async deleteBrand(id: number) {
    await this.drizzleService.db
      .update(brands)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(brands.id, BigInt(id)));
  }

  // ── Brand-Product relations ──

  async getBrandProducts(brandId: number) {
    const rows = await this.drizzleService.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        price: productVariants.currentPrice,
        image: media.path,
        productTypeCode: productTypes.code,
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
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productId, products.id),
      )
      .leftJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .where(
        and(
          eq(products.brandId, brandId),
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .orderBy(asc(products.name));

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      price: Number(row.price ?? 0),
      image: row.image,
      productTypeCode: row.productTypeCode,
    }));
  }

  async addProductToBrand(brandId: number, productId: number) {
    await this.drizzleService.db
      .update(products)
      .set({ brandId })
      .where(eq(products.id, BigInt(productId)));
  }

  async removeProductFromBrand(productId: number) {
    await this.drizzleService.db
      .update(products)
      .set({ brandId: null })
      .where(eq(products.id, BigInt(productId)));
  }

  // ── Admin Suppliers ──

  async getAllSuppliersAdmin(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }) {
    const search = params?.search?.trim();
    const conditions = [isNull(suppliers.deletedAt)];
    if (search) conditions.push(ilike(suppliers.legalName, `%${search}%`));

    let query: any = this.drizzleService.db
      .select({
        id: suppliers.id,
        code: suppliers.code,
        legalName: suppliers.legalName,
        taxId: suppliers.taxId,
        contactName: suppliers.contactName,
        email: suppliers.email,
        phone: suppliers.phone,
        address: suppliers.address,
        city: suppliers.city,
        country: suppliers.country,
        website: suppliers.website,
        paymentTermsDays: suppliers.paymentTermsDays,
        currencyCode: suppliers.currencyCode,
        notes: suppliers.notes,
        isActive: suppliers.isActive,
        createdAt: suppliers.createdAt,
        productCount: sql<number>`count(DISTINCT ${supplierProducts.productVariantId})`,
      })
      .from(suppliers)
      .leftJoin(supplierProducts, eq(supplierProducts.supplierId, suppliers.id))
      .where(and(...conditions))
      .groupBy(
        suppliers.id,
        suppliers.code,
        suppliers.legalName,
        suppliers.taxId,
        suppliers.contactName,
        suppliers.email,
        suppliers.phone,
        suppliers.address,
        suppliers.city,
        suppliers.country,
        suppliers.website,
        suppliers.paymentTermsDays,
        suppliers.currencyCode,
        suppliers.notes,
        suppliers.isActive,
        suppliers.createdAt,
      )
      .orderBy(asc(suppliers.legalName));

    if (typeof params?.limit === 'number') query = query.limit(params.limit);
    if (typeof params?.offset === 'number') query = query.offset(params.offset);

    const rows = (await query) as Array<any>;

    return rows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      legalName: row.legalName,
      taxId: row.taxId,
      contactName: row.contactName,
      email: row.email,
      phone: row.phone,
      address: row.address,
      city: row.city,
      country: row.country,
      website: row.website,
      paymentTermsDays: row.paymentTermsDays,
      currencyCode: row.currencyCode,
      notes: row.notes,
      isActive: row.isActive,
      createdAt: row.createdAt,
      productCount: Number(row.productCount),
    }));
  }

  async createSupplier(body: {
    legalName: string;
    code?: string;
    taxId?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    website?: string;
    paymentTermsDays?: number;
    currencyCode?: string;
    notes?: string;
  }) {
    const [result] = await this.drizzleService.db
      .insert(suppliers)
      .values({
        legalName: body.legalName,
        code: body.code ?? null,
        taxId: body.taxId ?? null,
        contactName: body.contactName ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        country: body.country ?? null,
        website: body.website ?? null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        currencyCode: body.currencyCode ?? null,
        notes: body.notes ?? null,
        isActive: true,
      })
      .returning({ id: suppliers.id });

    return { id: Number(result.id) };
  }

  async updateSupplier(
    id: number,
    body: {
      legalName?: string;
      code?: string | null;
      taxId?: string | null;
      contactName?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      city?: string | null;
      country?: string | null;
      website?: string | null;
      paymentTermsDays?: number | null;
      currencyCode?: string | null;
      notes?: string | null;
      isActive?: boolean;
    },
  ) {
    const updateData: Record<string, any> = {};
    if (body.legalName !== undefined) updateData.legalName = body.legalName;
    if (body.code !== undefined) updateData.code = body.code;
    if (body.taxId !== undefined) updateData.taxId = body.taxId;
    if (body.contactName !== undefined)
      updateData.contactName = body.contactName;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.city !== undefined) updateData.city = body.city;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.website !== undefined) updateData.website = body.website;
    if (body.paymentTermsDays !== undefined)
      updateData.paymentTermsDays = body.paymentTermsDays;
    if (body.currencyCode !== undefined)
      updateData.currencyCode = body.currencyCode;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    updateData.updatedAt = new Date().toISOString();

    await this.drizzleService.db
      .update(suppliers)
      .set(updateData)
      .where(eq(suppliers.id, BigInt(id)));

    return { id };
  }

  async deleteSupplier(id: number) {
    await this.drizzleService.db
      .update(suppliers)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(suppliers.id, BigInt(id)));
  }

  // ── Product-Supplier relations ──

  async getProductSuppliers(productId: number) {
    const rows = await this.drizzleService.db
      .select({
        supplierId: suppliers.id,
        supplierName: suppliers.legalName,
        supplierCode: suppliers.code,
        supplierSku: supplierProducts.supplierSku,
        purchasePrice: supplierProducts.purchasePrice,
        leadTimeDays: supplierProducts.leadTimeDays,
        isPreferred: supplierProducts.isPreferred,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .innerJoin(
        productVariants,
        eq(productVariants.id, supplierProducts.productVariantId),
      )
      .where(
        and(
          eq(productVariants.productId, productId),
          eq(suppliers.isActive, true),
          isNull(suppliers.deletedAt),
        ),
      )
      .orderBy(asc(suppliers.legalName));

    return rows.map((row) => ({
      supplierId: Number(row.supplierId),
      supplierName: row.supplierName,
      supplierCode: row.supplierCode,
      supplierSku: row.supplierSku,
      purchasePrice: row.purchasePrice,
      leadTimeDays: row.leadTimeDays,
      isPreferred: row.isPreferred,
    }));
  }

  async addSupplierToProduct(productId: number, supplierId: number) {
    const [variant] = await this.drizzleService.db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .limit(1);

    if (!variant) return { success: false };

    await this.drizzleService.db
      .insert(supplierProducts)
      .values({
        supplierId,
        productVariantId: Number(variant.id),
      })
      .onConflictDoNothing();

    return { success: true };
  }

  async removeSupplierFromProduct(productId: number, supplierId: number) {
    const [variant] = await this.drizzleService.db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .limit(1);

    if (!variant) return;

    await this.drizzleService.db
      .delete(supplierProducts)
      .where(
        and(
          eq(supplierProducts.supplierId, supplierId),
          eq(supplierProducts.productVariantId, Number(variant.id)),
        ),
      );
  }

  async getSupplierProducts(supplierId: number) {
    const rows = await this.drizzleService.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        price: productVariants.currentPrice,
        image: media.path,
        productTypeCode: productTypes.code,
      })
      .from(supplierProducts)
      .innerJoin(
        productVariants,
        eq(productVariants.id, supplierProducts.productVariantId),
      )
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productId, products.id),
      )
      .leftJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .where(
        and(
          eq(supplierProducts.supplierId, supplierId),
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .orderBy(asc(products.name));

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      price: Number(row.price ?? 0),
      image: row.image,
      productTypeCode: row.productTypeCode,
    }));
  }

  async getProductTypes() {
    const rows = await this.drizzleService.db
      .select({
        id: productTypes.id,
        code: productTypes.code,
        name: productTypes.name,
        description: productTypes.description,
        imagePath: media.path,
        count: sql<number>`count(DISTINCT ${products.id})`,
      })
      .from(productTypes)
      .leftJoin(media, eq(productTypes.imageMediaId, media.id))
      .innerJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productTypeId, productTypes.id),
      )
      .innerJoin(products, eq(products.id, productTypeAssignments.productId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(productTypes.isActive, true),
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .groupBy(
        productTypes.id,
        productTypes.code,
        productTypes.name,
        productTypes.description,
        media.path,
      )
      .having(sql`count(DISTINCT ${products.id}) > 0`)
      .orderBy(asc(productTypes.name));

    return rows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      description: row.description,
      imagePath: row.imagePath,
      count: Number(row.count),
    }));
  }

  async getProductsCount(
    unbranded?: boolean,
    unsupplied?: boolean,
  ): Promise<{ total: number }> {
    const conditions: any[] = [
      eq(products.isActive, true),
      isNull(products.deletedAt),
      eq(productVariants.isActive, true),
      isNull(productVariants.deletedAt),
    ];

    if (unbranded) {
      conditions.push(sql`${products.brandId} IS NULL`);
    }

    if (unsupplied) {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM supplier_products sp INNER JOIN product_variants pv ON pv.id = sp.product_variant_id WHERE pv.product_id = ${products.id})`,
      );
    }

    const rows = await this.drizzleService.db
      .select({
        count: sql<number>`count(DISTINCT ${products.id})`.as('count'),
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(and(...conditions));
    return { total: Number(rows[0]?.count ?? 0) };
  }

  async createProduct(dto: CreateProductDto) {
    const slug =
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
      '-' +
      Date.now().toString(36);

    const sku = dto.sku || `SKU-${Date.now().toString(36).toUpperCase()}`;

    const result = await this.drizzleService.transaction(async (tx) => {
      const insertedProduct = await tx
        .insert(products)
        .values({
          name: dto.name,
          slug,
          description: dto.description ?? null,
          brandId: dto.brandId ?? null,
          isActive: dto.isActive ?? true,
          isPublic: dto.isPublic ?? true,
          featured: dto.isFeatured ?? false,
        })
        .returning({ id: products.id });

      const productId = Number(insertedProduct[0].id);

      await tx.insert(productVariants).values({
        productId,
        sku,
        barcode: dto.barcode ?? null,
        currentPrice: String(dto.price),
        currentComparePrice: dto.originalPrice
          ? String(dto.originalPrice)
          : null,
        isActive: true,
      });

      // Save image if provided
      if (dto.image) {
        const insertedMedia = await tx
          .insert(media)
          .values({
            path: dto.image,
            fileName:
              dto.image.split('/').pop()?.substring(0, 50) ?? 'uploaded_image',
            mimeType: dto.image.startsWith('data:')
              ? dto.image.split(';')[0].split(':')[1]
              : 'image/jpeg',
            mediaType: 'image',
            sizeBytes: 0,
            checksum: dto.image.substring(0, 64),
          })
          .returning({ id: media.id });

        const mediaId = Number(insertedMedia[0].id);

        await tx.insert(productImages).values({
          productId,
          mediaId,
          isCover: true,
          position: 0,
        });
      }

      // Assign category if provided
      if (dto.categoryId) {
        await tx.insert(productCategories).values({
          productId,
          categoryId: dto.categoryId,
        });
      }

      return { id: productId, slug, sku };
    });

    return result;
  }

  async updateProduct(id: number, dto: CreateProductDto) {
    const pid = id;

    await this.drizzleService.transaction(async (tx) => {
      await tx
        .update(products)
        .set({
          name: dto.name,
          description: dto.description ?? null,
          brandId: dto.brandId ?? null,
          isActive: dto.isActive ?? true,
          isPublic: dto.isPublic ?? true,
          featured: dto.isFeatured ?? false,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(products.id, BigInt(pid)));

      const variants = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, pid))
        .limit(1);

      if (variants.length > 0) {
        await tx
          .update(productVariants)
          .set({
            sku: dto.sku ?? productVariants.sku,
            barcode: dto.barcode ?? null,
            currentPrice: String(dto.price),
            currentComparePrice: dto.originalPrice
              ? String(dto.originalPrice)
              : null,
          })
          .where(eq(productVariants.id, BigInt(variants[0].id)));
      }

      if (dto.image) {
        const existingImage = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(
            and(
              eq(productImages.productId, pid),
              eq(productImages.isCover, true),
            ),
          )
          .limit(1);

        const insertedMedia = await tx
          .insert(media)
          .values({
            path: dto.image,
            fileName:
              dto.image.split('/').pop()?.substring(0, 50) ?? 'updated_image',
            mimeType: dto.image.startsWith('data:')
              ? dto.image.split(';')[0].split(':')[1]
              : 'image/jpeg',
            mediaType: 'image',
            sizeBytes: 0,
            checksum: dto.image.substring(0, 64),
          })
          .returning({ id: media.id });

        const mediaId = Number(insertedMedia[0].id);

        if (existingImage.length > 0) {
          await tx
            .update(productImages)
            .set({ mediaId, updatedAt: new Date().toISOString() })
            .where(eq(productImages.id, BigInt(existingImage[0].id)));
        } else {
          await tx.insert(productImages).values({
            productId: pid,
            mediaId,
            isCover: true,
            position: 0,
          });
        }
      }

      // Update category if provided
      if (dto.categoryId !== undefined) {
        await tx
          .delete(productCategories)
          .where(eq(productCategories.productId, pid));
        if (dto.categoryId) {
          await tx.insert(productCategories).values({
            productId: pid,
            categoryId: dto.categoryId,
          });
        }
      }
    });

    return { id };
  }

  async getProducts(
    query: CatalogProductsQueryDto,
  ): Promise<CatalogProductResponse[]> {
    const normalizedCategories = query.categories?.filter(Boolean) ?? [];
    const normalizedCategoryIds =
      query.categoryIds?.filter((id) => Number.isFinite(id)) ?? [];
    const normalizedProductIds =
      query.productIds?.filter((id) => Number.isFinite(id)) ?? [];
    const search = query.search?.trim();
    const sort = query.sort ?? 'relevancia';
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);

    let allowedCategoryIds: number[] = [];

    if (normalizedCategories.length > 0 || normalizedCategoryIds.length > 0) {
      const categoryRows = await this.drizzleService.db
        .select({
          id: categories.id,
          parentId: categories.parentId,
          name: categories.name,
        })
        .from(categories)
        .where(
          and(eq(categories.isActive, true), isNull(categories.deletedAt)),
        );

      const normalizedSet = new Set(normalizedCategories);
      const normalizedIdSet = new Set(normalizedCategoryIds);
      const childrenByParentId = new Map<number, number[]>();

      for (const row of categoryRows) {
        const parentId = row.parentId ? Number(row.parentId) : null;
        if (parentId === null) continue;
        const current = childrenByParentId.get(parentId) ?? [];
        current.push(Number(row.id));
        childrenByParentId.set(parentId, current);
      }

      const rootIds = categoryRows
        .filter(
          (row) =>
            normalizedSet.has(row.name) || normalizedIdSet.has(Number(row.id)),
        )
        .map((row) => Number(row.id));

      const collectedIds = new Set<number>();
      const stack = [...rootIds];

      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (collectedIds.has(currentId)) continue;
        collectedIds.add(currentId);

        for (const childId of childrenByParentId.get(currentId) ?? []) {
          stack.push(childId);
        }
      }

      allowedCategoryIds = Array.from(collectedIds);
    }

    const allowedCategoryBigIntIds = allowedCategoryIds.map((id) => BigInt(id));

    // Búsqueda tolerante a errores y por palabras.
    //   1) Full-text (tsvector/tsquery en español + immutable_unaccent):
    //      insensible a tildes/ñ, con stemming y palabras en cualquier orden.
    //      immutable_unaccent() es un wrapper IMMUTABLE de unaccent() para poder
    //      indexarlo (unaccent() es STABLE y no indexa). Ver db/docker/init.sql.
    //   2) Fuzzy por palabra (pg_trgm / strict_word_similarity): tolera tipeos.
    //   3) Códigos (plu/barcode/externalId): lookup exacto por ILIKE.
    //
    // Semántica OR: basta con que coincida UNA palabra de la frase, así "ads
    // asd" devuelve los productos que matcheen cualquiera de las dos (antes se
    // exigían TODAS y las frases no encontraban nada).
    //
    // Costo: el tsvector se evalúa UNA sola vez por fila (los tsquery de cada
    // palabra se combinan con `||`) y el orden ya NO vuelve a tocar el tsvector;
    // usa señales baratas sobre el nombre. Cada referencia extra al tsvector
    // multiplica el tiempo, porque es un seq scan de ~11k filas.
    const searchTokens = Array.from(
      new Set(search?.split(/\s+/).filter(Boolean) ?? []),
    ).slice(0, 8);
    // Normalizados (sin tildes, minúsculas) para full-text, difuso y nombre.
    const normalizedTokens = searchTokens
      .map((t) =>
        t
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase(),
      )
      .filter(Boolean);
    const fuzzyTokens = normalizedTokens.filter((t) => t.length >= 3);
    // Tokens sin comodines, para patrones LIKE.
    const likeTokens = normalizedTokens
      .map((t) => t.replace(/[%_\\]/g, ''))
      .filter(Boolean);

    const searchDoc = search
      ? sql`to_tsvector('spanish'::regconfig, public.immutable_unaccent(${products.name} || ' ' || COALESCE(${products.description}, '')))`
      : undefined;
    const productName = sql`unaccent(lower(${products.name}))`;

    // 1) Full-text por palabra: los tsquery se unen con OR (`||`) y se evalúan
    //    contra un único tsvector. plainto_tsquery() por token es seguro ante
    //    caracteres raros y descarta stopwords ('de', 'la', ...).
    const tokenTsQueries = searchTokens.map(
      (token) =>
        sql`plainto_tsquery('spanish'::regconfig, public.immutable_unaccent(${token}))`,
    );
    const anyTokenFts =
      searchDoc && tokenTsQueries.length > 0
        ? sql`${searchDoc} @@ (${sql.join(tokenTsQueries, sql` || `)})`
        : undefined;

    // 2) Difuso por palabra (tolera tipeos): basta con que coincida UNA.
    // Se compara contra el NOMBRE (no la descripción): la similitud de trigramas
    // sobre textos largos es lo más caro del seq scan. strict_word_similarity
    // exige coincidencia con una palabra completa y separa mejor los tipeos
    // reales (≥0.44) de los falsos positivos (≤0.22).
    const fuzzyTokenMatches = fuzzyTokens
      .slice(0, 5)
      .map((token) => sql`strict_word_similarity(${token}, ${productName}) > 0.35`);
    const anyTokenFuzzy =
      fuzzyTokenMatches.length > 0 ? or(...fuzzyTokenMatches) : undefined;

    // 3) Códigos (plu/barcode/externalId): lookup exacto por ILIKE.
    const codeMatch = search
      ? sql`(unaccent(${products.plu}) ILIKE unaccent(${`%${search}%`}) OR unaccent(${productVariants.barcode}) ILIKE unaccent(${`%${search}%`}) OR unaccent(${products.externalId}) ILIKE unaccent(${`%${search}%`}))`
      : undefined;

    // El producto aparece si coincide alguna palabra (full-text o difuso) o un
    // código.
    const searchCondition =
      search && codeMatch
        ? or(anyTokenFts, anyTokenFuzzy, codeMatch)
        : undefined;

    // Relevancia (sin volver a tocar el tsvector): por cada palabra se premia,
    // de mayor a menor, que inicie el nombre, que sea una palabra completa, que
    // inicie una palabra y, por último, que aparezca en cualquier parte. A igual
    // puntaje se ordena alfabéticamente (ver searchOrder).
    const paddedName = sql`(' ' || ${productName} || ' ')`;
    const rankTokens = likeTokens.slice(0, 4);
    const relevanceParts = [
      ...rankTokens.map(
        (token) =>
          sql`(CASE WHEN ${productName} ILIKE ${`${token}%`} THEN 0.8 ELSE 0 END)`,
      ),
      ...rankTokens.map(
        (token) =>
          sql`(CASE WHEN ${paddedName} ILIKE ${`% ${token} %`} THEN 1.0 ELSE 0 END)`,
      ),
      ...rankTokens.map(
        (token) =>
          sql`(CASE WHEN ${paddedName} ILIKE ${`% ${token}%`} THEN 0.4 ELSE 0 END)`,
      ),
      ...rankTokens.map(
        (token) =>
          sql`(CASE WHEN ${productName} ILIKE ${`%${token}%`} THEN 0.15 ELSE 0 END)`,
      ),
      sql`(CASE WHEN ${codeMatch} THEN 1.5 ELSE 0 END)`,
      sql`(CASE WHEN ${products.featured} THEN 0.05 ELSE 0 END)`,
    ];

    const searchRelevance = search
      ? sql`(${sql.join(relevanceParts, sql` + `)})`
      : undefined;

    const searchOrder = searchRelevance
      ? sql`${searchRelevance} DESC, ${products.name} ASC, ${products.id} ASC`
      : undefined;

    // Cuando se pide un conjunto explícito de productos (p. ej. un banner),
    // se preserva el orden elegido por el usuario y se ignoran los demás ordenes.
    const productIdsOrder =
      normalizedProductIds.length > 0
        ? sql`array_position(ARRAY[${sql.join(
            normalizedProductIds.map((id) => sql`${BigInt(id)}`),
            sql`, `,
          )}]::bigint[], ${products.id})`
        : undefined;

    const orderBy = productIdsOrder
      ? [productIdsOrder]
      : searchOrder
        ? [searchOrder]
        : this.buildSort(sort);

    const rows = await this.drizzleService.db
      .select({
        id: products.id,
        externalId: products.externalId,
        slug: products.slug,
        name: products.name,
        description: products.description,
        isActive: products.isActive,
        isFeatured: products.featured,
        isPublic: products.isPublic,
        categoryId: categories.id,
        categoryName: categories.name,
        brandId: products.brandId,
        brandName: brands.name,
        price: productVariants.currentPrice,
        originalPrice: productVariants.currentComparePrice,
        image: media.path,
        productTypeCode: productTypes.code,
        productTypeName: productTypes.name,
        plu: products.plu,
        barcode: productVariants.barcode,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(productCategories, eq(productCategories.productId, products.id))
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productId, products.id),
      )
      .leftJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .where(
        and(
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
          allowedCategoryBigIntIds.length > 0
            ? inArray(categories.id, allowedCategoryBigIntIds)
            : normalizedCategories.length > 0 ||
                normalizedCategoryIds.length > 0
              ? sql`1 = 0`
              : undefined,
          query.isActive !== undefined
            ? eq(products.isActive, query.isActive)
            : undefined,
          query.priceMin !== undefined
            ? gte(productVariants.currentPrice, String(query.priceMin))
            : undefined,
          query.priceMax !== undefined
            ? lte(productVariants.currentPrice, String(query.priceMax))
            : undefined,
          query.onSale
            ? sql`${productVariants.currentComparePrice} IS NOT NULL`
            : undefined,
          query.brandId ? eq(products.brandId, query.brandId) : undefined,
          query.branchId
            ? sql`EXISTS (SELECT 1 FROM branch_products bp WHERE bp.product_id = ${products.id} AND bp.branch_id = ${query.branchId} AND bp.is_available = true)`
            : undefined,
          normalizedProductIds.length > 0
            ? inArray(
                products.id,
                normalizedProductIds.map((id) => BigInt(id)),
              )
            : undefined,
          query.productTypeCode
            ? eq(productTypes.code, query.productTypeCode)
            : undefined,
          searchCondition,
          this.buildPriceRangeCondition(query.priceRange),
          query.uncategorized
            ? sql`NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = ${products.id})`
            : undefined,
          query.unbranded ? sql`${products.brandId} IS NULL` : undefined,
          query.unsupplied
            ? sql`NOT EXISTS (SELECT 1 FROM supplier_products sp2 INNER JOIN product_variants pv2 ON pv2.id = sp2.product_variant_id WHERE pv2.product_id = ${products.id})`
            : undefined,
        ),
      )
      .orderBy(...orderBy)
      .limit(limit * 3)
      .offset(offset);

    // Deduplicate by product ID (LEFT JOINs on categories/type can duplicate rows)
    const uniqueProducts = new Map<number, CatalogProductResponse>();
    const productIds: number[] = [];

    for (const row of rows) {
      const productId = Number(row.id);
      if (uniqueProducts.has(productId)) continue;

      const price = Number(row.price ?? 0);
      const originalPrice = row.originalPrice
        ? Number(row.originalPrice)
        : undefined;

      uniqueProducts.set(productId, {
        id: productId,
        externalId: row.externalId,
        slug: row.slug,
        name: row.name,
        description: row.description,
        price,
        ...(originalPrice ? { originalPrice } : {}),
        image: row.image,
        images: row.image ? [row.image] : [],
        category: row.categoryName ?? '',
        categoryId: row.categoryId ? Number(row.categoryId) : 0,
        brandId: row.brandId ? Number(row.brandId) : null,
        brandName: row.brandName ?? null,
        plu: row.plu ?? null,
        barcode: row.barcode ?? null,
        productTypeCode: row.productTypeCode,
        productTypeName: row.productTypeName,
        isActive: row.isActive,
        isFeatured: row.isFeatured,
        isPublic: row.isPublic,
        stock: 0,
      });
      productIds.push(productId);

      // Stop when we have enough unique products for the original limit
      if (productIds.length >= limit) break;
    }

    if (productIds.length === 0) {
      return [];
    }

    // Load images for all returned products

    const imageRows = await this.drizzleService.db
      .select({
        productId: productImages.productId,
        image: media.path,
        position: productImages.position,
      })
      .from(productImages)
      .innerJoin(media, eq(media.id, productImages.mediaId))
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.productId), asc(productImages.position));

    const imagesByProduct = new Map<number, string[]>();
    for (const row of imageRows) {
      if (!row.image) continue;
      const productId = Number(row.productId);
      const current = imagesByProduct.get(productId) ?? [];
      current.push(row.image);
      imagesByProduct.set(productId, current);
    }

    // Merge images into already-deduplicated products
    for (const [pid, product] of uniqueProducts) {
      const imgs = imagesByProduct.get(pid);
      if (imgs && imgs.length > 0) {
        product.images = imgs;
      }
    }

    // Total stock across all branches and variants (inventario agregado)
    const stockRows = await this.drizzleService.db
      .select({
        productId: productVariants.productId,
        totalStock: sql<number>`COALESCE(SUM(${inventory.stock}), 0)`,
      })
      .from(inventory)
      .innerJoin(
        productVariants,
        eq(productVariants.id, inventory.productVariantId),
      )
      .where(inArray(productVariants.productId, productIds))
      .groupBy(productVariants.productId);

    const stockByProduct = new Map<number, number>();
    for (const row of stockRows) {
      stockByProduct.set(Number(row.productId), Number(row.totalStock ?? 0));
    }

    for (const [pid, product] of uniqueProducts) {
      product.stock = stockByProduct.get(pid) ?? 0;
    }

    return Array.from(uniqueProducts.values());
  }

  /**
   * Productos relacionados con `productId`: mismos por categoría, y si hacen
   * falta, por la misma marca. El esquema no tiene tabla de "relacionados",
   * así que se derivan dinámicamente.
   */
  // ── Product detail (vista cliente) ──

  async getProductDetail(productId: number) {
    const db = this.drizzleService.db;

    const [p] = await db
      .select({
        id: products.id,
        externalId: products.externalId,
        slug: products.slug,
        name: products.name,
        description: products.description,
        brandId: products.brandId,
        brandName: brands.name,
        plu: products.plu,
        manufacturer: products.manufacturer,
        isActive: products.isActive,
        isFeatured: products.featured,
        isPublic: products.isPublic,
      })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(eq(products.id, BigInt(productId)), isNull(products.deletedAt)))
      .limit(1);

    if (!p) return null;

    const [v] = await db
      .select({
        barcode: productVariants.barcode,
        price: productVariants.currentPrice,
        comparePrice: productVariants.currentComparePrice,
        lengthMm: productVariants.lengthMm,
        widthMm: productVariants.widthMm,
        heightMm: productVariants.heightMm,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          isNull(productVariants.deletedAt),
        ),
      )
      .limit(1);

    const attrRows = await db
      .select({ name: attributes.name, value: productAttributes.customValue })
      .from(productAttributes)
      .innerJoin(attributes, eq(attributes.id, productAttributes.attributeId))
      .where(eq(productAttributes.productId, productId));

    const [cat] = await db
      .select({ id: categories.id, name: categories.name })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(eq(productCategories.productId, productId))
      .limit(1);

    const [pt] = await db
      .select({ code: productTypes.code, name: productTypes.name })
      .from(productTypeAssignments)
      .innerJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .where(eq(productTypeAssignments.productId, productId))
      .limit(1);

    const [stockRow] = await db
      .select({ stock: sql<number>`COALESCE(SUM(${inventory.stock}), 0)` })
      .from(inventory)
      .innerJoin(
        productVariants,
        eq(productVariants.id, inventory.productVariantId),
      )
      .where(eq(productVariants.productId, productId));

    const dimensions =
      v && (v.lengthMm || v.widthMm || v.heightMm)
        ? { lengthMm: v.lengthMm, widthMm: v.widthMm, heightMm: v.heightMm }
        : null;

    return {
      id: Number(p.id),
      externalId: p.externalId,
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: Number(v?.price ?? 0),
      originalPrice:
        v?.comparePrice != null ? Number(v.comparePrice) : undefined,
      image: null as string | null,
      images: [] as string[],
      category: cat?.name ?? 'Sin categoría',
      categoryId: cat ? Number(cat.id) : 0,
      brandId: p.brandId ? Number(p.brandId) : null,
      brandName: p.brandName ?? null,
      plu: p.plu,
      barcode: v?.barcode ?? null,
      productTypeCode: pt?.code ?? null,
      productTypeName: pt?.name ?? null,
      manufacturer: p.manufacturer ?? null,
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      isPublic: p.isPublic,
      stock: Number(stockRow?.stock ?? 0),
      attributes: attrRows
        .map((a) => ({ name: a.name, value: a.value ?? '' }))
        .filter((a) => a.value),
      dimensions,
    };
  }

  async getRelatedProducts(
    productId: number,
    limit = 8,
  ): Promise<CatalogProductResponse[]> {
    const catRows = await this.drizzleService.db
      .select({ categoryId: productCategories.categoryId })
      .from(productCategories)
      .where(eq(productCategories.productId, productId));
    const categoryIds = catRows.map((r) => Number(r.categoryId));

    // El tipo de producto (p. ej. "Lácteos", "Despensa") es el agrupamiento
    // fiable; las categorías de este catálogo están muy mezcladas, así que se
    // usan solo como relleno.
    const typeRows = await this.drizzleService.db
      .select({ productTypeId: productTypeAssignments.productTypeId })
      .from(productTypeAssignments)
      .where(eq(productTypeAssignments.productId, productId));
    const typeIds = typeRows.map((r) => Number(r.productTypeId));

    const [prod] = await this.drizzleService.db
      .select({ brandId: products.brandId, name: products.name })
      .from(products)
      .where(eq(products.id, BigInt(productId)))
      .limit(1);
    const brandId = prod?.brandId ? Number(prod.brandId) : null;
    const originalName = prod?.name ?? '';

    const rows = await this.drizzleService.db
      .select({
        id: products.id,
        externalId: products.externalId,
        slug: products.slug,
        name: products.name,
        description: products.description,
        brandId: products.brandId,
        brandName: brands.name,
        price: productVariants.currentPrice,
        originalPrice: productVariants.currentComparePrice,
        image: media.path,
        categoryId: categories.id,
        categoryName: categories.name,
        productTypeId: productTypeAssignments.productTypeId,
        productTypeCode: productTypes.code,
        productTypeName: productTypes.name,
        plu: products.plu,
        barcode: productVariants.barcode,
        // Relevancia por similitud de nombre (pg_trgm).
        score: sql<number>`similarity(${products.name}, ${originalName})`,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(productCategories, eq(productCategories.productId, products.id))
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productId, products.id),
      )
      .leftJoin(productTypes, eq(productTypes.id, productTypeAssignments.productTypeId))
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .where(
        and(
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
          ne(products.id, BigInt(productId)),
          or(
            typeIds.length
              ? inArray(productTypeAssignments.productTypeId, typeIds)
              : undefined,
            categoryIds.length
              ? inArray(productCategories.categoryId, categoryIds)
              : undefined,
            brandId != null ? eq(products.brandId, brandId) : undefined,
          ),
        ),
      )
      .orderBy(asc(products.name))
      .limit(200);

    // Prioridad: mismo tipo de producto (0) > misma categoría (1) > misma
    // marca (2). Dentro de cada nivel, más parecido el nombre, primero.
    const typeSet = new Set(typeIds);
    const catSet = new Set(categoryIds);
    const unique = new Map<
      number,
      { priority: number; score: number; product: CatalogProductResponse }
    >();
    for (const row of rows) {
      const id = Number(row.id);
      const score = Number(row.score ?? 0);
      const existing = unique.get(id);
      if (existing) {
        if (score > existing.score) existing.score = score;
        continue;
      }
      const priority =
        row.productTypeId != null && typeSet.has(Number(row.productTypeId))
          ? 0
          : row.categoryId != null && catSet.has(Number(row.categoryId))
            ? 1
            : 2;
      unique.set(id, {
        priority,
        score,
        product: {
          id,
          externalId: row.externalId,
          slug: row.slug,
          name: row.name,
          description: row.description,
          price: Number(row.price ?? 0),
          ...(row.originalPrice
            ? { originalPrice: Number(row.originalPrice) }
            : {}),
          image: row.image,
          images: row.image ? [row.image] : [],
          category: row.categoryName ?? '',
          categoryId: row.categoryId ? Number(row.categoryId) : 0,
          brandId: row.brandId ? Number(row.brandId) : null,
          brandName: row.brandName ?? null,
          plu: row.plu ?? null,
          barcode: row.barcode ?? null,
          productTypeCode: row.productTypeCode,
          productTypeName: row.productTypeName,
          isActive: true,
          isFeatured: false,
          isPublic: true,
          stock: 0,
        },
      });
    }

    return Array.from(unique.values())
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          b.score - a.score ||
          a.product.name.localeCompare(b.product.name),
      )
      .slice(0, limit)
      .map((entry) => entry.product);
  }

  async exportProducts(res: Response) {
    const allProducts = await this.drizzleService.db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        sku: productVariants.sku,
        barcode: productVariants.barcode,
        price: productVariants.currentPrice,
        originalPrice: productVariants.currentComparePrice,
        isActive: products.isActive,
        isFeatured: products.featured,
        isPublic: products.isPublic,
        productType: productTypes.name,
        category: categories.name,
        brand: brands.name,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(productCategories, eq(productCategories.productId, products.id))
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productId, products.id),
      )
      .leftJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(eq(products.isActive, true), isNull(products.deletedAt)))
      .orderBy(asc(products.name));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Productos');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Nombre', key: 'name', width: 40 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Código de Barras', key: 'barcode', width: 18 },
      { header: 'Precio', key: 'price', width: 12 },
      { header: 'Precio Original', key: 'originalPrice', width: 14 },
      { header: 'Categoría', key: 'category', width: 20 },
      { header: 'Marca', key: 'brand', width: 20 },
      { header: 'Tipo', key: 'productType', width: 20 },
      { header: 'Activo', key: 'isActive', width: 10 },
      { header: 'Destacado', key: 'isFeatured', width: 12 },
      { header: 'Descripción', key: 'description', width: 50 },
    ];

    for (const p of allProducts) {
      sheet.addRow({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        price: p.price,
        originalPrice: p.originalPrice,
        category: p.category,
        brand: p.brand,
        productType: p.productType,
        isActive: p.isActive ? 'Sí' : 'No',
        isFeatured: p.isFeatured ? 'Sí' : 'No',
        description: p.description,
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=productos_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }

  async importProducts(file: any) {
    // Los JSON exportados de VISADS/Advantage vienen en Windows-1252; si se
    // leen como UTF-8, ñ/á/é/ú se vuelven U+FFFD. Se acepta UTF-8 válido si lo hay.
    let raw: string;
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      raw = new TextDecoder('windows-1252').decode(file.buffer);
    }
    const catalog = JSON.parse(raw) as { PRODUCTOS?: any[] };
    const sourceProducts = catalog.PRODUCTOS ?? [];

    let created = 0;
    let updated = 0;

    // Get default branch
    const branchRows = await this.drizzleService.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.isActive, true), isNull(branches.deletedAt)))
      .limit(1);
    const branchId = branchRows[0]?.id ?? null;

    if (!branchId)
      throw new BadRequestException(
        'No hay sucursal activa para asignar inventario',
      );

    for (const row of sourceProducts) {
      const codigo = (row.CODIGO as string)?.trim();
      const nombre = (row.NOMBRE as string)?.trim();
      const ean = (row.EAN as string)?.trim();
      const stock = parseInt(row.SALDO as string, 10) || 0;
      const currentPrice = parseInt(row.VENTA1 as string, 10) || 0;
      const comparePrice = parseInt(row.VENTA2 as string, 10) || undefined;
      const manufacturer = (row.MARCA as string)?.trim();

      if (!nombre || !codigo) continue;

      const slug = nombre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Upsert product
      const existingVariant = await this.drizzleService.db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
        })
        .from(productVariants)
        .where(eq(productVariants.sku, codigo))
        .limit(1);

      let productId: number;
      let variantId: number;

      if (existingVariant.length > 0) {
        variantId = Number(existingVariant[0].id);
        productId = Number(existingVariant[0].productId);

        await this.drizzleService.db
          .update(products)
          .set({
            name: nombre,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(products.id, BigInt(productId)));

        await this.drizzleService.db
          .update(productVariants)
          .set({
            currentPrice: String(currentPrice),
            currentComparePrice: comparePrice ? String(comparePrice) : null,
            barcode: ean || null,
          })
          .where(eq(productVariants.id, BigInt(variantId)));

        updated++;
      } else {
        const insertedProduct = await this.drizzleService.db
          .insert(products)
          .values({
            name: nombre,
            slug,
            externalId: codigo,
            isActive: true,
            featured: false,
            visibility: 'PUBLIC',
          })
          .returning({ id: products.id });

        productId = Number(insertedProduct[0].id);

        const insertedVariant = await this.drizzleService.db
          .insert(productVariants)
          .values({
            productId,
            sku: codigo,
            barcode: ean || null,
            currentPrice: String(currentPrice),
            currentComparePrice: comparePrice ? String(comparePrice) : null,
            isActive: true,
          })
          .returning({ id: productVariants.id });

        variantId = Number(insertedVariant[0].id);

        created++;
      }

      // Upsert inventory
      const existingInv = await this.drizzleService.db
        .select({ id: inventory.id })
        .from(inventory)
        .where(
          and(
            eq(inventory.productVariantId, variantId),
            eq(inventory.branchId, Number(branchId)),
          ),
        )
        .limit(1);

      if (existingInv.length > 0) {
        await this.drizzleService.db
          .update(inventory)
          .set({ stock })
          .where(eq(inventory.id, BigInt(existingInv[0].id)));
      } else {
        await this.drizzleService.db.insert(inventory).values({
          productVariantId: variantId,
          branchId: Number(branchId),
          stock,
          reservedStock: 0,
          reorderPoint: 0,
          minimumStock: 0,
          maximumStock: 999999,
        });
      }
    }

    return { created, updated };
  }

  async getBranches() {
    const rows = await this.drizzleService.db
      .select({
        id: branches.id,
        name: branches.name,
        address: branches.address,
        city: branches.city,
        phone: branches.phone,
        email: branches.email,
        schedule: branches.schedule,
        location: branches.location,
        isActive: branches.isActive,
        priority: branches.priority,
        image: media.path,
      })
      .from(branches)
      .leftJoin(media, eq(branches.imageMediaId, media.id))
      .where(
        and(
          eq(branches.isActive, true),
          eq(branches.isVisible, true),
          isNull(branches.deletedAt),
        ),
      )
      .orderBy(asc(branches.priority));

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      address: row.address,
      city: row.city,
      phone: row.phone,
      email: row.email,
      schedule: row.schedule,
      location: row.location,
      isActive: row.isActive,
      priority: Number(row.priority ?? 0),
      image: row.image,
    }));
  }

  /* ── Resolución de productos por PLU (campañas / importación) ────── */

  /** Busca productos del catálogo por su PLU (activos). Devuelve los
   *  encontrados en la misma forma de GET /catalog/products y los PLU que no
   *  existen en el catálogo. */
  async resolveProductsByPlu(plus: string[]) {
    const codes = [
      ...new Set((plus ?? []).map((c) => String(c).trim()).filter(Boolean)),
    ];
    if (codes.length === 0) return { matched: [], missing: [] };
    if (codes.length > 5000)
      throw new BadRequestException('Máximo 5.000 PLUs por consulta');

    const rows = await this.drizzleService.db
      .select({
        id: products.id,
        externalId: products.externalId,
        slug: products.slug,
        name: products.name,
        description: products.description,
        isActive: products.isActive,
        isFeatured: products.featured,
        isPublic: products.isPublic,
        categoryId: categories.id,
        categoryName: categories.name,
        brandId: products.brandId,
        brandName: brands.name,
        price: productVariants.currentPrice,
        originalPrice: productVariants.currentComparePrice,
        image: media.path,
        productTypeCode: productTypes.code,
        productTypeName: productTypes.name,
        plu: products.plu,
        barcode: productVariants.barcode,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(productCategories, eq(productCategories.productId, products.id))
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productId, products.id),
      )
      .leftJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .where(
        and(
          inArray(products.plu, codes),
          eq(products.isActive, true),
          isNull(products.deletedAt),
          eq(productVariants.isActive, true),
          isNull(productVariants.deletedAt),
        ),
      )
      .orderBy(asc(products.name));

    const matched = new Map<number, CatalogProductResponse>();
    for (const row of rows) {
      const productId = Number(row.id);
      if (matched.has(productId)) continue; // LEFT JOINs pueden duplicar filas
      const price = Number(row.price ?? 0);
      const originalPrice = row.originalPrice
        ? Number(row.originalPrice)
        : undefined;
      matched.set(productId, {
        id: productId,
        externalId: row.externalId,
        slug: row.slug,
        name: row.name,
        description: row.description,
        price,
        ...(originalPrice ? { originalPrice } : {}),
        image: row.image,
        images: row.image ? [row.image] : [],
        category: row.categoryName ?? '',
        categoryId: row.categoryId ? Number(row.categoryId) : 0,
        brandId: row.brandId ? Number(row.brandId) : null,
        brandName: row.brandName ?? null,
        plu: row.plu ?? null,
        barcode: row.barcode ?? null,
        productTypeCode: row.productTypeCode,
        productTypeName: row.productTypeName,
        isActive: row.isActive,
        isFeatured: row.isFeatured,
        isPublic: row.isPublic,
        stock: 0,
      });
    }
    const found = new Set(
      [...matched.values()]
        .map((p) => p.plu)
        .filter((p): p is string => !!p),
    );
    return {
      matched: [...matched.values()],
      missing: codes.filter((c) => !found.has(c)),
    };
  }

  /** Extrae los códigos PLU de un archivo subido (JSON, CSV, XLSX o XLS) y los
   *  valida contra el catálogo. Devuelve los productos encontrados y los no
   *  existentes para mostrarlos en la UI. */
  async importPluFile(file: any) {
    if (!file?.buffer || file.buffer.length === 0)
      throw new BadRequestException('Archivo vacío');

    const name: string = file.originalname ?? 'archivo';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    let codes: string[] = [];

    if (ext === 'json') {
      let raw: string;
      try {
        raw = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
      } catch {
        raw = new TextDecoder('windows-1252').decode(file.buffer);
      }
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new BadRequestException('El archivo JSON no es válido');
      }
      codes = this.pluCodesFromJson(data);
    } else if (ext === 'csv') {
      let raw: string;
      try {
        raw = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
      } catch {
        raw = new TextDecoder('windows-1252').decode(file.buffer);
      }
      codes = this.pluCodesFromRows(this.parseCsv(raw));
    } else if (ext === 'xlsx' || ext === 'xls') {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new BadRequestException('El archivo no tiene hojas');
        const rows: string[][] = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          // values puede venir como arreglo o como objeto por clave de columna.
          const vals: unknown[] = Array.isArray(row.values)
            ? row.values
            : Object.values(row.values ?? {});
          rows.push(vals.map((v) => (v == null ? '' : String(v).trim())));
        });
        codes = this.pluCodesFromRows(rows);
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        if (ext === 'xls')
          throw new BadRequestException(
            'No se pudo leer el .xls (formato Excel antiguo). Guárdalo como .xlsx o .csv y vuelve a intentarlo.',
          );
        throw new BadRequestException('No se pudo leer el archivo Excel');
      }
    } else {
      throw new BadRequestException(
        'Formato no soportado. Usa .json, .csv, .xls o .xlsx',
      );
    }

    const total = codes.length;
    const unique = [...new Set(codes)];
    const { matched, missing } = await this.resolveProductsByPlu(unique);
    return {
      fileName: name,
      total,
      duplicates: total - unique.length,
      matched,
      missing,
    };
  }

  /** Extrae códigos de un JSON: arreglo de strings o de objetos con clave PLU. */
  private pluCodesFromJson(data: unknown): string[] {
    let arr: unknown = data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      arr =
        o.PRODUCTOS ??
        o.productos ??
        o.plu ??
        o.PLU ??
        o.codigos ??
        o.codes ??
        o.plus ??
        [];
    }
    if (!Array.isArray(arr)) {
      throw new BadRequestException(
        'El JSON debe ser un arreglo de códigos o de objetos con la clave PLU/código',
      );
    }
    const out: string[] = [];
    for (const item of arr) {
      if (typeof item === 'string') {
        const t = item.trim();
        if (t) out.push(t);
        continue;
      }
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const key = Object.keys(o).find((k) => PLU_KEYS.has(normalizeKey(k)));
        const v = key ? o[key] : undefined;
        if (v != null) {
          const t = String(v).trim();
          if (t) out.push(t);
        }
      }
    }
    return out;
  }

  /** Detecta la columna de PLU en una hoja/CSV y devuelve los códigos. */
  private pluCodesFromRows(rows: string[][]): string[] {
    const limit = Math.min(rows.length, 10);
    let col = 0;
    let header = -1; // -1: no hay fila de encabezados
    for (let r = 0; r < limit; r++) {
      const idx = (rows[r] ?? []).findIndex((cell) =>
        !!cell && PLU_KEYS.has(normalizeKey(cell)),
      );
      if (idx >= 0) {
        col = idx;
        header = r;
        break;
      }
    }
    // Sin encabezado reconocido: primera columna; si la primera celda no es un
    // código numérico, se asume que es el encabezado y se omite.
    if (header < 0 && rows[0]?.[0] && !/^[\d\s]+$/.test(rows[0][0])) {
      header = 0;
    }
    const out: string[] = [];
    for (let r = header + 1; r < rows.length; r++) {
      const cell = (rows[r] ?? [])[col];
      if (cell != null) {
        const t = String(cell).trim();
        if (t && !/^[\s\-]+$/.test(t)) out.push(t);
      }
    }
    if (out.length === 0 && rows.length > 0) {
      throw new BadRequestException(
        'No se encontraron códigos: busca una columna llamada PLU, código o similar',
      );
    }
    return out;
  }

  /** Parser CSV sencillo (respeta comillas dobles y saltos dentro de campos). */
  private parseCsv(raw: string): string[][] {
    const rows: string[][] = [];
    let cur = '';
    let row: string[] = [];
    let inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inQuotes) {
        if (ch === '"') {
          if (raw[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        row.push(cur.trim());
        cur = '';
      } else if (ch === '\n') {
        row.push(cur.trim());
        cur = '';
        if (row.some((c) => c.length > 0)) rows.push(row);
        row = [];
      } else if (ch !== '\r') cur += ch;
    }
    row.push(cur.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
    return rows;
  }

  private buildPriceRangeCondition(priceRange?: string) {
    switch (priceRange) {
      case '0-10000':
        return sql`${productVariants.currentPrice} <= 10000`;
      case '10000-30000':
        return sql`${productVariants.currentPrice} > 10000 AND ${productVariants.currentPrice} <= 30000`;
      case '30000-70000':
        return sql`${productVariants.currentPrice} > 30000 AND ${productVariants.currentPrice} <= 70000`;
      case '70000+':
        return sql`${productVariants.currentPrice} > 70000`;
      default:
        return undefined;
    }
  }

  private buildSort(sort: string | undefined): ReturnType<typeof asc>[] {
    // El desempate por id mantiene la paginación estable cuando hay nombres o
    // precios repetidos (sin él, un mismo producto puede aparecer en dos páginas).
    const tieBreak = asc(products.id);
    switch (sort) {
      case 'precio-asc':
        return [asc(productVariants.currentPrice), asc(products.name), tieBreak];
      case 'precio-desc':
        return [desc(productVariants.currentPrice), asc(products.name), tieBreak];
      case 'descuento':
        return [desc(productVariants.currentComparePrice), asc(products.name), tieBreak];
      case 'nombre':
        return [asc(products.name), tieBreak];
      case 'nombre-desc':
        return [desc(products.name), tieBreak];
      case 'sku':
        return [asc(productVariants.sku), tieBreak];
      case 'relevancia':
      default:
        return [desc(products.featured), asc(products.name), tieBreak];
    }
  }

  // ── Favorites ──

  async getFavorites(customerId: number): Promise<CatalogProductResponse[]> {
    const rows = await this.drizzleService.db
      .select({
        id: products.id,
        externalId: products.externalId,
        slug: products.slug,
        name: products.name,
        description: products.description,
        price: productVariants.currentPrice,
        comparePrice: productVariants.currentComparePrice,
        image: media.path,
        categoryName: sql<string>`COALESCE(LEAF_CAT.cat_name, ROOT_CAT.name, 'Sin categoría')`,
        categoryId: sql<number>`COALESCE(LEAF_CAT.cat_id, ROOT_CAT.id, 0)`,
        brandId: products.brandId,
        brandName: brands.name,
        productTypeCode: productTypes.code,
        productTypeName: productTypes.name,
        isActive: products.isActive,
        isFeatured: products.featured,
        isPublic: products.isPublic,
        stock: inventory.stock,
      })
      .from(favorites)
      .innerJoin(products, eq(products.id, favorites.productId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(productCategories, eq(productCategories.productId, products.id))
      .leftJoin(
        sql`(
          SELECT pc.*, c.id AS cat_id, c.name AS cat_name, c.parent_id AS cat_parent_id
          FROM product_categories pc
          INNER JOIN categories c ON c.id = pc.category_id
          WHERE c.parent_id IS NOT NULL
        ) AS LEAF_CAT`,
        sql`LEAF_CAT.product_id = ${products.id}`,
      )
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .leftJoin(
        sql`categories AS ROOT_CAT`,
        sql`ROOT_CAT.id = COALESCE(LEAF_CAT.cat_parent_id, ${productCategories.categoryId})`,
      )
      .leftJoin(
        productTypeAssignments,
        eq(productTypeAssignments.productId, products.id),
      )
      .leftJoin(
        productTypes,
        eq(productTypes.id, productTypeAssignments.productTypeId),
      )
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(inventory, eq(inventory.productVariantId, productVariants.id))
      .where(
        and(
          eq(favorites.customerId, customerId),
          eq(products.isActive, true),
          isNull(products.deletedAt),
        ),
      )
      .orderBy(desc(favorites.createdAt), asc(products.name));

    return rows.map((row: any) => ({
      id: Number(row.id),
      externalId: row.externalId,
      slug: row.slug,
      name: row.name,
      description: row.description,
      price: Number(row.price ?? 0),
      originalPrice: row.comparePrice ? Number(row.comparePrice) : undefined,
      image: row.image,
      images: row.image ? [row.image] : [],
      category: row.categoryName,
      categoryId: Number(row.categoryId ?? 0),
      brandId: row.brandId ? Number(row.brandId) : null,
      brandName: row.brandName ?? null,
      plu: row.plu ?? null,
      barcode: row.barcode ?? null,
      productTypeCode: row.productTypeCode,
      productTypeName: row.productTypeName,
      isActive: row.isActive,
      isFeatured: Boolean(row.isFeatured),
      isPublic: row.isPublic,
      stock: Number(row.stock ?? 0),
    }));
  }

  async addFavorite(customerId: number, productId: number) {
    await this.drizzleService.db
      .insert(favorites)
      .values({ customerId, productId })
      .onConflictDoNothing();
  }

  async removeFavorite(customerId: number, productId: number) {
    await this.drizzleService.db
      .delete(favorites)
      .where(
        and(
          eq(favorites.customerId, customerId),
          eq(favorites.productId, productId),
        ),
      );
  }

  // ── Shopping Lists ──

  async getShoppingLists(customerId: number) {
    const lists = await this.drizzleService.db
      .select({
        id: shoppingLists.id,
        name: shoppingLists.name,
        createdAt: shoppingLists.createdAt,
      })
      .from(shoppingLists)
      .where(eq(shoppingLists.customerId, customerId))
      .orderBy(desc(shoppingLists.createdAt));

    // Get items for all lists
    const listIds = lists.map((l) => Number(l.id));
    if (listIds.length === 0) return [];

    const items = await this.drizzleService.db
      .select({
        listId: shoppingListItems.listId,
        productId: shoppingListItems.productId,
        quantity: shoppingListItems.quantity,
        productName: products.name,
        productPrice: productVariants.currentPrice,
        productImage: media.path,
        unit: sql<string>`${productVariants.sku}`,
      })
      .from(shoppingListItems)
      .innerJoin(products, eq(products.id, shoppingListItems.productId))
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.isCover, true),
        ),
      )
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .where(inArray(shoppingListItems.listId, listIds))
      .orderBy(asc(shoppingListItems.addedAt));

    return lists.map((list) => ({
      id: Number(list.id),
      name: list.name,
      createdAt: list.createdAt,
      items: items
        .filter((i) => Number(i.listId) === Number(list.id))
        .map((i) => ({
          productId: Number(i.productId),
          productName: i.productName,
          productPrice: Number(i.productPrice ?? 0),
          productImage: i.productImage,
          quantity: i.quantity,
        })),
    }));
  }

  async createShoppingList(customerId: number, name: string) {
    const [inserted] = await this.drizzleService.db
      .insert(shoppingLists)
      .values({ customerId, name })
      .returning({ id: shoppingLists.id });
    return { id: Number(inserted.id) };
  }

  async updateShoppingList(customerId: number, listId: number, name: string) {
    await this.drizzleService.db
      .update(shoppingLists)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(shoppingLists.id, BigInt(listId)),
          eq(shoppingLists.customerId, customerId),
        ),
      );
  }

  async deleteShoppingList(customerId: number, listId: number) {
    await this.drizzleService.db
      .delete(shoppingLists)
      .where(
        and(
          eq(shoppingLists.id, BigInt(listId)),
          eq(shoppingLists.customerId, customerId),
        ),
      );
  }

  async addToShoppingList(
    customerId: number,
    listId: number,
    productId: number,
    quantity = 1,
  ) {
    // Verify list ownership
    const [list] = await this.drizzleService.db
      .select({ id: shoppingLists.id })
      .from(shoppingLists)
      .where(
        and(
          eq(shoppingLists.id, BigInt(listId)),
          eq(shoppingLists.customerId, customerId),
        ),
      );

    if (!list) throw new Error('Lista no encontrada');

    // Check if product already in list
    const [existing] = await this.drizzleService.db
      .select({ id: shoppingListItems.id })
      .from(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.listId, listId),
          eq(shoppingListItems.productId, productId),
        ),
      );

    if (existing) {
      await this.drizzleService.db
        .update(shoppingListItems)
        .set({ quantity: sql`${shoppingListItems.quantity} + ${quantity}` })
        .where(
          and(
            eq(shoppingListItems.listId, listId),
            eq(shoppingListItems.productId, productId),
          ),
        );
    } else {
      await this.drizzleService.db
        .insert(shoppingListItems)
        .values({ listId, productId, quantity });
    }
  }

  async updateShoppingListItem(
    listId: number,
    productId: number,
    quantity: number,
  ) {
    if (quantity <= 0) {
      await this.drizzleService.db
        .delete(shoppingListItems)
        .where(
          and(
            eq(shoppingListItems.listId, listId),
            eq(shoppingListItems.productId, productId),
          ),
        );
    } else {
      await this.drizzleService.db
        .update(shoppingListItems)
        .set({ quantity })
        .where(
          and(
            eq(shoppingListItems.listId, listId),
            eq(shoppingListItems.productId, productId),
          ),
        );
    }
  }

  async removeShoppingListItem(listId: number, productId: number) {
    await this.drizzleService.db
      .delete(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.listId, listId),
          eq(shoppingListItems.productId, productId),
        ),
      );
  }
}
