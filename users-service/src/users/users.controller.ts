import { Controller, Get, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.findById(req.user.id);
  }

  @Get('sellers')
  getSellers() {
    return this.usersService.findSellers();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
