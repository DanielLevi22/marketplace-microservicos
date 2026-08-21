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
  private readonly paymentsProcessedTotal: Counter;
  private readonly paymentsApprovedTotal: Counter;
  private readonly paymentsRejectedTotal: Counter<'reason'>;

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

    this.paymentsProcessedTotal = new Counter({
      name: 'payments_processed_total',
      help: 'Total de pagamentos processados (aprovados ou rejeitados)',
      registers: [this.registry],
    });

    this.paymentsApprovedTotal = new Counter({
      name: 'payments_approved_total',
      help: 'Total de pagamentos aprovados',
      registers: [this.registry],
    });

    this.paymentsRejectedTotal = new Counter({
      name: 'payments_rejected_total',
      help: 'Total de pagamentos rejeitados',
      labelNames: ['reason'],
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

  incrementPaymentsProcessed(): void {
    this.paymentsProcessedTotal.inc();
  }

  incrementPaymentsApproved(): void {
    this.paymentsApprovedTotal.inc();
  }

  incrementPaymentsRejected(reason: string): void {
    this.paymentsRejectedTotal.inc({ reason });
  }

  async getMetrics(): Promise<{ contentType: string; metrics: string }> {
    return {
      contentType: this.registry.contentType,
      metrics: await this.registry.metrics(),
    };
  }
}
