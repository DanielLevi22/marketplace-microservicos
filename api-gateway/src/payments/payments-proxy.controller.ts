import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/guards/auth.guard';
import { ProxyService, type UserInfo } from 'src/proxy/service/proxy.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get(':orderId')
  findByOrderId(
    @Param('orderId') orderId: string,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'payments',
      'get',
      `/payments/${orderId}`,
      undefined,
      { Authorization: authorization },
      user,
    );
  }
}
