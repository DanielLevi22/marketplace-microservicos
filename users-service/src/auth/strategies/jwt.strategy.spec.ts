import { JwtStrategy } from './jwt.strategy';
import { UserRole } from '../../users/entities/user.entity';

describe('JwtStrategy', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('maps the JWT payload to { id, email, role }', () => {
    const strategy = new JwtStrategy();

    const result = strategy.validate({
      sub: 'uuid-1',
      email: 'jane@example.com',
      role: UserRole.BUYER,
    });

    expect(result).toEqual({
      id: 'uuid-1',
      email: 'jane@example.com',
      role: UserRole.BUYER,
    });
  });
});
