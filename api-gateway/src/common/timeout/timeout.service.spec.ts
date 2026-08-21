import { TimeoutService } from './timeout.service';

describe('TimeoutService', () => {
  let service: TimeoutService;

  beforeEach(() => {
    service = new TimeoutService();
  });

  describe('executeWithCustomTimeout', () => {
    it('resolves with the operation result when it finishes before the timeout', async () => {
      const result = await service.executeWithCustomTimeout(
        () => Promise.resolve('ok'),
        1000,
      );

      expect(result).toBe('ok');
    });

    it('rejects with a timeout error when the operation takes longer than the timeout', async () => {
      jest.useFakeTimers();

      const operation = () =>
        new Promise((resolve) => setTimeout(() => resolve('late'), 5000));

      const promise = service.executeWithCustomTimeout(operation, 1000);
      const assertion = expect(promise).rejects.toThrow(
        'Operation timed out after 1000ms',
      );
      await jest.advanceTimersByTimeAsync(1000);
      await assertion;

      jest.useRealTimers();
    });
  });

  describe('executeWithTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves on the first attempt when the operation succeeds immediately', async () => {
      const operation = jest.fn().mockResolvedValue('ok');

      const result = await service.executeWithTimeout(operation);

      expect(result).toBe('ok');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries a failing operation until it succeeds', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('ok');

      const resultPromise = service.executeWithTimeout(operation, {
        timeout: 1000,
        retries: 2,
        backoffMultiplier: 2,
        maxBackoff: 30000,
      });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('ok');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('throws the last error after exhausting all retries', async () => {
      const error = new Error('always fails');
      const operation = jest.fn().mockRejectedValue(error);

      const resultPromise = service.executeWithTimeout(operation, {
        timeout: 1000,
        retries: 2,
        backoffMultiplier: 2,
        maxBackoff: 30000,
      });
      const assertion = expect(resultPromise).rejects.toBe(error);
      await jest.runAllTimersAsync();
      await assertion;

      expect(operation).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
    });

    it('treats an operation that exceeds the timeout as a failed attempt and retries', async () => {
      const operation = jest
        .fn()
        .mockImplementationOnce(() => new Promise(() => {})) // never settles -> times out
        .mockResolvedValueOnce('recovered');

      const resultPromise = service.executeWithTimeout(operation, {
        timeout: 500,
        retries: 1,
        backoffMultiplier: 2,
        maxBackoff: 30000,
      });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('recovered');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
});
