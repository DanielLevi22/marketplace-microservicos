import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/guards/auth.guard';
import { ProxyService, type UserInfo } from 'src/proxy/service/proxy.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get()
  findAll() {
    return this.proxyService.proxyRequest('products', 'get', '/products');
  }

  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId') sellerId: string) {
    return this.proxyService.proxyRequest(
      'products',
      'get',
      `/products/seller/${sellerId}`,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.proxyService.proxyRequest('products', 'get', `/products/${id}`);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() dto: Record<string, unknown>,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'products',
      'post',
      '/products',
      dto,
      { Authorization: authorization },
      user,
    );
  }
}
