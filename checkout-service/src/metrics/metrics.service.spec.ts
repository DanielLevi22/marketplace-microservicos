import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('exposes http_requests_total and http_request_duration_seconds after recording a request', async () => {
    service.recordHttpRequest(
      { method: 'GET', route: '/cart', statusCode: '200' },
      0.123,
    );

    const { contentType, metrics } = await service.getMetrics();

    expect(contentType).toContain('text/plain');
    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/cart"');
    expect(metrics).toContain('status_code="200"');
    expect(metrics).toContain('http_request_duration_seconds');
  });

  it('exposes Node.js default metrics', async () => {
    const { metrics } = await service.getMetrics();

    expect(metrics).toMatch(/process_|nodejs_/);
  });

  it('exposes orders_created_total after a checkout', async () => {
    service.incrementOrdersCreated();

    const { metrics } = await service.getMetrics();

    expect(metrics).toContain('orders_created_total 1');
  });

  it('exposes rabbitmq_messages_published_total with a queue label after a publish', async () => {
    service.incrementRabbitMessagesPublished('payment.order');

    const { metrics } = await service.getMetrics();

    expect(metrics).toContain('rabbitmq_messages_published_total');
    expect(metrics).toContain('queue="payment.order"');
  });

  it('does not collide across multiple instances (isolated registry per instance)', async () => {
    const other = new MetricsService();

    other.recordHttpRequest(
      { method: 'POST', route: '/cart/items', statusCode: '201' },
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
