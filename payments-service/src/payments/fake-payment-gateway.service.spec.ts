import { FakePaymentGatewayService } from './fake-payment-gateway.service';

describe('FakePaymentGatewayService', () => {
  let service: FakePaymentGatewayService;

  beforeEach(() => {
    service = new FakePaymentGatewayService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function process(
    amount: number,
  ): ReturnType<FakePaymentGatewayService['process']> {
    const result = service.process(amount);
    await jest.runAllTimersAsync();
    return result;
  }

  it('rejects with "Limite excedido" when amount is greater than 10000', async () => {
    const result = await process(10000.01);

    expect(result).toEqual({
      approved: false,
      rejectionReason: 'Limite excedido',
    });
  });

  it('rejects with "Limite excedido" even when the amount also ends in .99', async () => {
    const result = await process(15000.99);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toBe('Limite excedido');
  });

  it('rejects with "Cartão recusado pela operadora" when amount ends in .99', async () => {
    const result = await process(199.99);

    expect(result).toEqual({
      approved: false,
      rejectionReason: 'Cartão recusado pela operadora',
    });
  });

  it('approves and returns a transactionId for any other amount', async () => {
    const result = await process(150.5);

    expect(result.approved).toBe(true);
    expect(result.rejectionReason).toBeUndefined();
    expect(typeof result.transactionId).toBe('string');
    expect(result.transactionId).toHaveLength(36);
  });

  it('approves the exact limit amount (10000)', async () => {
    const result = await process(10000);

    expect(result.approved).toBe(true);
  });

  it('simulates a latency between 500ms and 2000ms', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    await process(100);

    const delayMs = setTimeoutSpy.mock.calls[0][1] as number;
    expect(delayMs).toBeGreaterThanOrEqual(500);
    expect(delayMs).toBeLessThan(2000);
  });
});
