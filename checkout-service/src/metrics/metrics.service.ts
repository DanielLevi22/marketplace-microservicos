import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export interface HttpRequestLabels {
  method: string;
  route: string;
  statusCode: string;
}

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequestsTotal: Counter<
    'method' | 'route' | 'status_code'
  >;
  private readonly httpRequestDurationSeconds: Histogram<
    'method' | 'route' | 'status_code'
  >;
  private readonly ordersCreatedTotal: Counter;
  private readonly rabbitmqMessagesPublishedTotal: Counter<'queue'>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total de requisicoes HTTP processadas',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duracao das requisicoes HTTP em segundos',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.ordersCreatedTotal = new Counter({
      name: 'orders_created_total',
      help: 'Total de pedidos criados',
      registers: [this.registry],
    });

    this.rabbitmqMessagesPublishedTotal = new Counter({
      name: 'rabbitmq_messages_published_total',
      help: 'Total de mensagens publicadas no RabbitMQ',
      labelNames: ['queue'],
      registers: [this.registry],
    });
  }

  recordHttpRequest(labels: HttpRequestLabels, durationSeconds: number): void {
    const promLabels = {
      method: labels.method,
      route: labels.route,
      status_code: labels.statusCode,
    };

    this.httpRequestsTotal.inc(promLabels);
    this.httpRequestDurationSeconds.observe(promLabels, durationSeconds);
  }

  incrementOrdersCreated(): void {
    this.ordersCreatedTotal.inc();
  }

  incrementRabbitMessagesPublished(queue: string): void {
    this.rabbitmqMessagesPublishedTotal.inc({ queue });
  }

  async getMetrics(): Promise<{ contentType: string; metrics: string }> {
    return {
      contentType: this.registry.contentType,
      metrics: await this.registry.metrics(),
    };
  }
}
