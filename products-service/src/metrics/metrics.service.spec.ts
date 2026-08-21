import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('exposes http_requests_total and http_request_duration_seconds after recording a request', async () => {
    service.recordHttpRequest(
      { method: 'GET', route: '/products', statusCode: '200' },
      0.123,
    );

    const { contentType, metrics } = await service.getMetrics();

    expect(contentType).toContain('text/plain');
    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/products"');
    expect(metrics).toContain('status_code="200"');
    expect(metrics).toContain('http_request_duration_seconds');
  });

  it('exposes Node.js default metrics', async () => {
    const { metrics } = await service.getMetrics();

    expect(metrics).toMatch(/process_|nodejs_/);
  });

  it('does not collide across multiple instances (isolated registry per instance)', async () => {
    const other = new MetricsService();

    other.recordHttpRequest(
      { method: 'POST', route: '/products', statusCode: '201' },
      0.05,
    );

    const [first, second] = await Promise.all([
      service.getMetrics(),
      other.getMetrics(),
    ]);

    expect(first.metrics).not.toContain('status_code="201"');
    expect(second.metrics).toContain('status_code="201"');
  });
});
