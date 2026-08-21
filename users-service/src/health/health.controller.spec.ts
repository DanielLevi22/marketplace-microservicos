import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns status ok when the database indicator is up', async () => {
    jest
      .spyOn(TypeOrmHealthIndicator.prototype, 'pingCheck')
      .mockResolvedValue({ database: { status: 'up' } });

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      info: { database: { status: 'up' } },
      error: {},
      details: { database: { status: 'up' } },
    });
  });

  it('throws ServiceUnavailableException when the database indicator is down', async () => {
    jest.spyOn(TypeOrmHealthIndicator.prototype, 'pingCheck').mockResolvedValue({
      database: { status: 'down', message: 'timeout of 1000ms exceeded' },
    });

    await expect(controller.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
