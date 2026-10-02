import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { CatalogProductsQueryDto } from './dto/catalog-products-query.dto';

/**
 * Catálogo mínimo para el CRM: listado de productos, categorías y carga por
 * archivo de PLUs. El CRUD admin del catálogo vive en el backend del ecommerce.
 */
@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Obtener categorías del catálogo' })
  @ApiResponse({ status: 200, description: 'Listado de categorías' })
  getCategories() {
    return this.catalogService.getCategories();
  }

  @Public()
  @Post('products')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener productos del catálogo con filtros' })
  @ApiResponse({ status: 200, description: 'Listado de productos' })
  getProducts(@Body() query: CatalogProductsQueryDto) {
    return this.catalogService.getProducts(query);
  }

  @Public()
  @Post('products/from-file')
  @ApiOperation({
    summary: 'Cargar productos por PLU desde un archivo JSON/CSV/XLSX/XLS',
  })
  @UseInterceptors(FileInterceptor('file'))
  importPluFile(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return this.catalogService.importPluFile(file);
  }
}
