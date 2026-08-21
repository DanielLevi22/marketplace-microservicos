import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpHealthIndicator, TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthCheckService as CustomHealthCheckService } from 'src/common/health/health-check.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: {} },
        { provide: CustomHealthCheckService, useValue: {} },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns status ok when the 4 downstream services are up', async () => {
    jest
      .spyOn(HttpHealthIndicator.prototype, 'pingCheck')
      .mockImplementation((key: string) =>
        Promise.resolve({ [key]: { status: 'up' } }),
      );

    const result = await controller.getHealth();

    expect(result.status).toBe('ok');
    expect(result.info).toEqual({
      users: { status: 'up' },
      products: { status: 'up' },
      checkout: { status: 'up' },
      payments: { status: 'up' },
    });
  });

  it('throws ServiceUnavailableException when a downstream service is down', async () => {
    jest
      .spyOn(HttpHealthIndicator.prototype, 'pingCheck')
      .mockImplementation((key: string) =>
        key === 'payments'
          ? Promise.resolve({
              payments: { status: 'down', message: 'connect ECONNREFUSED' },
            })
          : Promise.resolve({ [key]: { status: 'up' } }),
      );

    await expect(controller.getHealth()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
