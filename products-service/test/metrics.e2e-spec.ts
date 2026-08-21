import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Spec 05-metricas-http-prometheus.md
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

  // RF05/RN02: publico mesmo com o JwtAuthGuard global ativo
  it('/metrics (GET) returns 200 in Prometheus text format without an Authorization header', async () => {
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
  it('/metrics (GET) reflects the request counter for a known public route', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);

    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.text).toContain('method="GET"');
    expect(response.text).toContain('route="/health"');
    expect(response.text).toContain('status_code="200"');
  });

  // Nao-regressao: guard JWT global continua exigindo token em rotas protegidas
  it('/products (POST) still returns 401 without an Authorization header', () => {
    return request(app.getHttpServer()).post('/products').send({}).expect(401);
  });
});
