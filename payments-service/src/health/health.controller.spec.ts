import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MicroserviceHealthIndicator,
  TerminusModule,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns status ok when database and rabbitmq indicators are up', async () => {
    jest
      .spyOn(TypeOrmHealthIndicator.prototype, 'pingCheck')
      .mockResolvedValue({ database: { status: 'up' } });
    jest
      .spyOn(MicroserviceHealthIndicator.prototype, 'pingCheck')
      .mockResolvedValue({ rabbitmq: { status: 'up' } });

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      info: { database: { status: 'up' }, rabbitmq: { status: 'up' } },
      error: {},
      details: { database: { status: 'up' }, rabbitmq: { status: 'up' } },
    });
  });

  it('throws ServiceUnavailableException when the database indicator is down', async () => {
    jest.spyOn(TypeOrmHealthIndicator.prototype, 'pingCheck').mockResolvedValue({
      database: { status: 'down', message: 'timeout of 1000ms exceeded' },
    });
    jest
      .spyOn(MicroserviceHealthIndicator.prototype, 'pingCheck')
      .mockResolvedValue({ rabbitmq: { status: 'up' } });

    await expect(controller.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException when the rabbitmq indicator is down', async () => {
    jest
      .spyOn(TypeOrmHealthIndicator.prototype, 'pingCheck')
      .mockResolvedValue({ database: { status: 'up' } });
    jest
      .spyOn(MicroserviceHealthIndicator.prototype, 'pingCheck')
      .mockResolvedValue({
        rabbitmq: { status: 'down', message: 'connection refused' },
      });

    await expect(controller.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
