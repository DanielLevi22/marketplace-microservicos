import { ConsumerMetricsController } from './consumer-metrics.controller';
import {
  ConsumerMetrics,
  PaymentConsumerService,
} from '../payment-consumer/payment-consumer.service';

describe('ConsumerMetricsController', () => {
  let paymentConsumerService: {
    getMetrics: jest.Mock;
    resetMetrics: jest.Mock;
  };
  let controller: ConsumerMetricsController;

  function buildMetrics(overrides: Partial<ConsumerMetrics>): ConsumerMetrics {
    return {
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalRetries: 0,
      lastProcessedAt: null,
      startedAt: new Date('2026-01-01'),
      averageProcessingTime: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    paymentConsumerService = {
      getMetrics: jest.fn(),
      resetMetrics: jest.fn(),
    };
    controller = new ConsumerMetricsController(
      paymentConsumerService as unknown as PaymentConsumerService,
    );
  });

  describe('getHealth', () => {
    it('is healthy when nothing has been processed yet', () => {
      paymentConsumerService.getMetrics.mockReturnValue(buildMetrics({}));

      const result = controller.getHealth();

      expect(result.status).toBe('healthy');
      expect(result.checks).toEqual({
        isProcessing: true,
        hasGoodSuccessRate: true,
        hasLowFailures: true,
      });
    });

    it('is degraded when the success rate falls below 90%', () => {
      paymentConsumerService.getMetrics.mockReturnValue(
        buildMetrics({
          totalProcessed: 10,
          totalSuccess: 5,
          totalFailed: 5,
          lastProcessedAt: new Date(),
        }),
      );

      const result = controller.getHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks.hasGoodSuccessRate).toBe(false);
      expect(result.message).toContain('Success rate is below 90%');
    });

    it('is degraded when there are too many failures even with a good success rate', () => {
      paymentConsumerService.getMetrics.mockReturnValue(
        buildMetrics({
          totalProcessed: 1000,
          totalSuccess: 950,
          totalFailed: 100,
          lastProcessedAt: new Date(),
        }),
      );

      const result = controller.getHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks).toEqual({
        isProcessing: true,
        hasGoodSuccessRate: true,
        hasLowFailures: false,
      });
      expect(result.message).toBe('High number of failed messages');
    });

    it('is unhealthy when nothing was processed in the last 5 minutes', () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      paymentConsumerService.getMetrics.mockReturnValue(
        buildMetrics({
          totalProcessed: 10,
          totalSuccess: 10,
          totalFailed: 0,
          lastProcessedAt: sixMinutesAgo,
        }),
      );

      const result = controller.getHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.isProcessing).toBe(false);
      expect(result.message).toContain(
        'not processed messages in the last 5 minutes',
      );
    });
  });
});
