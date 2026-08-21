import { DefaultFallbackService } from './default.fallback';

describe('DefaultFallbackService', () => {
  let service: DefaultFallbackService;

  beforeEach(() => {
    service = new DefaultFallbackService();
  });

  it('createDefaultFallback resolves with the given default response', async () => {
    const fallback = service.createDefaultFallback({ ok: true }, 'products');

    await expect(fallback()).resolves.toEqual({ ok: true });
  });

  it('createErrorFallback throws an error naming the service and reason', () => {
    const fallback = service.createErrorFallback('users', 'unreachable');

    expect(() => fallback()).toThrow(
      'users service unavailable: unreachable',
    );
  });

  it('createEmptyArrayFallback resolves with an empty array', async () => {
    const fallback = service.createEmptyArrayFallback('products');

    await expect(fallback()).resolves.toEqual([]);
  });

  it('createEmptyObjectFallback resolves with an empty object', async () => {
    const fallback = service.createEmptyObjectFallback('products');

    await expect(fallback()).resolves.toEqual({});
  });
});
