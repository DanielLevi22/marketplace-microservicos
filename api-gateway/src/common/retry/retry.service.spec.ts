import { HttpException, HttpStatus } from '@nestjs/common';
import { RetryService } from './retry.service';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(() => {
    service = new RetryService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries on a generic failure until it succeeds', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    const resultPromise = service.executeWithExponentialBackoff(operation, 3);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the error is a client HttpException (4xx)', async () => {
    const notFound = new HttpException('Not found', HttpStatus.NOT_FOUND);
    const operation = jest.fn().mockRejectedValue(notFound);

    await expect(
      service.executeWithExponentialBackoff(operation, 3),
    ).rejects.toBe(notFound);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries when the error is a server HttpException (5xx)', async () => {
    const serverError = new HttpException(
      'Internal error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const operation = jest
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce('ok');

    const resultPromise = service.executeWithExponentialBackoff(operation, 3);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
