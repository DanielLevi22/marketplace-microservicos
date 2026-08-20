import { HttpException, HttpStatus } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService();
  });

  it('returns the operation result on success', async () => {
    const result = await service.executeWithCircuitBreaker(
      () => Promise.resolve('ok'),
      'test-key',
    );

    expect(result).toBe('ok');
  });

  it('rethrows a client HttpException (4xx) without counting it as a failure or using the fallback', async () => {
    const notFound = new HttpException('Not found', HttpStatus.NOT_FOUND);
    const fallback = jest.fn().mockResolvedValue('fallback');

    await expect(
      service.executeWithCircuitBreaker(
        () => Promise.reject(notFound),
        'products-4xx',
        { failureThreshold: 3, timeout: 30000, resetTimeout: 30000 },
        fallback,
      ),
    ).rejects.toBe(notFound);

    expect(fallback).not.toHaveBeenCalled();
    expect(service.getCircuitState('products-4xx')?.failureCount).toBe(0);
  });

  it('counts a generic failure and uses the fallback', async () => {
    const fallback = jest.fn().mockResolvedValue('fallback');

    const result = await service.executeWithCircuitBreaker(
      () => Promise.reject(new Error('network error')),
      'products-network',
      { failureThreshold: 3, timeout: 30000, resetTimeout: 30000 },
      fallback,
    );

    expect(result).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(service.getCircuitState('products-network')?.failureCount).toBe(1);
  });

  it('counts a server HttpException (5xx) as a failure', async () => {
    const serverError = new HttpException(
      'Internal error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const fallback = jest.fn().mockResolvedValue('fallback');

    const result = await service.executeWithCircuitBreaker(
      () => Promise.reject(serverError),
      'products-5xx',
      { failureThreshold: 3, timeout: 30000, resetTimeout: 30000 },
      fallback,
    );

    expect(result).toBe('fallback');
    expect(service.getCircuitState('products-5xx')?.failureCount).toBe(1);
  });
});
