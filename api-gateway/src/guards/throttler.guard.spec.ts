import { Reflector } from '@nestjs/core';
import { CustomThrottlerGuard } from './throttler.guard';

describe('CustomThrottlerGuard', () => {
  it('should be defined', () => {
    const guard = new CustomThrottlerGuard(
      { throttlers: [] },
      { increment: jest.fn() },
      new Reflector(),
    );

    expect(guard).toBeDefined();
  });
});
