import { HttpService } from '@nestjs/axios';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { serviceConfig } from 'src/config/gateway.config';
import { ProxyService } from 'src/proxy/service/proxy.service';
import type { RegisterDto } from '../dtos/register.dto';
import type { LoginDto } from '../dtos/login.dto';

export interface UserSession {
  valid: boolean;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
  } | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly httpService: HttpService,
    private readonly proxyService: ProxyService,
  ) {}

  async validateSessionToken(sessionToken: string): Promise<UserSession> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<UserSession>(
          `${serviceConfig.users.url}/sessions/validate/${sessionToken}`,
          { timeout: serviceConfig.users.timeout },
        ),
      );

      return data;
    } catch {
      throw new UnauthorizedException('Invalid session token');
    }
  }

  async login(loginDto: LoginDto): Promise<unknown> {
    try {
      return await this.proxyService.proxyRequest(
        'users',
        'post',
        '/auth/login',
        loginDto,
      );
    } catch {
      throw new UnauthorizedException('Invalid login credentials');
    }
  }

  async register(registerDto: RegisterDto): Promise<unknown> {
    try {
      return await this.proxyService.proxyRequest(
        'users',
        'post',
        '/auth/register',
        registerDto,
      );
    } catch {
      throw new UnauthorizedException('Registration failed');
    }
  }
}
