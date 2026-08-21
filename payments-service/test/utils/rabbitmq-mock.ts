/**
 * Mocks para os e2e deste serviço.
 *
 * O `AppModule` sobe o `EventsModule`, que registra `PaymentConsumerService`
 * (tem `OnModuleInit` e chama `RabbitmqService.waitForConnection` /
 * `PaymentQueueService.consumePaymentOrders` -> `RabbitmqService.subscribeToQueue`
 * no bootstrap). Sobrepor `RabbitmqService` com este mock evita qualquer
 * conexão real via amqplib durante os testes.
 */
export function createRabbitmqServiceMock() {
  return {
    waitForConnection: jest.fn().mockResolvedValue(true),
    subscribeToQueue: jest.fn().mockResolvedValue(undefined),
    publishMessage: jest.fn().mockResolvedValue(undefined),
    getChannel: jest.fn(),
    getConnection: jest.fn(),
  };
}

/**
 * Mock de um `amqp.Channel`, usado pelo `DlqService` (via
 * `RabbitmqService.getChannel()`) nos testes de DLQ.
 */
export function createChannelMock() {
  return {
    checkQueue: jest.fn(),
    get: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn(),
    purgeQueue: jest.fn(),
  };
}
