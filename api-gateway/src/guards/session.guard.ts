import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthService, UserSession } from '../auth/service/auth.service';

interface AuthenticatedRequest extends Request {
  user?: UserSession['user'];
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const sessionToken = request.header('x-session-token');

    if (!sessionToken) {
      throw new UnauthorizedException('Session token required');
    }

    try {
      const session = await this.authService.validateSessionToken(sessionToken);

      if (!session.valid || !session.user) {
        throw new UnauthorizedException('Invalid session token');
      }

      request.user = session.user;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid session token');
    }
  }
}
