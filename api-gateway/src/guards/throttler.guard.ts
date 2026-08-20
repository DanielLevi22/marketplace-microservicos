import { Injectable } from '@nestjs/common';
import {
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    return Promise.resolve(`${req.ip}-${req.headers['user-agent']}`);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, ttl, limit } = requestProps;
    const { req, res } = this.getRequestResponse(context) as {
      req: Request;
      res: Response;
    };
    const throttles = this.reflector.get<Record<string, unknown> | undefined>(
      'throttle',
      context.getHandler(),
    );
    const throttleName = throttles ? Object.keys(throttles)[0] : 'default';
    const tracker = await this.getTracker(req);
    const key = this.generateKey(context, tracker, throttleName);

    const totalHits = await this.storageService.increment(
      key,
      ttl,
      limit,
      1,
      throttleName,
    );

    if (Number(totalHits) > limit) {
      res.setHeader('Retry-After', Math.round(ttl / 1000));
      throw new ThrottlerException();
    }

    res.setHeader(`${this.headerPrefix}-Limit`, limit);
    res.setHeader(`${this.headerPrefix}-Remaining`, limit - Number(totalHits));
    res.setHeader(`${this.headerPrefix}-Reset`, Math.round(ttl / 1000));

    return true;
  }
}
