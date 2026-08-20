import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: { userId: string; email: string; role: string };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
