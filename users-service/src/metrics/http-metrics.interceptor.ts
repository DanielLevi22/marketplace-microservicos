import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

const METRICS_ROUTE_PATH = '/metrics';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const matchedRoute = request.route as { path?: string } | undefined;
    const route = matchedRoute?.path ?? request.url;

    if (request.method === 'GET' && route === METRICS_ROUTE_PATH) {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();

    response.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;

      this.metricsService.recordHttpRequest(
        {
          method: request.method,
          route,
          statusCode: String(response.statusCode),
        },
        durationSeconds,
      );
    });

    return next.handle();
  }
}
