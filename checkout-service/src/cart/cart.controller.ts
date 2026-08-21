import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('items')
  addItem(@Body() dto: AddCartItemDto, @Req() req: AuthenticatedRequest) {
    return this.cartService.addItem(req.user.id, dto);
  }
}
