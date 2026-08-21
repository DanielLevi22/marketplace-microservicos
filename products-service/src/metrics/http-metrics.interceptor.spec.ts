import { CallHandler, ExecutionContext } from '@nestjs/common';
import { EventEmitter } from 'events';
import { of } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { HttpRequestLabels, MetricsService } from './metrics.service';

function createContext(request: Record<string, unknown>, response: object) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createCallHandler(): CallHandler {
  return { handle: () => of('ok') };
}

describe('HttpMetricsInterceptor', () => {
  let metricsService: {
    recordHttpRequest: jest.Mock<void, [HttpRequestLabels, number]>;
  };
  let interceptor: HttpMetricsInterceptor;

  beforeEach(() => {
    metricsService = {
      recordHttpRequest: jest.fn<void, [HttpRequestLabels, number]>(),
    };
    interceptor = new HttpMetricsInterceptor(
      metricsService as unknown as MetricsService,
    );
  });

  it('records method, route and status_code once the response finishes', (done) => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    const request = { method: 'GET', url: '/users', route: { path: '/users' } };

    interceptor
      .intercept(createContext(request, response), createCallHandler())
      .subscribe(() => {
        response.emit('finish');

        expect(metricsService.recordHttpRequest).toHaveBeenCalledTimes(1);
        const [labels, duration] =
          metricsService.recordHttpRequest.mock.calls[0];
        expect(labels).toEqual({
          method: 'GET',
          route: '/users',
          statusCode: '200',
        });
        expect(duration).toBeGreaterThanOrEqual(0);
        done();
      });
  });

  it('does not record the GET /metrics request itself (RN01)', (done) => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    const request = {
      method: 'GET',
      url: '/metrics',
      route: { path: '/metrics' },
    };

    interceptor
      .intercept(createContext(request, response), createCallHandler())
      .subscribe(() => {
        response.emit('finish');

        expect(metricsService.recordHttpRequest).not.toHaveBeenCalled();
        done();
      });
  });
});
