import type { Response } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  it('sets the registry content-type header and returns the metrics body', async () => {
    const metricsService = {
      getMetrics: jest.fn().mockResolvedValue({
        contentType: 'text/plain; version=0.0.4; charset=utf-8',
        metrics: 'http_requests_total 1\n',
      }),
    };
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const controller = new MetricsController(
      metricsService as unknown as MetricsService,
    );

    const body = await controller.getMetrics(res);

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4; charset=utf-8',
    );
    expect(body).toBe('http_requests_total 1\n');
  });
});
