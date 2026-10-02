import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';

@ApiTags('Admin Orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un pedido (admin)' })
  @ApiResponse({ status: 200, description: 'Detalle del pedido' })
  getOrderById(@Param('id') id: string) {
    return this.ordersService.getOrderById(Number(id));
  }
}
