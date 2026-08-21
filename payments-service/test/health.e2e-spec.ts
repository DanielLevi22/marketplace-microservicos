import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MicroserviceHealthIndicator } from '@nestjs/terminus';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AppModule } from './../src/app.module';
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service';
import { typeormTestConfig } from './utils/typeorm-test.config';
import { createRabbitmqServiceMock } from './utils/rabbitmq-mock';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // O indicador de rabbitmq do /health usa MicroserviceHealthIndicator
    // diretamente (não passa por RabbitmqService), então precisa de mock
    // próprio para não depender de um broker real.
    jest
      .spyOn(MicroserviceHealthIndicator.prototype, 'pingCheck')
      .mockResolvedValue({ rabbitmq: { status: 'up' } });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DataSource)
      .useFactory({
        factory: async () => {
          const dataSource = new DataSource(
            typeormTestConfig as DataSourceOptions,
          );
          return dataSource.initialize();
        },
      })
      .overrideProvider(RabbitmqService)
      .useValue(createRabbitmqServiceMock())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('/health (GET) returns 200 with database and rabbitmq indicators up', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        status: 'ok',
        info: { database: { status: 'up' }, rabbitmq: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' }, rabbitmq: { status: 'up' } },
      });
  });
});
