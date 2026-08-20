import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto, @Req() req: AuthenticatedRequest) {
    return this.productsService.create(dto, req.user.id, req.user.role);
  }

  @Public()
  @Get()
  findAll() {
    return this.productsService.findAllActive();
  }

  @Public()
  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId') sellerId: string) {
    return this.productsService.findBySeller(sellerId);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}
