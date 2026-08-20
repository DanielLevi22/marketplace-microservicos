import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ProxyService } from 'src/proxy/service/proxy.service';
import { AuthService } from './auth.service';
import type { RegisterDto } from '../dtos/register.dto';

describe('AuthService', () => {
  let service: AuthService;
  let proxyService: { proxyRequest: jest.Mock };

  beforeEach(async () => {
    proxyService = { proxyRequest: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: HttpService, useValue: { get: jest.fn() } },
        { provide: ProxyService, useValue: proxyService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('proxies to /auth/login on the users service and returns the response', async () => {
      const loginDto = {
        email: 'jane@example.com',
        password: 'secret1',
      };
      const response = { user: { id: 'uuid-1' }, token: 'jwt-token' };
      proxyService.proxyRequest.mockResolvedValue(response);

      const result = await service.login(loginDto);

      expect(proxyService.proxyRequest).toHaveBeenCalledWith(
        'users',
        'post',
        '/auth/login',
        loginDto,
      );
      expect(result).toBe(response);
    });

    it('rethrows the real HttpException from the users service', async () => {
      const invalidCredentials = new HttpException(
        'Credenciais inválidas',
        401,
      );
      proxyService.proxyRequest.mockRejectedValue(invalidCredentials);

      await expect(
        service.login({
          email: 'jane@example.com',
          password: 'wrong',
        }),
      ).rejects.toBe(invalidCredentials);
    });

    it('throws a generic UnauthorizedException on infrastructure failure', async () => {
      proxyService.proxyRequest.mockRejectedValue(new Error('boom'));

      await expect(
        service.login({
          email: 'jane@example.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('proxies to /auth/register on the users service and returns the response', async () => {
      const registerDto = {
        email: 'jane@example.com',
        password: 'secret1',
        firstName: 'Jane',
        lastName: 'Doe',
      } as RegisterDto;
      const response = { id: 'uuid-1', email: registerDto.email };
      proxyService.proxyRequest.mockResolvedValue(response);

      const result = await service.register(registerDto);

      expect(proxyService.proxyRequest).toHaveBeenCalledWith(
        'users',
        'post',
        '/auth/register',
        registerDto,
      );
      expect(result).toBe(response);
    });

    it('rethrows the real HttpException from the users service', async () => {
      const emailConflict = new HttpException('Email já cadastrado', 409);
      proxyService.proxyRequest.mockRejectedValue(emailConflict);

      await expect(service.register({} as RegisterDto)).rejects.toBe(
        emailConflict,
      );
    });

    it('throws a generic UnauthorizedException on infrastructure failure', async () => {
      proxyService.proxyRequest.mockRejectedValue(new Error('boom'));

      await expect(service.register({} as RegisterDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
