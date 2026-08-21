import {
  Body,
  Controller,
  Delete,
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

@ApiTags('Cart')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('items')
  addItem(
    @Body() dto: Record<string, unknown>,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'post',
      '/cart/items',
      dto,
      { Authorization: authorization },
      user,
    );
  }

  @Get()
  getCart(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'get',
      '/cart',
      undefined,
      { Authorization: authorization },
      user,
    );
  }

  @Delete('items/:itemId')
  removeItem(
    @Param('itemId') itemId: string,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'delete',
      `/cart/items/${itemId}`,
      undefined,
      { Authorization: authorization },
      user,
    );
  }
}
