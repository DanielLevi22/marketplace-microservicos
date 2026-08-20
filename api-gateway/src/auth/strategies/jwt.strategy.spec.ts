import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('maps the JWT payload to { userId, email, role }', () => {
    const strategy = new JwtStrategy();

    const result = strategy.validate({
      sub: 'uuid-1',
      email: 'jane@example.com',
      role: 'buyer',
    });

    expect(result).toEqual({
      userId: 'uuid-1',
      email: 'jane@example.com',
      role: 'buyer',
    });
  });
});
