import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [AdminOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
