const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export type CatalogProduct = {
  id: number;
  externalId?: string | null;
  slug?: string | null;
  name: string;
  description?: string | null;
  price: number;
  originalPrice?: number | null;
  image?: string | null;
  images?: string[];
  plu?: string | null;
  category: string;
  categoryId?: number | null;
  brandId?: number | null;
  brandName?: string | null;
  productTypeCode?: string | null;
  productTypeName?: string | null;
  badge?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  tags?: string[];
  stock?: number;
};

export type CatalogCategory = {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  icon?: any;
  color?: string;
  count: number;
  isActive: boolean;
};

export type Brand = {
  id: number;
  name: string;
  slug: string;
  code?: string | null;
  description: string | null;
  image: string | null;
  website: string | null;
};

export type ProductType = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  count: number;
};

export type ProductsQuery = {
  search?: string;
  categoryIds?: number[];
  brandId?: number;
  productTypeCode?: string;
  isActive?: boolean;
  priceMin?: number;
  priceMax?: number;
  onSale?: boolean;
  priceRange?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  uncategorized?: boolean;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

/** Resultado de validar/importar un archivo de PLUs contra el catálogo. */
export interface PluFileImportResult {
  fileName: string;
  total: number;
  duplicates: number;
  matched: CatalogProduct[];
  missing: string[];
}

/** Sube un archivo (JSON/CSV/XLSX/XLS) de PLUs y devuelve los productos
 *  encontrados y los no existentes (multipart: no fija Content-Type). */
async function uploadPluFile(file: File): Promise<PluFileImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/catalog/products/from-file`,
    { method: "POST", body: form, credentials: "include" },
  );
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.message === "string") message = data.message;
      else if (Array.isArray(data?.message)) message = data.message.join(", ");
    } catch {
      /* noop */
    }
    throw new Error(message);
  }
  return res.json();
}

export const catalogService = {
  async getProducts(params?: ProductsQuery): Promise<CatalogProduct[]> {
    return fetchJson<CatalogProduct[]>(`${API_BASE_URL}/catalog/products`, {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
  },

  async getProductsCount(): Promise<{ total: number }> {
    return fetchJson<{ total: number }>(
      `${API_BASE_URL}/catalog/products/count`,
    );
  },

  async getCategories(): Promise<CatalogCategory[]> {
    return fetchJson<CatalogCategory[]>(`${API_BASE_URL}/catalog/categories`);
  },

  async getBrands(): Promise<Brand[]> {
    return fetchJson<Brand[]>(`${API_BASE_URL}/catalog/brands`);
  },

  async getProductTypes(): Promise<ProductType[]> {
    return fetchJson<ProductType[]>(`${API_BASE_URL}/catalog/product-types`);
  },

  /** Valida un archivo de PLUs (JSON/CSV/XLSX/XLS) contra el catálogo. */
  importProductsFromFile: (file: File) => uploadPluFile(file),

  async getBranches(): Promise<
    { id: number; name: string; address: string }[]
  > {
    return fetchJson<{ id: number; name: string; address: string }[]>(
      `${API_BASE_URL}/catalog/branches`,
    );
  },

  // ── Admin Category CRUD ──

  async getCategoriesAdmin(): Promise<
    Array<{
      id: number;
      name: string;
      slug: string;
      code: string | null;
      parentId: number | null;
      displayOrder: number;
      description: string | null;
      metaTitle: string | null;
      metaDescription: string | null;
      isActive: boolean;
      level: number;
      createdAt: string;
      imagePath: string | null;
      productCount: number;
    }>
  > {
    return fetchJson(`${API_BASE_URL}/admin/catalog/categories`);
  },

  async createCategory(data: {
    name: string;
    code?: string;
    parentId?: number;
  }): Promise<{ id: number }> {
    return fetchJson(`${API_BASE_URL}/admin/catalog/categories`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCategory(
    id: number,
    data: {
      name?: string;
      code?: string | null;
      parentId?: number | null;
      description?: string | null;
      displayOrder?: number;
      metaTitle?: string | null;
      metaDescription?: string | null;
      isActive?: boolean;
      imageUrl?: string;
    },
  ): Promise<{ id: number }> {
    return fetchJson(`${API_BASE_URL}/admin/catalog/categories/${id}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async deleteCategory(id: number): Promise<void> {
    await fetch(`${API_BASE_URL}/admin/catalog/categories/${id}`, {
      method: "DELETE",
    });
  },

  async getUncategorizedProducts(
    offset = 0,
    limit = 20,
    search?: string,
  ): Promise<CatalogProduct[]> {
    return fetchJson<CatalogProduct[]>(
      `${API_BASE_URL}/admin/catalog/products`,
      {
        method: "POST",
        body: JSON.stringify({ uncategorized: true, limit, offset, search }),
      },
    );
  },

  async getCategoryProducts(categoryId: number): Promise<
    Array<{
      id: number;
      name: string;
      slug: string;
      price: number;
      image: string | null;
      productTypeCode: string | null;
    }>
  > {
    return fetchJson(
      `${API_BASE_URL}/admin/catalog/categories/${categoryId}/products`,
    );
  },

  async addProductToCategory(
    categoryId: number,
    productId: number,
  ): Promise<void> {
    await fetch(
      `${API_BASE_URL}/admin/catalog/categories/${categoryId}/products`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      },
    );
  },

  async removeProductFromCategory(
    categoryId: number,
    productId: number,
  ): Promise<void> {
    await fetch(
      `${API_BASE_URL}/admin/catalog/categories/${categoryId}/products/${productId}`,
      {
        method: "DELETE",
      },
    );
  },

  // ── Admin Brand CRUD ──

  async getBrandsAdmin(): Promise<
    Array<{
      id: number;
      name: string;
      slug: string;
      code: string | null;
      description: string | null;
      image: string | null;
      website: string | null;
      country: string | null;
      isFeatured: boolean;
      isActive: boolean;
      createdAt: string;
      productCount: number;
    }>
  > {
    return fetchJson(`${API_BASE_URL}/admin/catalog/brands`);
  },

  async createBrand(data: {
    name: string;
    code?: string;
    website?: string;
    description?: string;
    country?: string;
    isFeatured?: boolean;
    imageUrl?: string;
  }): Promise<{ id: number }> {
    return fetchJson(`${API_BASE_URL}/admin/catalog/brands`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateBrand(
    id: number,
    data: {
      name?: string;
      code?: string;
      website?: string;
      description?: string;
      country?: string;
      isFeatured?: boolean;
      isActive?: boolean;
      imageUrl?: string;
    },
  ): Promise<{ id: number }> {
    return fetchJson(`${API_BASE_URL}/admin/catalog/brands/${id}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async deleteBrand(id: number): Promise<void> {
    await fetch(`${API_BASE_URL}/admin/catalog/brands/${id}`, {
      method: "DELETE",
    });
  },

  async getUnsuppliedCount(): Promise<{ total: number }> {
    return fetchJson<{ total: number }>(
      `${API_BASE_URL}/catalog/products/count?unsupplied=true`,
    );
  },

  async getUnsuppliedProducts(
    offset = 0,
    limit = 20,
    search?: string,
  ): Promise<CatalogProduct[]> {
    return fetchJson<CatalogProduct[]>(
      `${API_BASE_URL}/admin/catalog/products`,
      {
        method: "POST",
        body: JSON.stringify({ unsupplied: true, limit, offset, search }),
      },
    );
  },

  // ── Brand Products ──
  // ── Product Suppliers ──

  async getProductSuppliers(productId: number): Promise<
    Array<{
      supplierId: number;
      supplierName: string;
      supplierCode: string | null;
      supplierSku: string | null;
      purchasePrice: string | null;
      leadTimeDays: number | null;
      isPreferred: boolean;
    }>
  > {
    return fetchJson(
      `${API_BASE_URL}/admin/catalog/products/${productId}/suppliers`,
    );
  },

  async addSupplierToProduct(
    productId: number,
    supplierId: number,
  ): Promise<void> {
    await fetch(
      `${API_BASE_URL}/admin/catalog/products/${productId}/suppliers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      },
    );
  },

  async removeSupplierFromProduct(
    productId: number,
    supplierId: number,
  ): Promise<void> {
    await fetch(
      `${API_BASE_URL}/admin/catalog/products/${productId}/suppliers/${supplierId}`,
      { method: "DELETE" },
    );
  },

  // ── Brand Products ──

  async getBrandProducts(brandId: number): Promise<
    Array<{
      id: number;
      name: string;
      slug: string;
      price: number;
      image: string | null;
      productTypeCode: string | null;
    }>
  > {
    return fetchJson(
      `${API_BASE_URL}/admin/catalog/brands/${brandId}/products`,
    );
  },

  async addProductToBrand(brandId: number, productId: number): Promise<void> {
    await fetch(`${API_BASE_URL}/admin/catalog/brands/${brandId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
  },

  async removeProductFromBrand(
    brandId: number,
    productId: number,
  ): Promise<void> {
    await fetch(
      `${API_BASE_URL}/admin/catalog/brands/${brandId}/products/${productId}`,
      { method: "DELETE" },
    );
  },

  async getUnbrandedCount(): Promise<{ total: number }> {
    return fetchJson<{ total: number }>(
      `${API_BASE_URL}/catalog/products/count?unbranded=true`,
    );
  },

  async getUnbrandedProducts(
    offset = 0,
    limit = 20,
    search?: string,
  ): Promise<CatalogProduct[]> {
    return fetchJson<CatalogProduct[]>(
      `${API_BASE_URL}/admin/catalog/products`,
      {
        method: "POST",
        body: JSON.stringify({ unbranded: true, limit, offset, search }),
      },
    );
  },

  // ── Admin Supplier CRUD ──

  async getSuppliersAdmin(): Promise<
    Array<{
      id: number;
      code: string | null;
      legalName: string;
      taxId: string | null;
      contactName: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      city: string | null;
      country: string | null;
      website: string | null;
      paymentTermsDays: number | null;
      currencyCode: string | null;
      notes: string | null;
      isActive: boolean;
      createdAt: string;
      productCount: number;
    }>
  > {
    return fetchJson(`${API_BASE_URL}/admin/catalog/suppliers`);
  },

  async createSupplier(data: {
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
  }): Promise<{ id: number }> {
    return fetchJson(`${API_BASE_URL}/admin/catalog/suppliers`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateSupplier(
    id: number,
    data: {
      legalName?: string;
      code?: string;
      taxId?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
      website?: string;
      paymentTermsDays?: number | null;
      currencyCode?: string;
      notes?: string;
      isActive?: boolean;
    },
  ): Promise<{ id: number }> {
    return fetchJson(`${API_BASE_URL}/admin/catalog/suppliers/${id}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async deleteSupplier(id: number): Promise<void> {
    await fetch(`${API_BASE_URL}/admin/catalog/suppliers/${id}`, {
      method: "DELETE",
    });
  },

  // ── Supplier Products ──

  async getSupplierProducts(supplierId: number): Promise<
    Array<{
      id: number;
      name: string;
      slug: string;
      price: number;
      image: string | null;
      productTypeCode: string | null;
    }>
  > {
    return fetchJson(
      `${API_BASE_URL}/admin/catalog/suppliers/${supplierId}/products`,
    );
  },

  // ── Admin Supplier CRUD ──
  async replaceProductCategory(
    productId: number,
    categoryId: number,
  ): Promise<void> {
    await fetch(
      `${API_BASE_URL}/admin/catalog/products/${productId}/replace-category`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      },
    );
  },
};
