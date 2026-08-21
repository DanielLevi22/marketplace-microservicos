import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('exposes http_requests_total and http_request_duration_seconds after recording a request', async () => {
    service.recordHttpRequest(
      { method: 'GET', route: '/payments/:orderId', statusCode: '200' },
      0.123,
    );

    const { contentType, metrics } = await service.getMetrics();

    expect(contentType).toContain('text/plain');
    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/payments/:orderId"');
    expect(metrics).toContain('status_code="200"');
    expect(metrics).toContain('http_request_duration_seconds');
  });

  it('exposes Node.js default metrics', async () => {
    const { metrics } = await service.getMetrics();

    expect(metrics).toMatch(/process_|nodejs_/);
  });

  it('exposes payments_processed_total and payments_approved_total after an approved payment', async () => {
    service.incrementPaymentsProcessed();
    service.incrementPaymentsApproved();

    const { metrics } = await service.getMetrics();

    expect(metrics).toContain('payments_processed_total 1');
    expect(metrics).toContain('payments_approved_total 1');
  });

  it('exposes payments_rejected_total with a reason label after a rejected payment', async () => {
    service.incrementPaymentsProcessed();
    service.incrementPaymentsRejected('Limite excedido');

    const { metrics } = await service.getMetrics();

    expect(metrics).toContain('payments_rejected_total');
    expect(metrics).toContain('reason="Limite excedido"');
  });

  it('does not collide across multiple instances (isolated registry per instance)', async () => {
    const other = new MetricsService();

    other.recordHttpRequest(
      { method: 'GET', route: '/consumer-metrics', statusCode: '200' },
      0.05,
    );

    const [first, second] = await Promise.all([
      service.getMetrics(),
      other.getMetrics(),
    ]);

    expect(first.metrics).not.toContain('route="/consumer-metrics"');
    expect(second.metrics).toContain('route="/consumer-metrics"');
  });
});
