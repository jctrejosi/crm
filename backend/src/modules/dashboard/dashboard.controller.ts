import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Admin - Dashboard')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas principales del dashboard' })
  @ApiResponse({ status: 200, description: 'Estadísticas del dashboard' })
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('revenue-by-day')
  @ApiOperation({ summary: 'Ingresos y pedidos por día' })
  @ApiQuery({ name: 'days', required: false, description: 'Días hacia atrás (7, 30, 90)', example: 7 })
  @ApiResponse({ status: 200, description: 'Array de estadísticas por día' })
  getRevenueByDay(@Query('days') days?: string) {
    return this.dashboardService.getRevenueByDay(parseInt(days ?? '7', 10));
  }

  @Get('sales-by-category')
  @ApiOperation({ summary: 'Ventas por categoría' })
  @ApiQuery({ name: 'period', required: false, description: 'today, week, month' })
  getSalesByCategory(@Query('period') period?: string) {
    return this.dashboardService.getSalesByCategory((period as any) || 'week');
  }

  @Get('sales-by-brand')
  @ApiOperation({ summary: 'Ventas por marca' })
  @ApiQuery({ name: 'period', required: false })
  getSalesByBrand(@Query('period') period?: string) {
    return this.dashboardService.getSalesByBrand((period as any) || 'week');
  }

  @Get('sales-by-product-type')
  @ApiOperation({ summary: 'Ventas por tipo de producto' })
  @ApiQuery({ name: 'period', required: false })
  getSalesByProductType(@Query('period') period?: string) {
    return this.dashboardService.getSalesByProductType((period as any) || 'week');
  }

  @Get('sales-by-branch')
  @ApiOperation({ summary: 'Ventas por sucursal' })
  @ApiQuery({ name: 'period', required: false })
  getSalesByBranch(@Query('period') period?: string) {
    return this.dashboardService.getSalesByBranch((period as any) || 'week');
  }

  @Get('sales-by-supplier')
  @ApiOperation({ summary: 'Ventas por proveedor' })
  @ApiQuery({ name: 'period', required: false })
  getSalesBySupplier(@Query('period') period?: string) {
    return this.dashboardService.getSalesBySupplier((period as any) || 'week');
  }

  @Get('today-orders')
  @ApiOperation({ summary: 'Lista de pedidos de hoy con filtro de estado' })
  @ApiQuery({ name: 'status', required: false })
  getTodayOrders(@Query('status') status?: string) {
    return this.dashboardService.getTodayOrders(status);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Productos con stock bajo' })
  getLowStock() {
    return this.dashboardService.getLowStockProducts();
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'Pedidos recientes' })
  @ApiQuery({ name: 'limit', required: false })
  getRecentOrders(@Query('limit') limit?: string) {
    return this.dashboardService.getRecentOrders(parseInt(limit ?? '10', 10));
  }

  @Get('active-customers')
  @ApiOperation({ summary: 'Lista de clientes activos' })
  getActiveCustomers() {
    return this.dashboardService.getActiveCustomers(100);
  }

  @Get('active-banners-popups')
  @ApiOperation({ summary: 'Banners y popups activos' })
  getActiveBannersAndPopups() {
    return this.dashboardService.getActiveBannersAndPopups();
  }

  @Get('active-promotions')
  @ApiOperation({ summary: 'Promociones activas' })
  getActivePromotions() {
    return this.dashboardService.getActivePromotions();
  }

  @Get('pending-deliveries')
  @ApiOperation({ summary: 'Entregas pendientes' })
  getPendingDeliveries() {
    return this.dashboardService.getPendingDeliveries();
  }
}
