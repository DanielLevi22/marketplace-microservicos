import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('cart/checkout')
  checkout(@Body() dto: CheckoutDto, @Req() req: AuthenticatedRequest) {
    return this.ordersService.checkout(req.user.id, dto);
  }

  @Get('orders')
  findAll(@Req() req: AuthenticatedRequest) {
    return this.ordersService.findAllForUser(req.user.id);
  }

  @Get('orders/:id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ordersService.findOneForUser(req.user.id, id);
  }
}
