import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './auth.guard';

describe('JwtAuthGuard', () => {
  it('should be defined', () => {
    expect(new JwtAuthGuard(new Reflector())).toBeDefined();
  });
});
