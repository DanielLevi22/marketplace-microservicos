import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../service/auth.service';
import type { RegisterDto } from '../dtos/register.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; register: jest.Mock };

  beforeEach(async () => {
    authService = { login: jest.fn(), register: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('login delegates to AuthService.login', async () => {
    const loginDto = {
      email: 'jane@example.com',
      password: 'secret1',
    };
    const response = { user: { id: 'uuid-1' }, token: 'jwt-token' };
    authService.login.mockResolvedValue(response);

    const result = await controller.login(loginDto);

    expect(authService.login).toHaveBeenCalledWith(loginDto);
    expect(result).toBe(response);
  });

  it('register delegates to AuthService.register', async () => {
    const registerDto = {
      email: 'jane@example.com',
      password: 'secret1',
      firstName: 'Jane',
      lastName: 'Doe',
    } as RegisterDto;
    const response = { id: 'uuid-1', email: registerDto.email };
    authService.register.mockResolvedValue(response);

    const result = await controller.register(registerDto);

    expect(authService.register).toHaveBeenCalledWith(registerDto);
    expect(result).toBe(response);
  });
});
