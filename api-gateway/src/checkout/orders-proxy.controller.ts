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

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class OrdersProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('cart/checkout')
  checkout(
    @Body() dto: Record<string, unknown>,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'post',
      '/cart/checkout',
      dto,
      { Authorization: authorization },
      user,
    );
  }

  @Get('orders')
  findAll(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'get',
      '/orders',
      undefined,
      { Authorization: authorization },
      user,
    );
  }

  @Get('orders/:id')
  findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'get',
      `/orders/${id}`,
      undefined,
      { Authorization: authorization },
      user,
    );
  }
}
