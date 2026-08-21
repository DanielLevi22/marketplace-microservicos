import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Spec 02-metricas-http-prometheus.md
describe('MetricsController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // RF05: /metrics agora e exclusivo do formato Prometheus (prom-client)
  it('/metrics (GET) returns 200 in Prometheus text format', async () => {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('http_requests_total');
    expect(response.text).toContain('http_request_duration_seconds');
    expect(response.text).toMatch(/process_|nodejs_/);
  });

  // RN01: /metrics nao se autocontabiliza
  it('/metrics (GET) never reports a series for the /metrics route itself', async () => {
    await request(app.getHttpServer()).get('/metrics').expect(200);

    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.text).not.toContain('route="/metrics"');
  });

  // RF03/RF04: counter incrementado apos uma requisicao a uma rota conhecida
  it('/metrics (GET) reflects the request counter for a known route', async () => {
    await request(app.getHttpServer()).get('/consumer-metrics').expect(200);

    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.text).toContain('method="GET"');
    expect(response.text).toContain('route="/consumer-metrics"');
    expect(response.text).toContain('status_code="200"');
  });

  // RF06: estatisticas do consumidor RabbitMQ continuam funcionando, agora em /consumer-metrics
  it('/consumer-metrics (GET) still returns the RabbitMQ consumer stats JSON, unchanged', async () => {
    const response = await request(app.getHttpServer())
      .get('/consumer-metrics')
      .expect(200);

    const body = response.body as Record<string, unknown>;
    expect(body.status).toBe('active');
    expect(typeof body.totalProcessed).toBe('number');
    expect(typeof body.totalSuccess).toBe('number');
    expect(typeof body.totalFailed).toBe('number');
  });

  it('/consumer-metrics/summary (GET) still returns the consumer summary JSON, unchanged', async () => {
    const response = await request(app.getHttpServer())
      .get('/consumer-metrics/summary')
      .expect(200);

    const body = response.body as Record<string, unknown>;
    expect(typeof body.processed).toBe('number');
    expect(typeof body.success).toBe('number');
    expect(typeof body.failed).toBe('number');
  });
});
