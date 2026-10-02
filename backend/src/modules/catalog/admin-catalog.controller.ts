import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { CatalogProductsQueryDto } from './dto/catalog-products-query.dto';

@ApiTags('Admin - Catálogo')
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ── Categories ──

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Obtener todas las categorías (admin)' })
  async getAllCategories() {
    return this.catalogService.getAllCategoriesAdmin();
  }

  @Public()
  @Post('categories')
  @ApiOperation({ summary: 'Crear categoría' })
  async createCategory(
    @Body() body: { name: string; code?: string; parentId?: number },
  ) {
    return this.catalogService.createCategory(body);
  }

  @Public()
  @Post('categories/:id')
  @ApiOperation({ summary: 'Actualizar categoría' })
  async updateCategory(
    @Param('id') id: string,
    @Body()
    body: {
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
    return this.catalogService.updateCategory(Number(id), body);
  }

  @Public()
  @Delete('categories/:id')
  @ApiOperation({ summary: 'Eliminar categoría (soft delete)' })
  async deleteCategory(@Param('id') id: string) {
    await this.catalogService.deleteCategory(Number(id));
    return { success: true };
  }

  // ── Category Products ──

  @Public()
  @Get('categories/:id/products')
  @ApiOperation({ summary: 'Obtener productos de una categoría' })
  async getCategoryProducts(@Param('id') id: string) {
    return this.catalogService.getCategoryProducts(Number(id));
  }

  @Public()
  @Post('categories/:id/products')
  @ApiOperation({ summary: 'Asignar producto a categoría' })
  async addProductToCategory(
    @Param('id') id: string,
    @Body() body: { productId: number },
  ) {
    await this.catalogService.addProductToCategory(Number(id), body.productId);
    return { success: true };
  }

  @Public()
  @Delete('categories/:id/products/:productId')
  @ApiOperation({ summary: 'Quitar producto de categoría' })
  async removeProductFromCategory(
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    await this.catalogService.removeProductFromCategory(
      Number(id),
      Number(productId),
    );
    return { success: true };
  }

  // ── Product Types ──

  @Public()
  @Get('product-types')
  @ApiOperation({ summary: 'Obtener todos los tipos de producto (admin)' })
  async getAllProductTypes() {
    return this.catalogService.getAllProductTypesAdmin();
  }

  @Public()
  @Post('product-types')
  @ApiOperation({ summary: 'Crear tipo de producto' })
  async createProductType(
    @Body()
    body: {
      name: string;
      code?: string;
      description?: string;
    },
  ) {
    return this.catalogService.createProductType(body);
  }

  @Public()
  @Post('product-types/:id')
  @ApiOperation({ summary: 'Actualizar tipo de producto' })
  async updateProductType(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      code?: string;
      description?: string | null;
      isActive?: boolean;
      imageUrl?: string;
    },
  ) {
    return this.catalogService.updateProductType(Number(id), body);
  }

  @Public()
  @Delete('product-types/:id')
  @ApiOperation({ summary: 'Eliminar tipo de producto' })
  async deleteProductType(@Param('id') id: string) {
    await this.catalogService.deleteProductType(Number(id));
    return { success: true };
  }

  // ── Product Type Products ──

  @Public()
  @Get('product-types/:id/products')
  @ApiOperation({ summary: 'Obtener productos de un tipo de producto' })
  async getProductTypeProducts(@Param('id') id: string) {
    return this.catalogService.getProductTypeProducts(Number(id));
  }

  @Public()
  @Post('product-types/:id/products')
  @ApiOperation({ summary: 'Asignar producto a tipo de producto' })
  async addProductToType(
    @Param('id') id: string,
    @Body() body: { productId: number },
  ) {
    await this.catalogService.addProductToType(Number(id), body.productId);
    return { success: true };
  }

  @Public()
  @Delete('product-types/:id/products/:productId')
  @ApiOperation({ summary: 'Quitar producto de tipo de producto' })
  async removeProductFromType(
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    await this.catalogService.removeProductFromType(
      Number(id),
      Number(productId),
    );
    return { success: true };
  }

  // ── Products ──
  @Public()
  @Post('products/:productId/replace-category')
  @ApiOperation({ summary: 'Reemplazar categoría de un producto' })
  async replaceProductCategory(
    @Param('productId') productId: string,
    @Body() body: { categoryId: number },
  ) {
    await this.catalogService.replaceProductCategory(
      Number(productId),
      body.categoryId,
    );
    return { success: true };
  }

  // ── Products ──

  @Public()
  @Post('products')
  @ApiOperation({ summary: 'Buscar productos (admin, incluye sin categoría)' })
  async getProducts(@Body() query: CatalogProductsQueryDto) {
    return this.catalogService.getProducts(query);
  }

  // ── Brands ──

  @Public()
  @Get('brands')
  @ApiOperation({ summary: 'Obtener todas las marcas (admin)' })
  async getAllBrands() {
    return this.catalogService.getAllBrandsAdmin();
  }

  @Public()
  @Post('brands')
  @ApiOperation({ summary: 'Crear marca' })
  async createBrand(
    @Body()
    body: {
      name: string;
      code?: string;
      website?: string;
      description?: string;
      country?: string;
      isFeatured?: boolean;
      isPublic?: boolean;
      imageUrl?: string;
    },
  ) {
    return this.catalogService.createBrand(body);
  }

  @Public()
  @Post('brands/:id')
  @ApiOperation({ summary: 'Actualizar marca' })
  async updateBrand(
    @Param('id') id: string,
    @Body()
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
    return this.catalogService.updateBrand(Number(id), body);
  }

  @Public()
  @Delete('brands/:id')
  @ApiOperation({ summary: 'Eliminar marca (soft delete)' })
  async deleteBrand(@Param('id') id: string) {
    await this.catalogService.deleteBrand(Number(id));
    return { success: true };
  }

  // ── Brand Products ──

  @Public()
  @Get('brands/:id/products')
  @ApiOperation({ summary: 'Obtener productos de una marca' })
  async getBrandProducts(@Param('id') id: string) {
    return this.catalogService.getBrandProducts(Number(id));
  }

  @Public()
  @Post('brands/:id/products')
  @ApiOperation({ summary: 'Asignar producto a marca' })
  async addProductToBrand(
    @Param('id') id: string,
    @Body() body: { productId: number },
  ) {
    await this.catalogService.addProductToBrand(Number(id), body.productId);
    return { success: true };
  }

  @Public()
  @Delete('brands/:id/products/:productId')
  @ApiOperation({ summary: 'Quitar producto de marca' })
  async removeProductFromBrand(
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    await this.catalogService.removeProductFromBrand(Number(productId));
    return { success: true };
  }

  // ── Suppliers ──

  @Public()
  @Get('suppliers')
  @ApiOperation({ summary: 'Obtener proveedores (admin, paginado)' })
  async getAllSuppliers(
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.catalogService.getAllSuppliersAdmin({
      offset: offset !== undefined ? Number(offset) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      search,
    });
  }

  @Public()
  @Post('suppliers')
  @ApiOperation({ summary: 'Crear proveedor' })
  async createSupplier(
    @Body()
    body: {
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
    },
  ) {
    return this.catalogService.createSupplier(body);
  }

  @Public()
  @Post('suppliers/:id')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  async updateSupplier(
    @Param('id') id: string,
    @Body()
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
    return this.catalogService.updateSupplier(Number(id), body);
  }

  @Public()
  @Delete('suppliers/:id')
  @ApiOperation({ summary: 'Eliminar proveedor (soft delete)' })
  async deleteSupplier(@Param('id') id: string) {
    await this.catalogService.deleteSupplier(Number(id));
    return { success: true };
  }

  // ── Supplier Products ──

  @Public()
  @Get('suppliers/:id/products')
  @ApiOperation({ summary: 'Obtener productos de un proveedor' })
  async getSupplierProducts(@Param('id') id: string) {
    return this.catalogService.getSupplierProducts(Number(id));
  }

  // ── Product Suppliers ──

  @Public()
  @Get('products/:id/suppliers')
  @ApiOperation({ summary: 'Obtener proveedores de un producto' })
  async getProductSuppliers(@Param('id') id: string) {
    return this.catalogService.getProductSuppliers(Number(id));
  }

  @Public()
  @Post('products/:id/suppliers')
  @ApiOperation({ summary: 'Asignar proveedor a producto' })
  async addSupplierToProduct(
    @Param('id') id: string,
    @Body() body: { supplierId: number },
  ) {
    return this.catalogService.addSupplierToProduct(
      Number(id),
      body.supplierId,
    );
  }

  @Public()
  @Delete('products/:id/suppliers/:supplierId')
  @ApiOperation({ summary: 'Quitar proveedor de producto' })
  async removeSupplierFromProduct(
    @Param('id') id: string,
    @Param('supplierId') supplierId: string,
  ) {
    await this.catalogService.removeSupplierFromProduct(
      Number(id),
      Number(supplierId),
    );
    return { success: true };
  }
}
