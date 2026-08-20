import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { throwError } from 'rxjs';
import { ProxyService } from './proxy.service';
import { CircuitBreakerService } from 'src/common/circuit-breaker/circuit-breaker.service';
import { CacheFallbackService } from 'src/common/fallback/cache.fallback';
import { DefaultFallbackService } from 'src/common/fallback/default.fallback';
import { TimeoutService } from 'src/common/timeout/timeout.service';
import { RetryService } from 'src/common/retry/retry.service';

describe('ProxyService', () => {
  let service: ProxyService;
  let httpService: { request: jest.Mock };

  beforeEach(async () => {
    httpService = { request: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        { provide: HttpService, useValue: httpService },
        {
          provide: CircuitBreakerService,
          useValue: {
            executeWithCircuitBreaker: (operation: () => unknown) =>
              operation(),
          },
        },
        {
          provide: CacheFallbackService,
          useValue: {
            setCachedData: jest.fn(),
            createCacheFallback: jest.fn(),
          },
        },
        {
          provide: DefaultFallbackService,
          useValue: { createErrorFallback: jest.fn() },
        },
        {
          provide: TimeoutService,
          useValue: {
            executeWithCustomTimeout: (operation: () => unknown) => operation(),
          },
        },
        {
          provide: RetryService,
          useValue: {
            executeWithExponentialBackoff: (operation: () => unknown) =>
              operation(),
          },
        },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('converts an AxiosError with a response into an HttpException with the same status and body', async () => {
    const axiosError = {
      isAxiosError: true,
      response: { status: 404, data: { message: 'Produto não encontrado' } },
    };
    httpService.request.mockReturnValue(throwError(() => axiosError));

    await expect(
      service.proxyRequest('products', 'get', '/products/unknown-id'),
    ).rejects.toMatchObject({
      response: { message: 'Produto não encontrado' },
      status: 404,
    });
  });

  it('rethrows an AxiosError without a response (network failure) unchanged', async () => {
    const networkError = { isAxiosError: true, response: undefined };
    httpService.request.mockReturnValue(throwError(() => networkError));

    await expect(
      service.proxyRequest('products', 'get', '/products'),
    ).rejects.toBe(networkError);
  });
});
