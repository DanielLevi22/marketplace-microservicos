import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ProxyService } from './proxy.service';
import { CircuitBreakerService } from 'src/common/circuit-breaker/circuit-breaker.service';
import { CacheFallbackService } from 'src/common/fallback/cache.fallback';
import { DefaultFallbackService } from 'src/common/fallback/default.fallback';
import { TimeoutService } from 'src/common/timeout/timeout.service';
import { RetryService } from 'src/common/retry/retry.service';

describe('ProxyService', () => {
  let service: ProxyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        { provide: HttpService, useValue: { request: jest.fn() } },
        {
          provide: CircuitBreakerService,
          useValue: { executeWithCircuitBreaker: jest.fn() },
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
          useValue: { executeWithCustomTimeout: jest.fn() },
        },
        {
          provide: RetryService,
          useValue: { executeWithExponentialBackoff: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
