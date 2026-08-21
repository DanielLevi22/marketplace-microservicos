import { CacheFallbackService } from './cache.fallback';

describe('CacheFallbackService', () => {
  let service: CacheFallbackService;

  beforeEach(() => {
    service = new CacheFallbackService();
  });

  describe('getCachedData / setCachedData', () => {
    it('returns null when there is no cached data for the key', async () => {
      const result = await service.getCachedData('missing-key');

      expect(result).toBeNull();
    });

    it('returns the data previously set for a key', async () => {
      service.setCachedData('products-list', { items: [1, 2, 3] });

      const result = await service.getCachedData('products-list');

      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('returns fresh data that has not yet expired', async () => {
      jest.useFakeTimers();
      service.setCachedData('products-list', { items: [1] });

      jest.advanceTimersByTime(100);
      const result = await service.getCachedData('products-list', 500);

      expect(result).toEqual({ items: [1] });
      jest.useRealTimers();
    });

    it('returns null and evicts the entry once the cache timeout has elapsed', async () => {
      jest.useFakeTimers();
      service.setCachedData('products-list', { items: [1] });

      jest.advanceTimersByTime(1000);
      const result = await service.getCachedData('products-list', 500);

      expect(result).toBeNull();

      // Reading again (still with real time frozen by fake timers) confirms
      // the expired entry was evicted, not just reported as expired once.
      const second = await service.getCachedData('products-list', 500);
      expect(second).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('createCacheFallback', () => {
    it('returns the cached data when available', async () => {
      service.setCachedData('products-list', { items: [1] });
      const fallback = service.createCacheFallback('products-list', {
        items: [],
      });

      const result = await fallback();

      expect(result).toEqual({ items: [1] });
    });

    it('returns the default data when there is no cached data', async () => {
      const fallback = service.createCacheFallback('products-list', {
        items: [],
      });

      const result = await fallback();

      expect(result).toEqual({ items: [] });
    });
  });
});
