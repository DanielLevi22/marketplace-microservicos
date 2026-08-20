import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/guards/auth.guard';
import { ProxyService, type UserInfo } from 'src/proxy/service/proxy.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get('profile')
  getProfile(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'users',
      'get',
      '/users/profile',
      undefined,
      { Authorization: authorization },
      user,
    );
  }

  @Get('sellers')
  getSellers(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'users',
      'get',
      '/users/sellers',
      undefined,
      { Authorization: authorization },
      user,
    );
  }

  @Get(':id')
  getById(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.proxyService.proxyRequest(
      'users',
      'get',
      `/users/${id}`,
      undefined,
      { Authorization: authorization },
      user,
    );
  }
}
