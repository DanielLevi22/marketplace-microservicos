import type { AuthService } from '../auth/service/auth.service';
import { SessionGuard } from './session.guard';

describe('SessionGuard', () => {
  it('should be defined', () => {
    const authService = {
      validateSessionToken: jest.fn(),
    } as unknown as AuthService;

    expect(new SessionGuard(authService)).toBeDefined();
  });
});
